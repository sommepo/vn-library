"""Convert verified private 428 recovery resources; never admit a reader build."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from ..disc import FormatError, write_bytes, write_json
from ..psp_gim import decode
from .pia_media import _png


def artwork(recovery, output):
    root, out = Path(recovery), Path(output)
    report = json.loads((root / 'recovery.json').read_text())
    if report.get('adapter') != '428-psp' or not report.get('recovered_members'):
        raise FormatError('428 full private resource recovery required')
    recovered = {r['path']: r for r in report['recovered_members']}
    opaque = set(report.get('opaque_stored_members', []))
    assets, errors, count = {}, [], 0
    for archive in report['archive_index']:
        name = Path(archive['path']).stem
        if not re.fullmatch(r'[a-z0-9_]+', name):
            raise FormatError('Unsafe archive identity')
        for member in archive['members']:
            if not member['name'].endswith('.gim'):
                continue
            number = member['id']
            if not isinstance(number, int) or not 0 <= number <= 0xffffffff:
                raise FormatError('Invalid recovered member ID')
            path = f'members/{name}/{number:08x}.bin'
            if path in opaque:
                continue
            src = root / path
            if src.is_symlink() or any(p.is_symlink() for p in src.parents):
                raise FormatError('Symlink in recovered member path')
            data = src.read_bytes()
            if path not in recovered or hashlib.sha256(data).hexdigest() != recovered[path]['sha256']:
                raise FormatError('Recovered resource identity mismatch')
            try:
                pictures = decode(data)
                for index, picture in enumerate(pictures):
                    url = f'images/{name}/{number:08x}-{index}.png'
                    record = write_bytes(out, url, _png(picture['width'], picture['height'], 4, picture['rgba']))
                    assets[f'image:{name}:{number}:{index}'] = {
                        'type': 'image', 'url': url, 'sha256': record['sha256'],
                        'width': picture['width'], 'height': picture['height'],
                        'source_sha256': recovered[path]['sha256'], 'source_format': picture['format']}
            except FormatError as error:
                errors.append({'path': path, 'error': str(error)})
            count += 1
            if count % 250 == 0:
                print(json.dumps({'converted_members': count, 'pictures': len(assets), 'errors': len(errors)}), flush=True)
    result = {'format': 'vnkit.428-artwork', 'version': 1, 'assets': assets,
              'members': count, 'errors': errors, 'playable': False}
    write_json(out, 'artwork.json', result)
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('recovery', type=Path)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    result = artwork(a.recovery, a.out)
    print(json.dumps({'members': result['members'], 'pictures': len(result['assets']), 'errors': len(result['errors'])}))
    raise SystemExit(3 if result['errors'] else 0)
