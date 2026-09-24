"""Write a private structural audit of the exact Cartagra recovery.

No playable content is produced; glyphs remain source IDs. Instruction recovery
and Japanese Unicode decoding are distinct achievements.
"""
import argparse
import base64
from collections import Counter
import json
from pathlib import Path
from ..disc import FormatError, write_json
from .cartagra_ps2 import script_names, native_tables, EXE
from .cartagra_script import parse_all, string_tokens


def audit(root, out):
    root, out = Path(root), Path(out)
    executable = (root/EXE).read_bytes()
    names = script_names(executable)
    write_json(out, 'native.json', native_tables(executable))
    summary = {'format':'vnkit.cartagra-audit','version':1,'playable':False,
               'unicode_verified':False,'scripts':[], 'instructions':0,
               'strings':0,'errors':[], 'opcode_counts':{},'used_glyphs':[]}
    glyphs=set();ops=Counter()
    for index,name in enumerate(names):
        data=(root/'SCRIPT.DAT'/name).read_bytes(); r=parse_all(data,name)
        r['strings']=[]
        for offset in r['string_offsets']:
            tokens,end=string_tokens(data,offset)
            r['strings'].append({'offset':offset,'end':end,'tokens':tokens})
            glyphs.update(t['glyph'] for t in tokens if 'glyph' in t)
        r['raw_base64']=base64.b64encode(data).decode('ascii')
        r['resource_index']=index
        write_json(out,'scripts/'+name+'.json',r)
        ops.update(i['op'] for i in r['instructions'].values())
        summary['instructions']+=len(r['instructions'])
        summary['strings']+=len(r['strings'])
        summary['scripts'].append({'name':name,'index':index,'instructions':len(r['instructions']),
                                   'labels':len(r['labels']),'errors':len(r['errors'])})
        summary['errors'].extend({'script':name,**e} for e in r['errors'])
    summary['opcode_counts']={f'{op:04x}':count for op,count in sorted(ops.items())}
    summary['used_glyphs']=sorted(glyphs)
    write_json(out,'audit.json',summary)
    return summary


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('recovery',type=Path);p.add_argument('--out',required=True,type=Path)
    a=p.parse_args()
    try:
        r=audit(a.recovery,a.out)
        print(json.dumps({k:r[k] for k in ('playable','unicode_verified','instructions','strings')},indent=2))
        print(f"{len(r['scripts'])} scripts; {len(r['used_glyphs'])} used glyph IDs; {len(r['errors'])} structural stops")
        raise SystemExit(3 if r['errors'] else 0)
    except (OSError,ValueError) as e:p.exit(2,str(e)+'\n')


if __name__=='__main__':main()
