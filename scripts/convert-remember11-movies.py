#!/usr/bin/env python3
"""Lossless browser derivatives of the owner's original PSS video and PCM."""
import sys,json,concurrent.futures,argparse,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.adapters.pia_movie import convert_movie,verify_movie
from vnkit.disc import write_json
from vnkit.adapters.remember11_movie import convert_silent

def one(args):
 source,out,*limits=args;limit=limits[0] if limits else 512*1024*1024;out=out/source.stem
 try:
  p=out/(source.stem+'.vp9.mp4.json')
  if p.exists():
   info=json.loads(p.read_text())
   if info['source_sha256']!=hashlib.sha256(source.read_bytes()).hexdigest() or info['movie_sha256']!=hashlib.sha256((out/info['movie']).read_bytes()).hexdigest():raise ValueError('Movie cache differs; use fresh output')
  else:
   try:info=convert_movie(source,out,max_bytes=limit)
   except ValueError as e:
    if str(e)!='Private audio lacks complete SShd/SSbd headers':raise
    info=convert_silent(source,out)
  check=out/'roundtrip.json'
  if not check.exists():write_json(out,'roundtrip.json',verify_movie(source,out/info['movie'],max_bytes=limit))
  return {'source':source.name,'url':str((out/info['movie']).relative_to(out.parent.parent)), 'sha256':info['movie_sha256'],'roundtrip':True}
 except Exception as e:return {'source':source.name,'error':str(e)}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--max-mib',type=int,choices=(512,1024),default=512);p.add_argument('--jobs',type=int,choices=(1,2),default=2);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.jobs) as ex:
  result=[]
  for r in ex.map(one,[(s,a.out,a.max_mib*1024*1024) for s in sorted(a.source.glob('*.PSS'))]):result.append(r);print(r,flush=True)
 write_json(a.out,'conversion-'+hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()[:8]+'.json',result);raise SystemExit(2 if any('error' in r for r in result) else 0)
