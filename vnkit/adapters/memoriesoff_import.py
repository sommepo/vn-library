"""Build a private source-driven Memories Off PS1 reader from verified recovery."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from .memoriesoff_ps1 import EXE_SHA256, FONT_SHA256, parse_script
from .memoriesoff_text import verify_font, decode


def build(recovery, artwork, voices, music, output):
    recovery, artwork, voices, music, out = map(Path, (recovery, artwork, voices, music, output))
    if sha256_file(recovery / 'source/SLPS_022.96') != EXE_SHA256:
        raise FormatError('Memories Off executable identity mismatch')
    verify_font((recovery / 'source/font.bin').read_bytes())
    assets, scripts, files, unresolved = {}, {}, [], []
    for folder, name in [(artwork, 'artwork.json'), (voices, 'voices.json'), (music, 'music.json')]:
        manifest = json.loads((folder / name).read_text())
        if manifest.get('missing'):
            raise FormatError('Memories Off media conversion has missing references')
        for key, item in manifest['assets'].items():
            url = item['url']
            if Path(url).is_absolute() or any(x.startswith('.') for x in Path(url).parts):
                raise FormatError('Unsafe converted media path')
            src = folder / url
            if src.is_symlink() or sha256_file(src) != item['sha256']:
                raise FormatError('Converted Memories Off media hash mismatch')
            with src.open('rb') as stream:
                record = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
            record.pop('status', None); files.append(record)
            assets[key] = {k: v for k, v in item.items() if k in ('url','type','sha256','width','height','crop_x','duration','loopStart','loopEnd')}
    for source in sorted((recovery / 'source/scripts').glob('*.bin')):
        script_id = str(int(source.stem))
        script = parse_script(source.read_bytes(), script_id)
        script.update(format='vnkit.memoriesoff-script', version=1)
        for i in script['instructions']:
            if 'raw_text' in i:
                text = decode(bytes.fromhex(i['raw_text']))
                if i['code'] == 0x10:
                    i['text'] = text.removesuffix('\n')
                else:
                    i['options'] = text.removesuffix('\n').split('\n')
            if 'unresolved_target' in i:
                unresolved.append({'id': i['id'], 'target': i['target']})
        url = f'scripts/{int(script_id):02}.json'
        record = write_bytes(out, url, json.dumps(script, ensure_ascii=False, separators=(',', ':')).encode())
        record.pop('status', None); files.append(record)
        scripts[script_id] = {'url': url, 'sha256': script['sha256']}
        assets[f'script:{script_id}'] = {'type': 'script', 'url': url, 'sha256': record['sha256']}
    if len(scripts) != 46:
        raise FormatError('Incomplete Memories Off scenario recovery')
    content = {'format': 'vnkit.content', 'version': 1, 'id': 'memoriesoff-slps02296',
               'title': 'Memories Off', 'platform': {'id': 'ps1', 'name': 'PlayStation'},
               'viewport': {'width': 640, 'height': 480}, 'adapter': {'id': 'memoriesoff-ps1', 'version': '0.1.0'},
               'runtime': {'id': 'memoriesoff-ps1', 'version': 1, 'entry': '0', 'scripts': scripts,
                           'executable_sha256': EXE_SHA256, 'font_sha256': FONT_SHA256},
               'assets': assets, 'compatibility': {'status': 'experimental',
               'summary': 'Source-driven PS1 reader. Native animation and SPU synthesis remain approximate; six source end-of-buffer branch targets stay fail-closed.'}}
    write_json(out, 'content.json', content)
    write_json(out, 'compatibility.json', {**content['compatibility'], 'unresolved_targets': unresolved,
                                          'unicode': '36 custom font slots visually reviewed; no independent proofread'})
    write_json(out, 'manifest.json', {'format': 'vnkit.import-manifest', 'version': 1,
                                    'adapter': content['adapter'], 'files': files,
                                    'source': {'executable_sha256': EXE_SHA256, 'font_sha256': FONT_SHA256}})
    return content


def import_game(source, out, work=None):
    from .memoriesoff_ps1 import recover
    from .memoriesoff_media import artwork as convert_artwork, voices as convert_voices, tools, ROOT
    source, out = Path(source), Path(out)
    work = Path(work or out.parent / (out.name + '-work'))
    recovery, art, voice, music = [work / name for name in ('recovery-v1','media-v3','media-v1','music-v1')]
    recover(source, recovery)
    references = {'background': set(), 'portrait': set(), 'voice': set()}
    for p in (recovery / 'scripts').glob('*.json'):
        for i in json.loads(p.read_text())['instructions']:
            a = i['args']
            if i['code'] in (0x31, 0x32): references['background'].add(a[0] + 256*a[1])
            if i['code'] == 0x30: references['portrait'].add(a[2] + 256*a[3])
            if i['code'] == 0x85: references['voice'].add(a[1] + 256*a[2])
    convert_artwork(source, art, references)
    convert_voices(source, voice, references['voice'])
    regular = Path(os.environ.get('VNKIT_VGMTRANS', ROOT / 'private/tooling/vgmtrans-shell-unmodified'))
    short = Path(os.environ.get('VNKIT_MEMORIESOFF_SHORT_VGMTRANS', ROOT / 'private/memoriesoff/tooling/vgmtrans-short-vab'))
    if not regular.is_file() or not short.is_file():
        raise FormatError('Memories Off needs VGMTrans and the documented short-VAB converter; see docs/memoriesoff-runtime.md')
    _, env = tools()
    subprocess.run([sys.executable, '-u', '-m', 'vnkit.adapters.memoriesoff_music', str(source),
                    '--out', str(music), '--vgmtrans', str(regular), '--short-vgmtrans', str(short)],
                   env=env, check=True, timeout=1800)
    c = build(recovery, art, voice, music, out)
    return {'status': 'incomplete-runtime', 'gameId': c['id'], 'out': str(out), 'assets': len(c['assets']),
            'warnings': [c['compatibility']['summary']]}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('recovery', 'artwork', 'voices', 'music', 'out'):
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args()
    c = build(a.recovery, a.artwork, a.voices, a.music, a.out)
    print(json.dumps({'gameId': c['id'], 'assets': len(c['assets']), 'status': 'experimental'}))
