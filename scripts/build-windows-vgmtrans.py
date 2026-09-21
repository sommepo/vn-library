#!/usr/bin/env python3
"""Cross-build the pinned patched VGMTrans on Linux, using an isolated MinGW cache.

Preparation: bootstrap the pinned VGMTrans source with bootstrap-remember11-media.py.
The source is read-only here; no game content is needed. See docs/windows-build.md.
"""
import argparse, hashlib, json, os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REVISION='3e16daae49d42246f2d1b302b04f6e80a8037342'

def run(args,**kwargs):
    return subprocess.run([str(a) for a in args],check=True,**kwargs)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,default=ROOT/'private/tooling/vgmtrans')
    p.add_argument('--out',type=Path,default=ROOT/'private/tooling/windows-cross')
    a=p.parse_args();source=a.source.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
    if revision!=REVISION:raise ValueError('Unexpected VGMTrans source revision')
    for patch in (ROOT/'third_party/vgmtrans-filename-match.patch',ROOT/'scripts/vgmtrans-remember11-pressure.patch'):
        run(['git','apply','--reverse','--check',patch],cwd=source)
    lock=json.loads((ROOT/'windows/cross-tools.lock.json').read_text())
    debs=out/'debs';debs.mkdir(exist_ok=True);sysroot=out/'sysroot'
    for item in lock:
        file=debs/item['file']
        if not file.exists():run(['apt-get','download',item['package']+'='+item['version']],cwd=debs)
        if hashlib.file_digest(file.open('rb'),'sha256').hexdigest()!=item['sha256']:raise ValueError('Cross compiler checksum mismatch: '+str(file))
        run(['dpkg-deb','-x',file,sysroot])
    with tempfile.TemporaryDirectory(prefix='vnkit-cross-') as temp:
        temp=Path(temp);(temp/'compiler').symlink_to(sysroot);(temp/'source').symlink_to(source)
        # A path without spaces avoids Make's handling of an executable in a spaced prefix.
        (temp/'host').symlink_to(ROOT/'private/tooling/audio-sysroot')
        cmake=temp/'host/usr/bin/cmake';make=temp/'host/usr/bin/make';prefix=temp/'compiler/usr/bin/x86_64-w64-mingw32-'
        toolchain=temp/'toolchain.cmake'
        toolchain.write_text(f'''set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_C_COMPILER "{prefix}gcc-posix")
set(CMAKE_CXX_COMPILER "{prefix}g++-posix")
set(CMAKE_RC_COMPILER "{prefix}windres")
set(CMAKE_FIND_ROOT_PATH "{temp}/compiler/usr/x86_64-w64-mingw32")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_EXE_LINKER_FLAGS "-static -static-libgcc -static-libstdc++")
''')
        env=dict(os.environ);env['PATH']=str(temp/'compiler/usr/bin')+':'+str(temp/'host/usr/bin')+':'+env.get('PATH','');env['LD_LIBRARY_PATH']=str(temp/'host/usr/lib/x86_64-linux-gnu')
        build=out/'repro-build'
        run([cmake,'-S',temp/'source','-B',build,'-DCMAKE_TOOLCHAIN_FILE='+str(toolchain),'-DCMAKE_MAKE_PROGRAM='+str(make),'-DCMAKE_BUILD_TYPE=Release','-DENABLE_UI_QT=OFF','-DENABLE_SHELL=ON','-DBUILD_LTO=OFF'],env=env)
        run([cmake,'--build',build,'--target','vgmtrans-shell','-j','4'],env=env)
        print(build/'src/ui/shell/vgmtrans-shell.exe')
if __name__=='__main__':main()
