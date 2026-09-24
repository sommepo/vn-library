#!/usr/bin/env python3
"""Audit a private SLPM-66913 recovery; success is not story execution.

Standard-library only. Work is sequential and image buffers are released after
each file. Reports/optional PNGs contain game data and must stay private.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit import __version__
from vnkit.disc import FormatError, safe_name, sha256_file, write_bytes, write_json
from vnkit.adapters.higurashi_ps2 import ADAPTER_VERSION, EXE, EXE_SHA256
from vnkit.adapters.higurashi_script import compact_table, decode_text, parse_all
from vnkit.adapters.shin_ps2_graphics import picture, portrait_planes, voice_ads


def source_file(root, name):
    safe_name(name)
    path = root / name
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise FormatError(f'Missing or unsafe recovered resource: {name}')
    return path


def resource_tables(data, end, available):
    """Audit fixed native name records; this does not resolve dynamic VM loads."""
    if end + 48 > len(data):
        raise FormatError('Missing SNR resource directory')
    offsets = struct.unpack_from('<12I', data, end)
    tables = []
    layouts = {1: (26, 24, 'picture', '.pic'), 2: (40, 24, 'bustup', '.bup'),
               3: (36, 24, 'anime', '.anp'), 4: (44, 12, 'bgm', '.ads'),
               5: (24, 24, 'se', '.ads'), 6: (16, 12, 'movie', '.pss')}
    for number, offset in enumerate(offsets):
        if offset < end + 48 or offset + 4 > len(data):
            raise FormatError('SNR resource table outside resource')
        size = struct.unpack_from('<I', data, offset)[0]
        if offset + 4 + size > len(data):
            raise FormatError('Truncated SNR resource table')
        row = {'index': number, 'offset': offset, 'size': size}
        if number in layouts:
            stride, name_size, folder, suffix = layouts[number]
            if size % stride:
                raise FormatError(f'SNR table {number} has incomplete records')
            names = []
            for i in range(size // stride):
                at = offset + 4 + i*stride
                raw = data[at:at+name_size].split(b'\0', 1)[0]
                name = raw.decode('cp932', 'strict')
                path = f'{folder}/{name}{suffix}'.casefold()
                names.append({'index': i, 'offset': at, 'name': name,
                              'path': available.get(path), 'present': path in available})
            row.update(records=names, missing=sum(not n['present'] for n in names))
        tables.append(row)
    return tables


def audit_scripts(root, output, available, write_script):
    data = source_file(root, 'main.snr').read_bytes()
    exe = source_file(root, EXE).read_bytes()
    table = compact_table(exe)
    parsed = parse_all(data)
    errors = parsed['errors'][:]
    strings = 0
    for instruction in parsed['instructions']:
        for string in instruction['strings']:
            try:
                string['decoded_with_markup'] = decode_text(bytes.fromhex(string['bytes']), table)
                strings += 1
            except (UnicodeError, FormatError) as error:
                errors.append({'source': instruction['id'], 'offset': string['offset'], 'error': str(error)})
    tables = resource_tables(data, parsed['code_end'], available)
    write_json(output, 'resource-tables.json', tables)
    if write_script:
        write_json(output, 'parsed-script.json', parsed)
    summary = {k:v for k,v in parsed.items() if k != 'instructions'}
    summary.update(instructions=len(parsed['instructions']), strings_decoded=strings,
                   text_format='Source CP932/compact kana decoded; inline commands retained, not reader segments',
                   executable_sha256=hashlib.sha256(exe).hexdigest(),
                   script_sha256=hashlib.sha256(data).hexdigest(),
                   errors=errors, semantic_execution_tested=False,
                   static_resource_names_missing=sum(t.get('missing', 0) for t in tables))
    write_json(output, 'scripts.json', summary)
    return summary


def audit_images(root, output, members, write_media):
    results, errors = [], []
    for name in members:
        if not name.endswith(('.pic', '.bup')):
            continue
        try:
            data = source_file(root, name).read_bytes()
            if name.endswith('.pic'):
                metadata, png = picture(data)
                images = [('image', png)]
            else:
                metadata, images = portrait_planes(data)
            result = {'source': name, 'sha256': hashlib.sha256(data).hexdigest(), 'metadata': metadata,
                      'images': [{'key': key, 'sha256': hashlib.sha256(png).hexdigest()} for key,png in images]}
            if write_media:
                for key, png in images:
                    write_bytes(output, f'images/{name}/{key}.png', png)
            results.append(result)
        except (OSError, ValueError) as error:
            errors.append({'source': name, 'error': str(error)})
    report = {'decoded': len(results), 'errors': errors, 'files': results,
              'portrait_composition_verified': False, 'execution_tested': False}
    write_json(output, 'images.json', report)
    return {'decoded': len(results), 'errors': errors}


def audit_audio(root, output, members, write_media, vgmstream=None):
    """Header/extent checks for all ADS/VDS; not a full waveform-decoding claim."""
    formats, errors, samples = Counter(), [], {}
    for name in members:
        extension = Path(name).suffix
        if extension not in ('.vds', '.ads', '.vag'):
            continue
        try:
            path = source_file(root, name)
            length = path.stat().st_size
            with path.open('rb') as f:
                head = f.read(12)
                offset = 0
                if extension == '.vds':
                    if head[:4] != b'VDS ':
                        raise FormatError('Invalid VDS header')
                    offset = 8 + struct.unpack_from('<I', head, 4)[0]
                    if offset > 1024*1024:
                        raise FormatError('VDS metadata exceeds audit bound')
                f.seek(offset)
                audio = f.read(64)
            if extension == '.vag':
                if audio[:4] != b'VAGp':
                    raise FormatError('Unknown VAG header')
            else:
                if len(audio) < 40 or audio[:4] != b'SShd' or audio[32:36] != b'SSbd':
                    raise FormatError('Invalid Sony ADS header')
                payload = struct.unpack_from('<I', audio, 36)[0]
                if offset + 40 + payload > length:
                    raise FormatError('Sony ADS payload extends beyond resource')
            if extension not in samples:
                samples[extension] = {'source': name, 'audio_offset': offset}
                if extension == '.vds' and write_media:
                    ads, _ = voice_ads(path.read_bytes())
                    write_bytes(output, 'voice-sample.ads', ads)
            formats[extension] += 1
        except (OSError, ValueError, struct.error) as error:
            errors.append({'source': name, 'error': str(error)})
    report = {'headers_checked': dict(formats), 'errors': errors, 'samples': samples,
              'all_waveforms_decoded': False, 'execution_tested': False}
    if vgmstream:
        tool = str(Path(vgmstream).resolve())
        report['tool_sha256'] = sha256_file(Path(tool))
        report['decoded_samples'] = []
        for extension, sample in samples.items():
            path = source_file(root, sample['source'])
            with tempfile.TemporaryDirectory(prefix='vnkit-higurashi-audio-') as tmp:
                if extension == '.vds':
                    ads, _ = voice_ads(path.read_bytes())
                    path = Path(tmp)/'voice.ads'
                    path.write_bytes(ads)
                # Decode once, without loops or a large WAV output on disk.
                result = subprocess.run([tool, '-i', '-O', str(path.resolve())],
                                        capture_output=True, timeout=30)
            write_bytes(output, f'audio-sample-{extension[1:]}.log', result.stdout+result.stderr)
            report['decoded_samples'].append({'source': sample['source'], 'returncode': result.returncode})
            if result.returncode:
                errors.append({'source': sample['source'], 'error': 'vgmstream sample decode failed'})
    write_json(output, 'audio.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recovery', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--kind', choices=['all', 'scripts', 'images', 'audio'], default='all')
    parser.add_argument('--write-script', action='store_true', help='Keep source-located decoded instructions in the private output')
    parser.add_argument('--write-media', action='store_true', help='Keep PNG planes and one voice ADS in the private output')
    parser.add_argument('--verify-files', action='store_true', help='Compare every recovered member hash with the extraction manifest')
    parser.add_argument('--vgmstream', type=Path, help='Optional existing vgmstream-cli; decode one sample per audio container')
    args = parser.parse_args()
    root = args.recovery
    manifest = json.loads(source_file(root, 'recovery-manifest.json').read_text())
    if sha256_file(source_file(root, EXE)) != EXE_SHA256:
        raise FormatError('Untested Higurashi executable')
    members = [row['name'] for row in manifest['outputs']]
    if len(members) > 150000 or len(set(members)) != len(members):
        raise FormatError('Invalid recovery manifest inventory')
    available = {name.casefold(): name for name in members}
    if len(available) != len(members):
        raise FormatError('Ambiguous recovery paths')
    report = {'format': 'vnkit.higurashi-recovery-audit', 'version': 1,
              'toolkit_version': __version__, 'adapter_version': ADAPTER_VERSION,
              'recovery_manifest_sha256': sha256_file(root/'recovery-manifest.json'),
              'recovered_members': len(members), 'kind': args.kind,
              'playable': False, 'errors': [], 'files_hash_verified': 0}
    for row in manifest['outputs']:
        path = source_file(root, row['name'])
        if path.stat().st_size != row['size']:
            report['errors'].append({'source': row['name'], 'error': 'Recovered file size differs from manifest'})
        elif args.verify_files:
            if sha256_file(path) != row['output']['sha256']:
                report['errors'].append({'source': row['name'], 'error': 'Recovered file hash differs from manifest'})
            else:
                report['files_hash_verified'] += 1
    if args.kind in ('all', 'scripts'):
        report['scripts'] = audit_scripts(root, args.out, available, args.write_script)
    if args.kind in ('all', 'images'):
        report['images'] = audit_images(root, args.out, members, args.write_media)
    if args.kind in ('all', 'audio'):
        report['audio'] = audit_audio(root, args.out, members, args.write_media, args.vgmstream)
    report['warnings'] = []
    if report.get('scripts', {}).get('static_resource_names_missing'):
        report['warnings'].append('Some resource-table names have no recovered file; see resource-tables.json. Dynamic resource resolution is not tested.')
    failures = len(report['errors']) + sum(len(report.get(k, {}).get('errors', [])) for k in ('scripts','images','audio'))
    failures += len(report.get('scripts', {}).get('unresolved_targets', []))
    report['failures'] = failures
    write_json(args.out, 'audit.json', report)
    print(json.dumps({k: report[k] for k in ('recovered_members','files_hash_verified','failures','playable')}))
    return 1 if failures else 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        raise SystemExit(f'higurashi-audit: {error}')
