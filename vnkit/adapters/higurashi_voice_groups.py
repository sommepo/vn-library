"""Render native simultaneous voice lists without changing individual sources."""
import hashlib,subprocess,wave
from pathlib import Path
from ..disc import FormatError,write_stream

MISSING_SOURCE_VOICES={'v22/443100012','00/440500030','05/130400016'}

def prepare(program,audio,out):
    groups=set()
    for row in program['instructions']:
        for part in row[5] or []:
            if part['voice'] and '|' in part['voice']:groups.add(part['voice'].lower())
        if row[2]==0xb9 and '|' in row[4][0]:groups.add(row[4][0].rstrip('\0').lower())
    assets={}
    for group in sorted(groups):
        ident=hashlib.sha256(group.encode()).hexdigest();rel=f'audio/groups/{ident}.wav';dest=out/rel
        files=[audio/('voice/'+n+'.vds.wav') for n in group.split('|') if n not in MISSING_SOURCE_VOICES]
        if any(not p.is_file() for p in files):raise FormatError('Missing grouped source voice')
        if not dest.exists():
            dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_suffix('.tmp.wav')
            command=['ffmpeg','-v','error','-nostdin','-y','-threads','1']
            for file in files:command+=['-i',str(file)]
            command+=['-filter_complex',f'amix=inputs={len(files)}:duration=longest:normalize=0','-c:a','pcm_s16le',str(temp)]
            subprocess.run(command,check=True,timeout=60)
            with temp.open('rb') as f:write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
            temp.unlink()
        with wave.open(str(dest)) as w:duration=w.getnframes()/w.getframerate()
        assets['voice:'+group]={'type':'voice','url':rel,'duration':duration,'sources':[p.relative_to(audio).as_posix() for p in files],'mix':'Simultaneous, summed at original gain; saturation to PCM16'}
    return assets
