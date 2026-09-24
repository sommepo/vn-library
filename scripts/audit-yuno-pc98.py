#!/usr/bin/env python3
"""Audit recovered PC-98 YU-NO resources with external, pinned lime-juice.

Every output remains private. Parsing all files is not execution coverage.
The external GPL program is not linked into the MIT reader or importer.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.disc import sha256_file, write_bytes, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recovery', type=Path)
    parser.add_argument('--tools', type=Path, required=True, help='directory containing juice and juice-img')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    resources = args.recovery / 'resources'
    report = {'format': 'vnkit.yuno-resource-audit', 'version': 1, 'tools': {}, 'files': [], 'execution_tested': False}
    for name in ('juice', 'juice-img'):
        tool = (args.tools / name).resolve()
        result = subprocess.run([str(tool), '--version'], capture_output=True, timeout=10, check=True)
        report['tools'][name] = {'sha256': sha256_file(tool), 'version': result.stdout.decode('utf8', 'replace').strip()}
    failures = 0
    for source in sorted(resources.iterdir()):
        if source.suffix not in ('.MES', '.GP4'):
            continue
        is_mes = source.suffix == '.MES'
        relative = ('decompiled/' if is_mes else 'graphics/') + source.stem + ('.rkt' if is_mes else '.png')
        record = {'source': source.name, 'source_sha256': sha256_file(source), 'output': relative}
        with tempfile.TemporaryDirectory(prefix='vnkit-yuno-audit-') as tmp:
            output = Path(tmp) / Path(relative).name
            tool = 'juice' if is_mes else 'juice-img'
            switches = ['-d', '-p', 'yuno', '--protag', 'none'] if is_mes else ['-d', '-W', '0']
            result = subprocess.run([str((args.tools / tool).resolve()), *switches, '-o', str(output), str(source.resolve())], capture_output=True, timeout=30)
            record['returncode'] = result.returncode
            if result.returncode or not output.is_file() or b'warning:' in result.stdout.lower() or b'recovery skip' in result.stderr.lower():
                failures += 1
                write_bytes(args.out, 'failures/' + source.name + '.log', result.stdout + result.stderr)
            else:
                data = output.read_bytes()
                if not is_mes:
                    raw = source.read_bytes()
                    x, y, wm, hm = struct.unpack_from('>4H', raw)
                    record['source_bounds'] = [x, y, wm + 1, hm + 1]
                    if data[:8] != b'\x89PNG\r\n\x1a\n':
                        raise ValueError(f'{source.name}: decoder did not return a PNG')
                    record['png_dimensions'] = list(struct.unpack_from('>II', data, 16))
                record['sha256'] = write_bytes(args.out, relative, data)['sha256']
        report['files'].append(record)
    report['failures'] = failures
    report['counts'] = {suffix: sum(f['source'].endswith(suffix) for f in report['files']) for suffix in ('.MES', '.GP4')}
    write_json(args.out, 'audit.json', report)
    print(json.dumps({'counts': report['counts'], 'failures': failures, 'execution_tested': False}))
    return bool(failures)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise SystemExit(f'yuno-pc98-audit: {error}')
