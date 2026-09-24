#!/usr/bin/env python3
"""Build an online Windows installer ZIP: allowlisted code + audited VGMTrans tool.

No discs, imported assets or user state are selected. Other dependencies are
checksum-locked downloads at installation, not bundled redistributions.
"""
import argparse, hashlib, io, json, re, subprocess, sys, tarfile, tempfile, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from vnkit.package import build
from vnkit.disc import write_bytes

def sha(data):return hashlib.sha256(data).hexdigest()
def put(z,name,data):
    info=zipfile.ZipInfo(name,(2026,9,21,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=ROOT/'dist/VN-Import-Toolkit-Windows-test.zip')
    p.add_argument('--vgmtrans',type=Path,default=ROOT/'private/tooling/windows-cross/build2/src/ui/shell/vgmtrans-shell.exe')
    p.add_argument('--source',type=Path,default=ROOT/'private/tooling/vgmtrans')
    p.add_argument('--code-package',type=Path,help='Reviewed allowlisted public source archive')
    p.add_argument('--version',default='0.1.0-beta.1',help='Version shown in Windows installed apps')
    a=p.parse_args();source=a.source.resolve()
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-z0-9.]+)?',a.version):raise ValueError('Invalid package version')
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
    if revision!='3e16daae49d42246f2d1b302b04f6e80a8037342':raise ValueError('Wrong VGMTrans revision')
    expected={'src/main/components/matcher/FilenameMatcher.h','src/main/formats/SonyPS2/SonyPS2Seq.cpp'}
    changed=set(subprocess.check_output(['git','diff','--name-only'],cwd=source,text=True).splitlines())
    if changed!=expected:raise ValueError('Unexpected VGMTrans modifications: '+repr(changed))
    # Permit only the two audited patches; the actual file list is checked below.
    for patch in (ROOT/'third_party/vgmtrans-filename-match.patch',ROOT/'scripts/vgmtrans-remember11-pressure.patch'):
        subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=source,check=True)
    binary=a.vgmtrans.read_bytes()
    if binary[:2]!=b'MZ':raise ValueError('Expected Windows executable')
    toolsrc=io.BytesIO()
    names=subprocess.check_output(['git','ls-files','--recurse-submodules','-z'],cwd=source).decode().split('\0')
    with zipfile.ZipFile(toolsrc,'w') as z:
        for name in sorted(n for n in names if n):
            path=source/name
            if path.is_symlink():raise ValueError('Unexpected source symlink: '+name)
            if path.is_file():put(z,'vgmtrans/'+name,path.read_bytes())
        put(z,'VNKit-changes.txt',b'VGMTrans revision '+revision.encode()+b'\nModified for VN Import Toolkit: filename matching and Sony PS2 channel pressure.\nThe two patches and cross-build instructions are in the accompanying application source.\nFull source, vendored libraries and licences are provided for rebuilding/relinking.\n')
        put(z,'GNU-GPL-3.txt',Path('/usr/share/common-licenses/GPL-3').read_bytes())
        notices=ROOT/'private/tooling/windows-cross/sysroot/usr/share/doc'
        for folder in ('gcc-mingw-w64-base','mingw-w64-common'):
            put(z,'compiler-notices/'+folder+'.txt',(notices/folder/'copyright').read_bytes())
    with tempfile.TemporaryDirectory() as tmp:
        package=a.code_package or Path(tmp)/'code.tar.gz'
        if not a.code_package:build(package)
        app=io.BytesIO()
        with zipfile.ZipFile(app,'w') as z,tarfile.open(package,'r:gz') as archive:
            for member in archive.getmembers():
                if member.isfile():put(z,member.name.removeprefix('vnkit/'),archive.extractfile(member).read())
            put(z,'tools/vgmtrans/vgmtrans-shell.exe',binary)
            put(z,'tools/vgmtrans/source.zip',toolsrc.getvalue())
            put(z,'tools/vgmtrans/build.json',json.dumps({'revision':revision,'sha256':sha(binary),'source_sha256':sha(toolsrc.getvalue()),'patches':{name:sha((ROOT/name).read_bytes()) for name in ('third_party/vgmtrans-filename-match.patch','scripts/vgmtrans-remember11-pressure.patch')}},indent=2).encode())
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w') as z:
            for name in ('Install.cmd','Install.ps1'):put(z,name,(ROOT/'windows'/name).read_bytes())
            put(z,'app.zip',app.getvalue())
            put(z,'bundle.json',json.dumps({'version':a.version,'sha256':sha(app.getvalue())}).encode())
            put(z,'READ-ME-FIRST.txt',b'Extract this ZIP completely, then double-click Install.cmd.\r\nWindows 10/11 x64 test build; internet required for verified runtime/tools.\r\nNo Python installation needed. No games are bundled.\r\nSetup does not change Linux services, firewall rules or system PATH.\r\nApp data: %LOCALAPPDATA%\\VN Import Toolkit\r\nTray Settings: configurable port; default 8891.\r\nEarly beta; see app.zip/README.md for tested scope and limitations.\r\n')
        write_bytes(a.out.parent,a.out.name,output.getvalue())
        print(json.dumps({'file':str(a.out.resolve()),'sha256':sha(output.getvalue()),'bytes':len(output.getvalue())}))
if __name__=='__main__':main()
