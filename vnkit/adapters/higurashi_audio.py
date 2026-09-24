"""Bounded, resumable batches through the existing pinned vgmstream decoder."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile
import wave
from .shin_ps2_graphics import voice_ads
from ..disc import FormatError, write_json


def convert(root, output, tool):
    root, output, tool = Path(root).resolve(), Path(output).resolve(), Path(tool).resolve()
    output.mkdir(parents=True, exist_ok=True)
    checkpoint=output/'audio-cache.json'
    cache=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    files=sorted(p for p in root.rglob('*') if p.suffix.lower() in ('.ads','.vds','.vag'))
    with tempfile.TemporaryDirectory(prefix='higurashi-audio-',dir=output) as tmp:
        tmp=Path(tmp)
        for start in range(0,len(files),128):
            jobs=[]
            for index,p in enumerate(files[start:start+128]):
                if not p.resolve().is_relative_to(root): raise FormatError('Audio source outside recovery')
                name=p.relative_to(root).as_posix(); data=p.read_bytes(); digest=hashlib.sha256(data).hexdigest()
                dest=output/(name+'.wav'); old=cache.get(name)
                if old and old['source_sha256']==digest and dest.is_file() and dest.stat().st_size==old['size']:
                    continue
                if dest.exists(): raise FormatError(f'Changed or untracked audio output: {name}')
                suffix=p.suffix.lower()
                if suffix=='.vds':data,_=voice_ads(data);suffix='.ads'
                inputname=f'{index:03d}{suffix}';(tmp/inputname).write_bytes(data)
                jobs.append((name,digest,inputname,dest))
            if jobs:
                with (output/'decoder.log').open('ab') as log:
                    result=subprocess.run([str(tool),'-i','-o','?f.wav',*[j[2] for j in jobs]],cwd=tmp,stdout=log,stderr=log,timeout=300,check=False)
                if result.returncode: raise FormatError(f'vgmstream exited {result.returncode}; see private decoder.log')
                for name,digest,inputname,dest in jobs:
                    wav=tmp/(inputname+'.wav')
                    with wave.open(str(wav)) as w:
                        metadata={'channels':w.getnchannels(),'sample_rate':w.getframerate(),'samples':w.getnframes()}
                        if w.getsampwidth()!=2 or not 1<=w.getnchannels()<=2 or not w.getnframes():
                            raise FormatError(f'Unexpected decoded audio: {name}')
                    dest.parent.mkdir(parents=True,exist_ok=True)
                    # Hard-link creates atomically without overwriting an existing file.
                    os.link(wav,dest);wav.unlink();(tmp/inputname).unlink()
                    cache[name]={'source_sha256':digest,'size':dest.stat().st_size,**metadata}
                temp=checkpoint.with_suffix('.tmp');temp.write_text(json.dumps(cache,separators=(',',':')));os.replace(temp,checkpoint)
            print(f'Audio {min(start+128,len(files))}/{len(files)}',flush=True)
    tracks=[p for p in files if p.suffix.lower()=='.ads']
    properties=[]
    for start in range(0,len(tracks),32):
        raw=subprocess.check_output([str(tool),'-m','-I',*[str(p) for p in tracks[start:start+32]]],text=True,timeout=120)
        properties.extend(json.loads(line) for line in raw.splitlines() if line.strip())
    if len(properties)!=len(tracks):raise FormatError('Incomplete audio metadata')
    write_json(output,'track-properties.json',{p.relative_to(root).as_posix():m for p,m in zip(tracks,properties)})
    return cache


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('recovery',type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--vgmstream',required=True,type=Path)
    a=p.parse_args();convert(a.recovery,a.out,a.vgmstream)

if __name__=='__main__':main()
