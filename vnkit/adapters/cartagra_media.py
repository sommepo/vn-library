"""Prepare private Cartagra media. This is recovery, not a playable import.

Images retain their source dimensions. ADX is decoded through the existing KID
audio helper into lossless FLAC. Movies are extracted for the existing bounded
PSS converter. No font OCR or unverified text is promoted to reader content.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

from ..disc import FormatError, safe_name, write_bytes, write_json, write_stream
from ..source import Source
from .cartagra_ps2 import EXE, EXE_SHA256, detect
from .cartagra_graphics import decode
from .pia_media import _png
from .remember11_media import convert, digest

VERSION = '0.1.0'
IMAGES = ('BG.DAT', 'BG2.DAT', 'CHARA.DAT', 'CHARA2.DAT', 'SYSTEM.DAT')
AUDIO = {'BGM.AFS': 'music', 'SE.AFS': 'sound', 'VOICE.AFS': 'voice'}


def adx_loop(data):
    """Version 3 loop fields, in source sample units; absent loops stay absent."""
    if len(data) < 20 or data[:2] != b'\x80\x00':
        raise FormatError('Expected original CRI ADX audio')
    header_end = struct.unpack_from('>H', data, 2)[0] + 4
    rate, samples = struct.unpack_from('>II', data, 8)
    if not rate or header_end > len(data):
        raise FormatError('Invalid ADX header')
    if data[18] != 3:
        raise FormatError(f'Untested ADX version {data[18]}')
    if header_end < 44 or not struct.unpack_from('>I', data, 24)[0]:
        return {}
    start = struct.unpack_from('>I', data, 28)[0]
    end = struct.unpack_from('>I', data, 36)[0]
    if not 0 <= start < end <= samples:
        raise FormatError('ADX loop lies outside the decoded samples')
    return {'loopStart': start / rate, 'loopEnd': end / rate,
            'loop_samples': {'start': start, 'end': end, 'rate': rate}}


def convert_resources(recovery, out, kind):
    recovery, out = Path(recovery), Path(out)
    if digest(recovery / EXE) != EXE_SHA256:
        raise FormatError('Untested Cartagra executable')
    inventory = json.loads((recovery / 'manifest.json').read_text())
    archives = IMAGES if kind == 'images' else AUDIO
    rows = []
    for archive in archives:
        for member in inventory['archives'][archive]:
            index = member['index']
            if type(index) is not int or not 0 <= index < 10000:
                raise FormatError('Invalid media resource index')
            safe_name(member['name'])
            if '/' in member['name'] or '\\' in member['name']:
                raise FormatError('Expected a media member filename')
            name = member['name'] if kind == 'images' else f'{index:05d}-{member["name"]}'
            source = recovery / archive / name
            if kind == 'images':
                if archive == 'SYSTEM.DAT' and index == 24:
                    continue  # original font, not a CPS image
                rel = f'images/{archive}/{name}.png'
                recordpath = out / (rel + '.json')
                if recordpath.exists():
                    row = json.loads(recordpath.read_text())
                    if (row.get('converter') != VERSION or row['source_sha256'] != digest(source)
                            or row['sha256'] != digest(out / rel)):
                        raise FormatError('Changed image source/cache; use a new output folder')
                else:
                    raw = source.read_bytes()
                    width, height, rgba = decode(raw)
                    result = write_bytes(out, rel, _png(width, height, 4, rgba))
                    row = {'source': f'{archive}/{name}', 'source_sha256': hashlib.sha256(raw).hexdigest(),
                           'url': rel, 'sha256': result['sha256'], 'width': width, 'height': height,
                           'converter': VERSION, 'type': 'image'}
                    write_json(out, rel + '.json', row)
            else:
                loop = adx_loop(source.read_bytes())
                # All BGM in this title are streamed ADX, not Sony sequences.
                row = {**convert(source, out, 'voice' if archive == 'VOICE.AFS' else 'sound'),
                       'type': AUDIO[archive], **loop}
            rows.append({'archive': archive, 'index': index, **row})
            if len(rows) % 250 == 0:
                print(f'{kind}: {len(rows)} resources prepared', flush=True)
    report = {'format': 'vnkit.cartagra-media', 'version': 1, 'converter': VERSION,
              'playable': False, 'assets': rows,
              'warnings': ['Native SYSTEM font still requires a verified Unicode mapping.',
                           'SOUND.DAT system-instrument bank has not been rendered.']}
    if kind == 'audio':
        report['tool'] = subprocess.run(['ffmpeg', '-version'], check=True, timeout=10,
                                       capture_output=True, text=True).stdout.splitlines()[0]
    write_json(out, kind + '-manifest.json', report)
    return {'kind': kind, 'converted': len(rows), 'out': str(out), 'playable': False}


def extract_movies(source, out):
    if not detect(source)['supported']:
        raise FormatError('Untested Cartagra disc')
    source, out = Source(source), Path(out)
    rows = []
    for name in source.entries:
        if not name.endswith('.PSS'):
            continue
        result = write_stream(out, name, source.chunks(name))
        result.pop('status', None)
        rows.append(result)
    if len(rows) != 5:
        raise FormatError('Expected the five movies from the tested Cartagra disc')
    write_json(out, 'manifest.json', {'format': 'vnkit.cartagra-movies-source', 'version': 1,
                                    'executable_sha256': EXE_SHA256, 'movies': rows})
    return {'extracted': len(rows), 'out': str(out)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path, help='Recovered archives, or ISO for movies')
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--kind', required=True, choices=('images', 'audio', 'movies'))
    a = p.parse_args()
    try:
        result = extract_movies(a.source, a.out) if a.kind == 'movies' else convert_resources(a.source, a.out, a.kind)
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, subprocess.SubprocessError) as e:
        p.exit(2, str(e) + '\n')


if __name__ == '__main__':
    main()
