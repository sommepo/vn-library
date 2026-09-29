"""Original PS1 TIM artwork and XA voice recovery for exact Memories Off.

Pixels retain native dimensions. Presentation uses the native 512x240 coordinate
grid at 4:3, including the horizontal crop stored in the TIM CLUT X high byte.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..png import encode
from .memoriesoff_ps1 import identify, table_resource, unpack

ROOT = Path(__file__).resolve().parents[2]


def tim(data, portrait=False):
    if len(data) < 544 or struct.unpack_from('<2I', data) != (16, 9):
        raise FormatError('Memories Off expects its 8-bit indexed TIM variant')
    length, cx, cy, cw, ch = struct.unpack_from('<I4H', data, 8)
    if (length, cy, cw, ch) != (524, 0, 256, 1) or cx & 255:
        raise FormatError('unexpected Memories Off TIM palette metadata')
    declared, x, y, words, height = struct.unpack_from('<I4H', data, 532)
    width = words * 2
    if not (0 < width <= 512 and height in (240, 480) and x == y == 0):
        raise FormatError('unexpected Memories Off TIM image geometry')
    # Source crop files retain the full-width template block length. The actual
    # extent is independently checked against the decoded buffer and dimensions.
    if declared not in (width * height + 12, 512 * height + 12) or len(data) != 544 + width * height:
        raise FormatError('Memories Off TIM pixel extent mismatch')
    palette = []
    for index in range(256):
        word = struct.unpack_from('<H', data, 20 + index * 2)[0]
        channels = [(word >> shift) & 31 for shift in (0, 5, 10)]
        # Native portrait upload 8001bddc clears bytes 0x212..213: CLUT 255.
        # PS1 zero-colour pixels are transparent; palette index zero is not.
        palette.append(bytes([*(v * 255 // 31 for v in channels),
                              0 if portrait and (index == 255 or word == 0) else 255]))
    pixels = b''.join(palette[index] for index in data[544:])
    return {'width': width, 'height': height, 'crop_x': cx >> 8}, encode(width, height, pixels)


def artwork(cue, out, references):
    disc, exe = identify(cue)
    out = Path(out)
    assets, missing = {}, []
    for kind, base, count in [('background', 0x8006ad60, 193), ('portrait', 0x8006b058, 816)]:
        for index in sorted(references[kind]):
            # Native 80023184 uses a separate CG table for IDs >= 100.
            extent = (table_resource(exe, 0x8006aee4, index - 100, 93)
                      if kind == 'background' and index >= 100
                      else table_resource(exe, base, index, count))
            if extent is None:
                missing.append({'id': f'{kind}:{index}', 'reason': 'null source table entry'})
                continue
            packed = disc.read_at(extent['lba'] * 2048, extent['sectors'] * 2048)
            info, png = tim(unpack(packed), portrait=kind == 'portrait')
            url = f'images/{kind}/{index:04}.png'
            record = write_bytes(out, url, png)
            assets[f'{kind}:{index}'] = {'type': 'image', 'url': url, **info,
                                        'sha256': record['sha256'], 'source': extent}
    result = {'assets': assets, 'missing': missing}
    write_json(out, 'artwork.json', result)
    return result


def tools():
    sysroot = ROOT / 'private/tooling/audio-sysroot'
    ffmpeg = sysroot / 'usr/bin/ffmpeg'
    env = os.environ.copy()
    if ffmpeg.is_file():
        env['LD_LIBRARY_PATH'] = ':'.join(str(sysroot / p) for p in
                                        ['usr/lib/x86_64-linux-gnu', 'usr/lib/x86_64-linux-gnu/pulseaudio'])
    else:
        found = shutil.which('ffmpeg')
        if not found:
            raise FormatError('FFmpeg is required for PS1 XA audio conversion')
        ffmpeg = Path(found)
    return str(ffmpeg), env


def voices(cue, out, references, workers=2):
    disc, exe = identify(cue)
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools()
    tool_version = subprocess.run([ffmpeg, '-version'], env=env, capture_output=True,
                                  check=True, timeout=10).stdout.splitlines()[0].decode()

    def convert_group(group):
        extent = table_resource(exe, 0x8006cf90, group, 169)
        if extent is None:
            raise FormatError(f'missing XA group {group}')
        selected = {index % 32: index for index in references if index // 32 == group}
        channels = {channel: bytearray() for channel in selected}
        for sector in disc.raw_sectors(extent['lba'], extent['sectors']):
            file, channel, submode, coding = sector[16:20]
            if not submode & 4:
                continue
            if file != 1 or not submode & 0x20 or coding != 4 or channel > 31:
                raise FormatError(f'unexpected XA coding in group {group}')
            if channel in channels:
                channels[channel].extend(sector)
        rows, missing = {}, []
        for channel, raw in channels.items():
            index = selected[channel]
            if not raw:
                missing.append(index)
                continue
            cache = out / f'cache/voice-{index:04}.json'
            url = f'audio/voice/{index:04}.flac'
            import hashlib
            digest = hashlib.sha256(raw).hexdigest()
            if cache.exists():
                row = json.loads(cache.read_text())
                if row['source_sha256'] != digest or row['sha256'] != sha256_file(out / url):
                    raise FormatError('XA cache differs; use a new work directory')
            else:
                with tempfile.TemporaryDirectory(prefix='.xa-', dir=out) as temporary:
                    temporary = Path(temporary)
                    (temporary / 'source.xa').write_bytes(raw)
                    subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-threads', '1',
                                    '-f', 'psxstr', '-i', str(temporary / 'source.xa'), '-map', '0:a:0',
                                    '-c:a', 'flac', '-threads', '1', str(temporary / 'voice.flac')],
                                   env=env, capture_output=True, check=True, timeout=60)
                    with (temporary / 'voice.flac').open('rb') as stream:
                        record = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
                row = {'type': 'voice', 'url': url, 'sha256': record['sha256'],
                       'source_sha256': digest, 'source': {**extent, 'channel': channel},
                       'duration': len(raw) // 2352 * 4032 / 18900}
                write_json(out, f'cache/voice-{index:04}.json', row)
            rows[f'voice:{index}'] = row
        return rows, missing

    assets, missing = {}, []
    groups = sorted({index // 32 for index in references})
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(workers, 4))) as pool:
        for n, (rows, absent) in enumerate(pool.map(convert_group, groups), 1):
            assets.update(rows)
            missing.extend(absent)
            if n % 10 == 0 or n == len(groups):
                print(f'XA voice groups {n}/{len(groups)}', flush=True)
    result = {'assets': assets, 'missing': missing, 'ffmpeg': tool_version}
    write_json(out, 'voices.json', result)
    return result
