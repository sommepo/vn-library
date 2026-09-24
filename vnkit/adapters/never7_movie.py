"""Sequential Never7 PSS conversion using the established lossless movie tools."""
import argparse
import json
import subprocess
from pathlib import Path
from ..disc import FormatError, write_stream, write_json
from ..source import Source
from .never7_ps2 import detect
from .pia_movie import convert_movie, verify_movie
from .remember11_media import digest
from .remember11_movie import convert_silent


def convert_movies(source, work):
    if not detect(source)['supported']:raise FormatError('Untested Never7 edition')
    s=Source(source);work=Path(work);rows=[]
    for resource in range(0xa0,0xb2):
        filename=f'A0A0/A{resource:03X}.';name=f'A{resource:03X}'
        original=work/'original'/(name+'.PSS');folder=work/'converted'/name
        write_stream(work/'original',name+'.PSS',s.chunks(filename))
        meta=folder/(name+'.vp9.mp4.json')
        if meta.exists():
            info=json.loads(meta.read_text(encoding='utf-8'))
            if info['source_sha256']!=digest(original) or info['movie_sha256']!=digest(folder/info['movie']):raise FormatError('Movie cache changed; use a new folder')
        else:
            try:info=convert_movie(original,folder)
            except ValueError as error:
                if str(error)!='Private audio lacks complete SShd/SSbd headers':raise
                # The existing video-only parser rejects every audio/private
                # packet; this never turns undecoded audio into a silent movie.
                info=convert_silent(original,folder)
        check=folder/'roundtrip.json'
        if not check.exists():write_json(folder,'roundtrip.json',verify_movie(original,folder/info['movie']))
        verified=json.loads(check.read_text(encoding='utf-8'))
        if verified['movie_sha256']!=info['movie_sha256'] or verified['source_sha256']!=info['source_sha256']:raise FormatError('Movie verification identity differs')
        if 'width' not in info:
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(folder/info['movie'])],text=True,timeout=30))
            video=next(v for v in probe['streams'] if v['codec_type']=='video');width,height=video['width'],video['height']
        else:width,height=info['width'],info['height']
        rows.append({'id':f'video:{resource}','type':'video','url':name+'/'+info['movie'],
            'sha256':info['movie_sha256'],'source':filename,'width':width,'height':height,
            'audio':info.get('audio','Original PCM, verified lossless')})
        print(f'Movie {len(rows)}/18 verified',flush=True)
    write_json(work,'movie-manifest.json',{'format':'vnkit.never7-movies','version':1,'assets':rows})
    return {'assets':len(rows),'out':str(work)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--work',type=Path,required=True);a=p.parse_args()
    try:print(json.dumps(convert_movies(a.source,a.work),indent=2))
    except (OSError,ValueError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
