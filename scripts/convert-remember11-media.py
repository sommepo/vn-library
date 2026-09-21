#!/usr/bin/env python3
"""Batch owner-supplied Remember11 AFS resources. Outputs stay private."""
import argparse,concurrent.futures,json,sys,multiprocessing,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.adapters.remember11_media import convert
from vnkit.disc import write_json

def one(args):
 p,out,kind,tool=args
 try:return convert(p,out,kind,tool)
 except Exception as e:return {'source':str(p),'error':str(e)}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('resources',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--kind',choices=['image','voice','sound','music'],required=True);p.add_argument('--jobs',type=int,default=4);p.add_argument('--vgmtrans');a=p.parse_args()
 arcs={'image':['BG.AFS','EV.AFS','CHR.AFS'],'voice':['VOICE.AFS'],'sound':['SE.AFS'],'music':['BGM.AFS']}[a.kind]
 files=sorted(f for arc in arcs for f in (a.resources/arc).iterdir() if f.suffix==('.BIP' if a.kind in ['image','music'] else '.ADX'))
 a.out.mkdir(parents=True,exist_ok=True);results=[]
 with concurrent.futures.ProcessPoolExecutor(max_workers=a.jobs,mp_context=multiprocessing.get_context('spawn' if os.name=='nt' else 'fork')) as ex:
  for i,result in enumerate(ex.map(one,[(f,a.out,a.kind,a.vgmtrans) for f in files])):
   results.append(result)
   if i%100==0 or 'error' in result:print(f'{a.kind}: {i+1}/{len(files)}'+(' '+result['error'] if 'error' in result else ''),flush=True)
 errors=[r for r in results if 'error' in r];write_json(a.out,a.kind+'-conversion-'+__import__('hashlib').sha256(json.dumps(results,sort_keys=True).encode()).hexdigest()[:8]+'.json',results);print(a.kind,len(files),'errors',len(errors));return 2 if errors else 0
if __name__=='__main__':raise SystemExit(main())
