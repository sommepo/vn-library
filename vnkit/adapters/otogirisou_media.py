"""Original SLPS-01645 scene images and reviewed selectable source-font atlas.

MDEC decoding uses the external FFmpeg decoder with the native 320×240 frame.
Resource association and presentation are owned by the source interpreter.
"""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from ..disc import FormatError, write_bytes, write_json, sha256_file
from ..png import encode
from .memoriesoff_media import tools
from .otogirisou_data import checked_sources, font_pages, resources, story_banks
from .chunsoft_ps1_media import unpack_otogirisou


def indexed_scene(data):
    """Native 256-colour CLUT followed by one 320×240 texture."""
    if len(data) != 512 + 320 * 240:
        raise FormatError('Otogirisou indexed scene extent')
    palette = [bytes([*((word >> shift & 31) * 255 // 31 for shift in (0, 5, 10)), 255])
               for word in struct.unpack_from('<256H', data)]
    return encode(320, 240, b''.join(palette[index] for index in data[512:]))


def font(exe, cdimg, review):
    pages = font_pages(exe, cdimg)
    expected = {f'{i:02}': hashlib.sha256(raw).hexdigest() for i, raw in enumerate(pages)}
    if review.get('format') not in ('vnkit.otogirisou-font-review', 'private.otogirisou-font-review') or review.get('texture_hashes') != expected:
        raise FormatError('Otogirisou glyph review differs from source textures')
    width, height, rgba, metrics = 1024, 512, bytearray(1024 * 512 * 4), {}
    for page, raw in enumerate(pages):
        pixels = bytes(v for b in raw for v in (b & 15, b >> 4))
        x, y = (page % 4) * 256, (page // 4) * 256
        for at, value in enumerate(pixels):
            pos = ((y + at // 256) * width + x + at % 256) * 4
            rgba[pos:pos + 4] = bytes((255, 255, 255, value * 17))
    for index in range(1745):
        flags, size, uv, clut = struct.unpack_from('<4H', exe, 2048 + 0x4b9b4 + (index + 256) * 8)
        page = (flags & 15) - 12 + (4 if flags & 16 else 0)
        w, h, u, v = size >> 8, size & 255, uv >> 8, uv & 255
        row = review.get('glyphs', {}).get(str(index), {})
        text = row.get('text')
        if not 0 <= page < 8 or not 0 < w <= 32 or not 0 < h <= 32 or u + w > 256 or v + h > 256:
            raise FormatError('Otogirisou font descriptor extent')
        if not isinstance(text, str) or len(text) != 1 or ord(text) < 32 or row.get('method') not in (
                'source bitmap visual review', 'unique cropped bitmap identity with native CP932 font'):
            raise FormatError(f'Otogirisou glyph {index} lacks a reviewed correspondence')
        metrics[str(index)] = {'text': text, 'width': w, 'height': h,
                              'u': (page % 4) * 256 + u, 'v': (page // 4) * 256 + v,
                              'bearing': flags >> 12, 'clut': clut}
    return {'width': width, 'height': height, 'metrics': metrics,
            'review_version': review['version'], 'independent_human_proofread': False,
            'texture_hashes': expected, 'png': encode(width, height, rgba)}


def convert(exe, cdimg, output, review):
    checked_sources(exe, cdimg)
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools()
    assets, unresolved = {}, []
    for row in resources(exe, cdimg):
        if row['kind'] != 'scene':
            continue
        data, index = row['bytes'], row['id']
        if index in (3, 168):
            offsets = struct.unpack_from('<2I', data)
            if offsets[0] != 0 or not 0 < offsets[1] < len(data) - 128:
                raise FormatError('Otogirisou paired scene directory')
            # 8001d7fc uploads two independent textures and CLUTs. Preserve
            # both; choosing/blending them belongs to the source compositor.
            for variant, at in enumerate(offsets):
                raw, consumed = unpack_otogirisou(data[128 + at:])
                end = 128 + (offsets[1] if variant == 0 else len(data) - 128)
                if 128 + at + consumed > end or any(data[128 + at + consumed:end]):
                    raise FormatError('Otogirisou paired scene stream extent')
                url = f'images/scene/{index:03}-{variant}.png'
                record = write_bytes(out, url, indexed_scene(raw))
                assets[f'scene:{index}:{variant}'] = {'type': 'image', 'url': url,
                    'width': 320, 'height': 240, 'sha256': record['sha256'],
                    'source_sha256': hashlib.sha256(data).hexdigest()}
            continue
        if data[2:4] != b'\0\x38':
            unresolved.append({'id': index, 'sha256': hashlib.sha256(data).hexdigest(),
                               'kind': 'auxiliary-script' if 205 <= index <= 209 else 'native-texture'})
            continue
        key, url = f'scene:{index}', f'images/scene/{index:03}.png'
        cache = out / f'cache/{index:03}.json'
        source_hash = hashlib.sha256(data).hexdigest()
        if cache.exists():
            record = json.loads(cache.read_text())
            if record['source_sha256'] != source_hash or record['sha256'] != sha256_file(out / url):
                raise FormatError('Otogirisou image cache differs; use a new output directory')
        else:
            with tempfile.TemporaryDirectory(prefix='.mdec-', dir=out.resolve()) as temporary:
                temporary = Path(temporary)
                (temporary / 'source.bs').write_bytes(data)
                result = subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-f', 'image2',
                    '-c:v', 'mdec', '-video_size', '320x240', '-threads', '1',
                    '-i', str(temporary / 'source.bs'), '-frames:v', '1', '-threads', '1',
                    str(temporary / 'image.png')], env=env, capture_output=True, timeout=30, check=True)
                if result.stderr:
                    raise FormatError(f'Otogirisou scene {index}: MDEC decode reported an error')
                png = (temporary / 'image.png').read_bytes()
                if png[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack_from('>II', png, 16) != (320, 240):
                    raise FormatError('Otogirisou decoded frame size mismatch')
                record = write_bytes(out, url, png)
            record = {'sha256': record['sha256'], 'source_sha256': source_hash}
            write_json(out, str(cache.relative_to(out)), record)
        assets[key] = {'type': 'image', 'url': url, 'width': 320, 'height': 240, **record}
    native_font = font(exe, cdimg, review)
    record = write_bytes(out, 'images/font.png', native_font.pop('png'))
    assets['font:native'] = {'type': 'image', 'url': 'images/font.png', 'sha256': record['sha256'],
                           'width': native_font['width'], 'height': native_font['height']}
    write_json(out, 'font.json', native_font)
    scripts = {}
    for script in story_banks(exe, cdimg):
        url = f'scripts/{script["id"]:02}.json'
        write_json(out, url, script)
        scripts[str(script['id'])] = {'url': url, 'sha256': script['sha256']}
    result = {'assets': assets, 'scripts': scripts, 'unresolved_resources': unresolved}
    write_json(out, 'artwork.json', result)
    return {'images': len(assets) - 1, 'script_banks': len(scripts), 'auxiliary_resources': len(unresolved)}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', type=Path, required=True)
    parser.add_argument('--cdimg', type=Path, required=True)
    parser.add_argument('--review', type=Path, help='Override the bundled, source-bound glyph correspondence')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    from .otogirisou_charset import bundled_review
    review = json.loads(args.review.read_text()) if args.review else bundled_review()
    print(convert(args.exe.read_bytes(), args.cdimg.read_bytes(), args.out, review))
