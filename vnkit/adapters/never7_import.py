"""Never7 source-script reader import. Native effects/credits remain incomplete."""
import argparse
import json
import os
import struct
import subprocess
from pathlib import Path
from .. import __version__
from ..disc import FormatError, write_bytes, write_json, write_stream
from ..elf import Elf32
from ..png import encode
from . import never7_ps2 as recovery
from .never7_script import compile_recovery

VERSION = '0.6.0-experimental'


def import_game(source, out, work=None, prepared=False):
    out = Path(out);work = Path(work or out.parent/(out.name+'-work'))
    recovered, images = work/'recovery-current', work/'images-v1'
    identity = recovery.detect(source)
    if not identity['supported']:raise FormatError(identity['reason'])
    if not prepared:
        print('Recovering source scripts and tables…',flush=True)
        recovery.recover(source, recovered)
        print('Preparing original artwork…',flush=True)
        recovery.recover_images(source, images)
        from .never7_audio import convert_audio
        from .never7_music import convert_music
        from .never7_movie import convert_movies
        tool=os.environ.get('VNKIT_VGMTRANS',str(Path(__file__).resolve().parents[2]/'private/tooling/remember11-vgmtrans-shell'))
        print('Preparing voices and sound effects…',flush=True)
        convert_audio(source,work/'audio-v1',jobs=2)
        print('Preparing original music banks…',flush=True)
        convert_music(source,work/'music-v1',tool)
        print('Preparing movies…',flush=True)
        convert_movies(source,work/'movies-v1')
    print('Assembling scripts and media for the reader…',flush=True)
    parsed = compile_recovery(recovered, out)
    elf = Elf32((recovered/'raw'/recovery.EXE).read_bytes())
    media = json.loads((images/'image-manifest.json').read_text(encoding='utf-8'))
    by_offset = {(m['source'], m['offset']):m for m in media['members']}
    assets = {'native:predicate':{'type':'script','url':'predicate.json'}}; outputs = []; missing = []
    for kind, symbol, filename in [('background','LOC_NEV7_BG_R00','A020/A025.'),
                                    ('portrait','LOC_STAND_7_R00','A020/A029.')]:
        sym = elf.symbols[symbol]
        for index in range(sym['size']//8):
            offset, size = struct.unpack('<2I',elf.at(sym['address']+index*8,8))
            m = by_offset.get((filename,offset))
            if not m or m['compressed_size']!=size or not m.get('image'):
                missing.append({'asset':f'{kind}:{index}','source':filename,'offset':offset,'size':size});continue
            rel = f'images/{kind}/{index:04d}.png'
            with (images/m['image']).open('rb') as f:
                record = write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
            record.pop('status',None);outputs.append(record)
            assets[f'{kind}:{index}']={'type':'image','url':rel,'width':m['width'],'height':m['height'],
                                      'source':{'path':filename,'offset':offset,'size':size}}
    write_bytes(out,'images/black.png',encode(1,1,bytes([0,0,0,255])))
    assets['colour:0']={'type':'image','url':'images/black.png','width':1,'height':1}
    for name, ref in parsed['scripts'].items():assets['script:'+name]={'type':'script','url':ref['url']}
    media_warnings=[]
    for directory,manifest in [('audio-v1','audio-manifest.json'),('music-v1','music-manifest.json')]:
        root=work/directory
        if not (root/manifest).exists():
            media_warnings.append(f'{directory}: original audio has not yet been converted');continue
        data=json.loads((root/manifest).read_text(encoding='utf-8'))
        for a in data['assets']:
            file=root/('converted' if directory=='audio-v1' else '')/a['url']
            with file.open('rb') as f:record=write_stream(out,a['url'],iter(lambda:f.read(1024*1024),b''))
            if record['sha256']!=a['sha256']:raise FormatError('Converted audio fingerprint mismatch: '+a['url'])
            record.pop('status',None);outputs.append(record)
            asset={k:a[k] for k in ('type','url','loopStart','loopEnd','label') if k in a}
            if directory=='audio-v1':
                with (root/'original'/a['source']).open('rb') as f:header=f.read(20)
                rate,samples=struct.unpack_from('>II',header,8)
                if not rate or not samples:raise FormatError('Invalid ADX duration')
                asset.update(duration=samples/rate,source={'path':a['source'],'sha256':a['source_sha256'],'extent':a['source_extent']})
            assets[a['id']]=asset
        media_warnings.extend(w for w in data['warnings'] if not w.startswith('Sequenced BGM is separate'))
    movie_manifest=work/'movies-v1/movie-manifest.json'
    if movie_manifest.exists():
        for a in json.loads(movie_manifest.read_text(encoding='utf-8'))['assets']:
            rel='movies/'+a['url']
            with (work/'movies-v1/converted'/a['url']).open('rb') as f:record=write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
            if record['sha256']!=a['sha256']:raise FormatError('Converted movie fingerprint differs')
            record.pop('status',None);outputs.append(record)
            assets[a['id']]={**{k:a[k] for k in ('type','width','height','source')},'url':rel}
    else:media_warnings.append('Original movies have not yet been converted')
    warnings=['Original source-script reader; native animation and credits remain incomplete.',
              'Append entries and persistent unlocks follow the source menu. Native credits use a separate presentation VM and are omitted.',
              'Static parse counts do not establish full-route playability. See private smoke reports.',*media_warnings]
    content={'format':'vnkit.content','version':1,'id':'never7-slps25256-1.01','title':'Never7 — the end of infinity',
             'adapter':{'id':'never7-ps2','version':VERSION},'viewport':{'width':640,'height':480},'assets':assets,
             'runtime':{'id':'never7-ps2-oscr','version':1,'entry':'init_intdat','scripts':parsed['scripts'],'predicate':'predicate.json'},
             'compatibility':{'status':'incomplete-runtime','summary':warnings[0]}}
    report={'status':'incomplete-runtime','scripts':len(parsed['scripts']),'instructions':sum(parsed['census'].values()),
            'credits_instructions':sum(parsed['credits_census'].values()),
            'parse_errors':parsed['errors'],'missing_images':missing,'warnings':warnings}
    write_json(out,'compatibility.json',report)
    write_json(out,'manifest.json',{'format':'vnkit.manifest','version':1,'source':media['source'],'identification':identity,
              'tool_version':__version__,'adapter_version':VERSION,'outputs':outputs,'warnings':warnings,
              'settings':{'artwork':'native size, lossless PNG','story':'source words plus bounded read-only native predicate'}})
    write_json(out,'content.json',content)
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--work',type=Path,required=True)
    p.add_argument('--prepared',action='store_true');a=p.parse_args()
    try:
        r=import_game(a.source,a.out,a.work,a.prepared)
        print(json.dumps(r,indent=2));raise SystemExit(3)
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
