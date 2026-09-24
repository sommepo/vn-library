#!/usr/bin/env python3
"""Build the pinned external MIT PC-98 core with bounded parallelism.

Supply local NP2kai-wasm and emsdk checkouts. --install-sdk downloads only the
pinned compiler, within the supplied SDK directory. First compilation may fetch
Emscripten's pinned SDL/font/PNG ports. No game data is used or uploaded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REVISION = '57e86e3d7b9216984224b6c73bfb707b3e307a1f'
SDK_REVISION = 'c0bb220cb6e6f4e0fabb6f6db9efd53390ef5e56'
SDK_VERSION = '4.0.23'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--sdk', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--host-tools', type=Path, help='optional private Linux CMake/library sysroot')
    p.add_argument('--install-sdk', action='store_true')
    args = p.parse_args()
    for folder, revision in ((args.source, REVISION), (args.sdk, SDK_REVISION)):
        actual = subprocess.check_output(['git', '-C', str(folder), 'rev-parse', 'HEAD'], text=True).strip()
        if actual != revision:
            raise ValueError(f'Expected {revision}, got {actual} in {folder}')
    if subprocess.check_output(['git', '-C', str(args.source), 'status', '--porcelain'], text=True).strip():
        raise ValueError('Use an unchanged upstream core checkout')
    sdk = args.sdk.resolve()
    if args.install_sdk:
        subprocess.run([sys.executable, str(sdk / 'emsdk.py'), 'install', SDK_VERSION], check=True, timeout=900)
    subprocess.run([sys.executable, str(sdk / 'emsdk.py'), 'activate', SDK_VERSION, '--embedded'], check=True, timeout=60)
    args.out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, EMCC_CORES='2', CMAKE_BUILD_PARALLEL_LEVEL='2')
    patch = Path(__file__).with_name('np2kai-hrtimer-state.patch')
    with tempfile.TemporaryDirectory(prefix='vnkit-np2-build-') as temporary:
        tmp = Path(temporary)
        source = tmp / 'source'
        shutil.copytree(args.source, source, ignore=shutil.ignore_patterns('.git'))
        # Patches alter only a temporary copy. Normalize the original table's
        # line endings for standard patch tools on both Linux and Windows.
        table = source / 'statsave.tbl';table.write_text(table.read_text(), newline='\n')
        subprocess.run(['patch', '-p1', '--batch', '--forward', '-i', str(patch.resolve())], cwd=source, check=True, timeout=20)
        alias = tmp / 'sdk';alias.symlink_to(sdk, target_is_directory=True)
        env['PATH'] = str(alias / 'upstream/emscripten') + os.pathsep + env.get('PATH', '')
        if args.host_tools:
            host = tmp / 'host';host.symlink_to(args.host_tools.resolve(), target_is_directory=True)
            env['PATH'] = str(host / 'usr/bin') + os.pathsep + env['PATH']
            env['LD_LIBRARY_PATH'] = str(host / 'usr/lib/x86_64-linux-gnu') + os.pathsep + env.get('LD_LIBRARY_PATH', '')
        # Avoid the source's git-describe dependency in this temporary copy.
        env['NP2KAI_VERSION'], env['NP2KAI_HASH'] = 'vnkit-research', REVISION[:12]
        build = tmp / 'build'
        subprocess.run(['emcmake', 'cmake', '-S', str(source), '-B', str(build), '-DCMAKE_BUILD_TYPE=Release'], env=env, check=True, timeout=120)
        subprocess.run(['cmake', '--build', str(build), '--target', 'emnp21kai_sdl2', '--parallel', '2'], env=env, check=True, timeout=900)
        manifest = dict(format='vnkit.pc98-core-build', version=1, source=REVISION, sdk=SDK_VERSION,
                        patch_sha256=hashlib.sha256(patch.read_bytes()).hexdigest(), files={})
        for name, path in (('emnp21kai_sdl2.js', build / 'emnp21kai_sdl2.js'),
                           ('emnp21kai_sdl2.wasm', build / 'emnp21kai_sdl2.wasm'),
                           ('LICENSE.NP2kai', source / 'LICENSE')):
            data = path.read_bytes();destination = args.out / name
            if destination.exists():
                if destination.read_bytes() != data:
                    raise ValueError(f'Output differs; use a new directory: {destination}')
            else:
                with destination.open('xb') as f:
                    f.write(data)
            manifest['files'][name] = hashlib.sha256(data).hexdigest()
        text = json.dumps(manifest, indent=2) + '\n'
        destination = args.out / 'build.json'
        if destination.exists() and destination.read_text() != text:
            raise ValueError('Build manifest differs; choose a new output directory')
        destination.write_text(text)
    print(f'Built private experimental PC-98 core: {args.out}')


if __name__ == '__main__':
    main()
