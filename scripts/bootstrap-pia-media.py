#!/usr/bin/env python3
"""Reproduce this import's private Ubuntu audio tools without installing services.

Requires a compatible Ubuntu 26.04 amd64 host, apt, dpkg-deb, git and Python.
The locked packages are unpacked locally; no maintainer script is run. Upstream
VGMTrans is built at its pinned revision with our documented matching patch.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
TOOLS=ROOT/'private/tooling'
REVISION='3e16daae49d42246f2d1b302b04f6e80a8037342'


def run(argv,**kwargs):
    return subprocess.run([str(a) for a in argv],check=True,**kwargs)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cached-only',action='store_true',help='verify already downloaded packages and built converter without network/build')
    args=parser.parse_args()
    lock=json.loads((ROOT/'scripts/audio-tools.lock.json').read_text())
    archives=TOOLS/'audio-debs';sysroot=TOOLS/'audio-sysroot';archives.mkdir(parents=True,exist_ok=True)
    for package in lock['packages']:
        archive=archives/package['filename']
        if not archive.is_file():
            if args.cached_only:raise ValueError(f'Missing locked package {archive.name}')
            run(['apt-get','download',package['package']+'='+package['version']],cwd=archives)
        if hashlib.sha256(archive.read_bytes()).hexdigest()!=package['sha256']:
            raise ValueError(f'Checksum mismatch: {archive.name}')
        if not args.cached_only:run(['dpkg-deb','--extract',archive,sysroot])
    source=TOOLS/'vgmtrans';binary=TOOLS/'vgmtrans-build/src/ui/shell/vgmtrans-shell'
    if not source.is_dir():
        if args.cached_only:raise ValueError('Pinned VGMTrans source absent')
        run(['git','clone','--no-checkout','https://github.com/vgmtrans/vgmtrans.git',source])
        run(['git','checkout','--detach',REVISION],cwd=source)
        run(['git','submodule','update','--init','--recursive','lib/fmt','lib/spdlog','lib/zlib','lib/libchdr'],cwd=source)
    actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
    if actual!=REVISION:raise ValueError('VGMTrans source revision differs; preserve it and use a clean tools directory')
    patch=ROOT/'third_party/vgmtrans-filename-match.patch'
    applied=subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=source,capture_output=True).returncode==0
    if not applied:
        if args.cached_only:raise ValueError('VGMTrans extension matching patch absent')
        run(['git','apply','--check',patch],cwd=source);run(['git','apply',patch],cwd=source)
    if not binary.is_file():
        if args.cached_only:raise ValueError('VGMTrans executable absent')
        env=os.environ.copy();env['PATH']=str(sysroot/'usr/bin')+':'+env.get('PATH','')
        env['LD_LIBRARY_PATH']=str(sysroot/'usr/lib/x86_64-linux-gnu')
        env['XDG_CONFIG_HOME']=str(TOOLS/'audio-config')
        # GCC helper discovery is reliable through a temporary path without
        # spaces. The target remains entirely inside the private tools cache.
        with tempfile.TemporaryDirectory(prefix='vnkit-audio-build-') as temporary:
            alias=Path(temporary)/'sysroot';alias.symlink_to(sysroot)
            run([sysroot/'usr/bin/cmake','-S',source,'-B',TOOLS/'vgmtrans-build',
                 '-DCMAKE_BUILD_TYPE=Release','-DENABLE_UI_QT=OFF','-DENABLE_SHELL=ON','-DBUILD_LTO=OFF',
                 '-DCMAKE_C_COMPILER='+str(alias/'usr/bin/gcc'),'-DCMAKE_CXX_COMPILER='+str(alias/'usr/bin/g++'),
                 '-DCMAKE_MAKE_PROGRAM='+str(alias/'usr/bin/make')],env=env)
            run([sysroot/'usr/bin/cmake','--build',TOOLS/'vgmtrans-build','--target','vgmtrans-shell','-j','4'],env=env)
    print(json.dumps(dict(verified_packages=len(lock['packages']),vgmtrans_revision=actual,binary=str(binary),
                         binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest())))


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,subprocess.SubprocessError) as error:
        raise SystemExit('pia-media-bootstrap: '+str(error))
