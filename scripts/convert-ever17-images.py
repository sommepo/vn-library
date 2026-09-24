#!/usr/bin/env python3
"""Convert all original Ever17 scene frames, bounded and resumable."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.adapters.ever17_graphics import convert
from vnkit.disc import write_json


def one(args):
    source,out = args
    try:
        return convert(source,out)
    except Exception as e:
        return {'source':str(source),'error':str(e)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('resources',type=Path)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--jobs',type=int,choices=(1,2),default=2)
    a = p.parse_args()
    files = sorted(f for arc in ('BG.AFS','EV.AFS','CHR.AFS') for f in (a.resources/arc).glob('*.BIP'))
    if not files:
        p.error('No extracted scene images found')
    results = []
    with ProcessPoolExecutor(max_workers=a.jobs,mp_context=multiprocessing.get_context('spawn' if os.name=='nt' else 'fork')) as pool:
        for i,result in enumerate(pool.map(one,((f,a.out) for f in files))):
            results.append(result)
            if i%100 == 0 or 'error' in result:
                print(f"Images: {i+1}/{len(files)} {result.get('error','')}",flush=True)
    errors = sum('error' in r for r in results)
    key = hashlib.sha256(json.dumps(results,sort_keys=True).encode()).hexdigest()[:12]
    write_json(a.out,'image-conversion-'+key+'.json',results)
    print(f'{len(files)} images; {errors} failures')
    return 2 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
