#!/usr/bin/env python3
"""Compare current default parsing to an existing private Remember11 import.

This does not execute the game or modify its files/saves. All source data stay
private. A successful result establishes parser-output stability, not fidelity.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.source import Source
from vnkit.disc import write_json
from vnkit.adapters.cri_afs import index_afs,unpack_lzss
from vnkit.adapters.remember11_script import Script,native_metadata
from vnkit.adapters.remember11_import import DATA

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('source',type=Path)
p.add_argument('installed',type=Path)
p.add_argument('out',type=Path)
a=p.parse_args()
s=Source(a.source);commands=native_metadata(s.read_at('SLPM_655.50'))['commands']
checked=0;differences=[]
for row in index_afs(s,'MAC.AFS'):
    if row['index'] in DATA:continue
    name=f'{row["index"]:05d}-{row["name"]}'
    expected=json.loads((a.installed/'scripts'/(name+'.json')).read_text(encoding='utf-8'))
    current=Script(unpack_lzss(s.read_at('MAC.AFS',row['offset'],row['size'])),name,commands).discover()
    if current!=expected:differences.append(name)
    checked+=1
report={'checked':checked,'different_scripts':differences,'scope':'Default decoder compared with installed private script JSON; no execution'}
write_json(a.out,'report.json',report)
print(json.dumps(report));sys.exit(1 if differences else 0)
