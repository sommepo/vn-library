#!/usr/bin/env python3
"""Try existing converters on six private Ever17 samples, not a game import."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.source import Source
from vnkit.disc import FormatError,write_bytes,write_json
from vnkit.adapters.cri_afs import index_afs
from vnkit.adapters.remember11_media import convert

EXE_SHA256='7bd43ef8ba43090eee7f54ef83ffdd5779834ef7b7f825c8e5a33663dc37e17b'


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--vgmtrans',type=Path,required=True)
    a=p.parse_args()
    try:
        s=Source(a.source)
        if hashlib.sha256(s.read_at('SLPM_654.21')).hexdigest()!=EXE_SHA256:
            raise FormatError('Untested Ever17 edition')
        records=[]
        for archive,kind in [('VOICE.AFS','voice'),('SE.AFS','effect'),('BGM.AFS','music'),
                             ('BG.AFS','image'),('CHR.AFS','image')]:
            entries=index_afs(s,archive)
            member=next((e for e in entries if e['name']=='BG01A1.BIP'),None) if archive=='BG.AFS' else entries[0]
            if member is None:raise FormatError('Expected background sample is absent')
            rel=archive+'/'+member['name'];raw=s.read_at(archive,member['offset'],member['size'])
            write_bytes(a.out/'raw',rel,raw)
            converted=convert(a.out/'raw'/rel,a.out/'converted',kind,vgmtrans=a.vgmtrans)
            records.append({'source':rel,'result':converted})
        raw=s.read_at('MOVIE/SDR.PSS')
        write_bytes(a.out,'raw/MOVIE/SDR.PSS',raw)
        movie=a.out/'raw/MOVIE/SDR.PSS'
        metadata=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)],
                                capture_output=True,text=True,check=True,timeout=30)
        subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(movie),'-threads','1','-f','null','-'],
                       capture_output=True,check=True,timeout=60)
        records.append({'source':'MOVIE/SDR.PSS','decoded_to_null':True,'metadata':json.loads(metadata.stdout)})
        tools={}
        for name in ('ffmpeg','ffprobe'):
            tools[name]=subprocess.check_output([name,'-version'],text=True,timeout=10).splitlines()[0]
        report={'format':'vnkit.ever17-media-probe','version':1,'playable':False,
                'executable_sha256':EXE_SHA256,'records':records,'tools':tools,
                'limit':'One voice, effect, BGM bank, movie, background and portrait; no timing/association/fidelity claim.'}
        write_json(a.out,'report.json',report)
        print('Existing converters passed six samples; report: '+str(a.out/'report.json'))
        return 0
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as error:
        p.exit(2,f'Ever17 media probe: {error}\n')


if __name__=='__main__':sys.exit(main())
