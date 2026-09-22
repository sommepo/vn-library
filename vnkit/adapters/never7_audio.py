"""Never7 CRI audio, using the existing AFS reader and ADX/FLAC pipeline.

Exact edition only. Stale AFS filename-row sizes are retained in the manifest;
bounded member-table extents and actual ADX headers remain authoritative.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import subprocess
from pathlib import Path
from ..disc import FormatError, write_bytes, write_json
from ..source import Source
from .cri_afs import index_afs
from .never7_ps2 import detect
from .remember11_media import convert


def convert_audio(source, work, jobs=2):
    if not detect(source)['supported']:raise FormatError('Untested Never7 edition')
    if not 1 <= jobs <= 4:raise FormatError('Choose 1–4 audio workers')
    s=Source(source);work=Path(work);inputs=[];index={}
    for resource,kind in [(0x980,'voice'),(0x981,'sound'),(0x982,'music')]:
        archive=f'A980/A{resource:03X}.'
        members=index_afs(s,archive,allow_stale_name_sizes=True);index[archive]=members
        for m in members:
            raw=s.read_at(archive,m['offset'],m['size'])
            if raw[:2]!=b'\x80\x00':raise FormatError(f'{archive}:{m["index"]}: unexpected audio header')
            rel=f'original/A{resource:03X}/{m["index"]:05d}-{m["name"]}'
            write_bytes(work,rel,raw);inputs.append((work/rel,kind,resource,m['index'],m))
    def one(item):
        file,kind,resource,index,m=item
        # All three archives contain already-streamed ADX, including the songs;
        # they must not go through Remember11's sequenced music-bank decoder.
        result=convert(file,work/'converted','sound' if kind=='music' else kind)
        return {'id':f'{kind}:{(resource<<16)|index}',**result,'type':kind,'source_extent':m}
    rows=[]
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for i,row in enumerate(pool.map(one,inputs)):
            rows.append(row)
            if i%250==0:print(f'Audio {i+1}/{len(inputs)}',flush=True)
    tool=subprocess.run(['ffmpeg','-version'],capture_output=True,text=True,check=True,timeout=10).stdout.splitlines()[0]
    report={'format':'vnkit.never7-audio','version':1,'tool':tool,'assets':rows,'archive_members':index,
            'warnings':['Filename-row size metadata is stale; source-located AFS extents are retained.',
                        'Sequenced BGM is separate and is not rendered by this command.']}
    write_json(work,'audio-manifest.json',report)
    return {'assets':len(rows),'out':str(work),'tool':tool}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--work',type=Path,required=True);p.add_argument('--jobs',type=int,default=2);a=p.parse_args()
    try:print(json.dumps(convert_audio(a.source,a.work,a.jobs),indent=2))
    except (OSError,ValueError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
