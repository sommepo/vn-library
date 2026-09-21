#!/usr/bin/env python3
"""Install pinned local media tools and an isolated Remember11 VGMTrans build."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];TOOLS=ROOT/'private/tooling'
def run(args,**kwargs):subprocess.run([str(x) for x in args],check=True,**kwargs)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cached-only',action='store_true');a=p.parse_args()
 # This older helper installs tools only. It never opens a Pia/game disc.
 run(['python3',ROOT/'scripts/bootstrap-pia-media.py',*(['--cached-only'] if a.cached_only else [])])
 source=TOOLS/'vgmtrans';patch=ROOT/'scripts/vgmtrans-remember11-pressure.patch';binary=TOOLS/'remember11-vgmtrans-shell';receipt=TOOLS/'remember11-vgmtrans.json'
 applied=subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=source,capture_output=True).returncode==0
 if not applied:
  if a.cached_only:raise ValueError('Remember11 channel-pressure patch absent')
  run(['git','apply','--check',patch],cwd=source);run(['git','apply',patch],cwd=source)
 if not binary.exists():
  if a.cached_only:raise ValueError('Remember11 VGMTrans binary absent')
  sysroot=TOOLS/'audio-sysroot';env=dict(os.environ);env['PATH']=str(sysroot/'usr/bin')+':'+env.get('PATH','');env['LD_LIBRARY_PATH']=str(sysroot/'usr/lib/x86_64-linux-gnu');env['XDG_CONFIG_HOME']=str(TOOLS/'audio-config')
  with tempfile.TemporaryDirectory(prefix='vnkit-r11-build-') as temp:
   alias=Path(temp)/'sysroot';alias.symlink_to(sysroot);build=TOOLS/'remember11-vgmtrans-build'
   run([sysroot/'usr/bin/cmake','-S',source,'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DENABLE_UI_QT=OFF','-DENABLE_SHELL=ON','-DBUILD_LTO=OFF','-DCMAKE_C_COMPILER='+str(alias/'usr/bin/gcc'),'-DCMAKE_CXX_COMPILER='+str(alias/'usr/bin/g++'),'-DCMAKE_MAKE_PROGRAM='+str(alias/'usr/bin/make')],env=env)
   run([sysroot/'usr/bin/cmake','--build',build,'--target','vgmtrans-shell','-j','4'],env=env);shutil.copy2(build/'src/ui/shell/vgmtrans-shell',binary)
 data={'patch_sha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()}
 if receipt.exists() and json.loads(receipt.read_text())!=data:raise ValueError('Converter receipt mismatch; preserve old build and investigate')
 if not receipt.exists():receipt.write_text(json.dumps(data,indent=2))
 print(json.dumps(data))
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,subprocess.SubprocessError) as e:raise SystemExit('remember11-media-bootstrap: '+str(e))
