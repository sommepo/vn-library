#!/usr/bin/env python3
"""Build the pinned external GPL recovery tools, with at most two compiler jobs.

Supply a local checkout; this script neither downloads game data nor bundles
upstream source into VN Library. A normal C++17 compiler and CMake are required.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REVISION = 'dc00362a0d7e9f52931040119080b1435d26724a'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--compiler-root', type=Path, help='optional private Linux sysroot, not required on a normal development machine')
    args = p.parse_args()
    revision = subprocess.check_output(['git', '-C', str(args.source), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != REVISION:
        raise SystemExit(f'Expected lime-juice revision {REVISION}, got {revision}')
    if subprocess.check_output(['git', '-C', str(args.source), 'status', '--porcelain'], text=True).strip():
        raise SystemExit('Use an unchanged upstream checkout')
    args.out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    with tempfile.TemporaryDirectory(prefix='vnkit-juice-build-') as tmp:
        # Make does not handle whitespace in compiler paths consistently.
        # Private aliases are used only during the build; outputs are ordinary files.
        tmp = Path(tmp)
        source = tmp / 'source';source.symlink_to(args.source.resolve(), target_is_directory=True)
        if args.compiler_root:
            host = tmp / 'host';host.symlink_to(args.compiler_root.resolve(), target_is_directory=True)
            env['PATH'] = str(host / 'usr/bin') + os.pathsep + env.get('PATH', '')
            env['LD_LIBRARY_PATH'] = str(host / 'usr/lib/x86_64-linux-gnu') + os.pathsep + env.get('LD_LIBRARY_PATH', '')
            env['CC'], env['CXX'] = str(host / 'usr/bin/gcc'), str(host / 'usr/bin/g++')
        subprocess.run(['cmake', '-S', str(source), '-B', str(tmp / 'build'), '-DCMAKE_BUILD_TYPE=Release'], env=env, check=True, timeout=60)
        subprocess.run(['cmake', '--build', str(tmp / 'build'), '--target', 'juice', 'juice-img', '--parallel', '2'], env=env, check=True, timeout=600)
        for name in ('juice', 'juice-img'):
            binary = tmp / 'build' / (name + ('.exe' if os.name == 'nt' else ''))
            destination = args.out / binary.name
            if destination.exists():
                if destination.read_bytes() != binary.read_bytes():
                    raise SystemExit(f'Output differs; choose a fresh tool directory: {destination}')
            else:
                shutil.copy2(binary, destination)
    print(f'Built external lime-juice {REVISION}: {args.out}')


if __name__ == '__main__':
    main()
