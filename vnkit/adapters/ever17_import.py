"""Reproducible private Ever17 import, using the shared KID media tools."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
from .. import __version__
from ..source import Source
from ..disc import FormatError, write_json, write_stream
from . import ever17_ps2 as recovery
from .cri_afs import unpack_lzss
from .ever17_native import native_metadata
from .ever17_program import compile_program, MENU_DATA
from .remember11_media import digest

VERSION = '0.1.0'
ROOT = Path(__file__).resolve().parents[2]


def prepare_media(source,work):
    recovery.extract(source,work/'archives-v1')
    resources,media = work/'archives-v1',work/'media-v1'
    subprocess.run([sys.executable,str(ROOT/'scripts/convert-ever17-images.py'),str(resources),
                    '--out',str(media),'--jobs','2'],check=True)
    for kind in ('voice','sound','music'):
        cmd = [sys.executable,str(ROOT/'scripts/convert-remember11-media.py'),str(resources),
               '--out',str(media),'--kind',kind,'--jobs','1' if kind=='music' else '2']
        if kind=='music':
            cmd += ['--vgmtrans',os.environ.get('VNKIT_VGMTRANS',str(ROOT/'private/tooling/remember11-vgmtrans-shell'))]
        subprocess.run(cmd,check=True)
    s = Source(source)
    for name in s.entries:
        if name.endswith('.PSS'):
            write_stream(work/'movies-source',Path(name).name,s.chunks(name))
    subprocess.run([sys.executable,str(ROOT/'scripts/convert-remember11-movies.py'),
                    str(work/'movies-source'),'--out',str(media/'movies'),'--max-mib','1024','--jobs','1'],check=True)


def import_game(source,out,work=None,prepare=True):
    out = Path(out)
    work = Path(work or out.parent/(out.name+'-work'))
    inv = recovery.inspect(source,True)
    s = Source(source)
    if prepare:
        prepare_media(source,work)
    resources,media = work/'archives-v1',work/'media-v1'
    native = native_metadata(s.read_at(recovery.EXE))
    program,entry_evidence = compile_program(resources,inv['archives']['MAC.AFS'],native)
    records,assets,provenance,scripts,by_resource = [],{},{},{},{}
    errors,census = [],Counter()

    def copied(src,rel):
        with src.open('rb') as stream:
            record = write_stream(out,rel,iter(lambda:stream.read(1024*1024),b''))
        record.pop('status',None)
        records.append(record)

    for resource,script in program.items():
        # The native debug menu lists these empty placeholder resources. They
        # contain no ending command; preserve the fail-closed error, never turn
        # their zeros into an invented ending. No story call references them.
        if script['errors']:
            raw = unpack_lzss((resources/'MAC.AFS'/script['source']).read_bytes())
            placeholder = bytes.fromhex('090f060000600800') + bytes(20)
            if resource not in (39,40) or raw != placeholder:
                raise FormatError('; '.join(script['errors']))
        errors += script['errors']
        name = script['source']
        rel = 'scripts/'+name+'.json'
        write_json(out,rel,script)
        scripts[name] = {'url':rel,'sha256':script['sha256']}
        by_resource[resource] = name
        assets['script:'+name] = {'type':'script','url':rel}
        for i in script['instructions'].values():
            if 'op' in i:
                census[f"{i['sourceOp']:02x} {i['name']}"] += 1

    for archive,entries in inv['archives'].items():
        for entry in entries:
            name = f"{entry['index']:05d}-{entry['name']}"
            raw = resources/archive/name
            if archive in ('BG.AFS','EV.AFS','CHR.AFS') and entry['name'].endswith('.BIP'):
                rel = f'images/{archive}/{name}.png'
                meta = json.loads((media/(rel+'.json')).read_text())
                if meta['source_sha256'] != digest(raw):
                    raise FormatError('Image source integrity failure: '+name)
                category = ('BG.AFS','EV.AFS','CHR.AFS').index(archive)+1
                resource = category*4096+entry['index']//2
                frames = []
                for frame in meta['frames']:
                    if frame['sha256'] != digest(media/frame['url']):
                        raise FormatError('Image derivative integrity failure: '+name)
                    copied(media/frame['url'],frame['url'])
                    ident = f'image:{resource}' if frame['index']==0 else f"image:{resource}:frame:{frame['index']}"
                    assets[ident] = {'type':'image',**{k:frame[k] for k in ('url','width','height')}}
                    frames.append(ident)
                assets[f'image:{resource}']['frames'] = frames
                provenance[rel] = meta
            elif archive in ('BGM.AFS','SE.AFS','VOICE.AFS'):
                kind = {'BGM.AFS':'music','SE.AFS':'sound','VOICE.AFS':'voice'}[archive]
                rel = f'audio/{archive}/{name}.flac'
                meta = json.loads((media/(rel+'.json')).read_text())
                if meta['source_sha256'] != digest(raw) or meta['sha256'] != digest(media/rel):
                    raise FormatError('Audio integrity failure: '+name)
                copied(media/rel,rel)
                asset = {'type':kind,'url':rel,'label':entry['name'].rsplit('.',1)[0]}
                seq = meta.get('sequence',{})
                if seq.get('loop_start') is not None:
                    asset.update(loopStart=seq['loop_start'],loopEnd=seq['loop_end'])
                if kind=='sound':
                    data = raw.read_bytes()
                    # One original .ADX is RIFF PCM. Check the actual ADX header
                    # before interpreting loop fields, never only its extension.
                    if data[:2]==b'\x80\x00' and len(data)>44 and data[18]==3 and struct.unpack_from('>I',data,24)[0]:
                        rate = struct.unpack_from('>I',data,8)[0]
                        if not rate:
                            raise FormatError('Invalid ADX sample rate')
                        asset.update(loopStart=struct.unpack_from('>I',data,28)[0]/rate,
                                     loopEnd=struct.unpack_from('>I',data,36)[0]/rate)
                assets[f"{kind}:{entry['index']+(16384 if kind=='music' else 0)}"] = asset
                provenance[rel] = meta
    for movie in native['movies']:
        stem = Path(movie['name']).stem
        rel = f'movies/{stem}/{stem}.vp9.mp4'
        meta = json.loads((media/(rel+'.json')).read_text())
        check = json.loads((media/Path(rel).parent/'roundtrip.json').read_text())
        if meta['movie_sha256'] != digest(media/rel) or check['movie_sha256'] != meta['movie_sha256']:
            raise FormatError('Movie integrity failure: '+stem)
        copied(media/rel,rel)
        assets[f"video:{movie['index']}"] = {'type':'video','url':rel}
        provenance[rel] = {'conversion':meta,'roundtrip':check}
    init = unpack_lzss(s.read_at('INIT.BIN'))
    init_table = struct.unpack_from('<I',init)[0]
    startup,debug,*menu = struct.unpack_from('<6H',init,init_table)
    if menu != sorted(MENU_DATA) or startup not in by_resource:
        raise FormatError('Unexpected native startup/menu table')
    warnings = ['Native transitions, map overlays, detailed text timing and animation are incomplete.',
                'Native animated credits are omitted; source post-credits epilogues continue.',
                'Rare compact-font glyph 0x8753 retains its CP932 character until the font mapping is verified.',
                'Music uses original instrument banks with FluidSynth, not bit-identical SPU2 synthesis.',
                'Native galleries/shortcut menus and original-console comparison are unverified.',
                'Two native debug-only script placeholders remain deliberately fail-closed.',
                'All five main routes and the earned final-route gate have source replay evidence; optional branches and original-console comparison are not exhaustive.']
    content = {'format':'vnkit.content','version':1,'id':'ever17-slpm65421-1.01',
        'title':'Ever17 — the out of infinity — Premium Edition',
        'platform':{'id':'ps2','name':'PlayStation 2'},'adapter':{'id':recovery.ADAPTER_ID,'version':VERSION},
        'viewport':{'width':640,'height':480},'assets':assets,
        'runtime':{'id':'ever17-ps2-kid','version':1,'entry':by_resource[startup],
                   'scripts':scripts,'byResource':by_resource,'movies':native['movies']},
        'compatibility':{'status':'incomplete-runtime','summary':'All five main routes playable; native animation, credits and presentation remain incomplete.'}}
    write_json(out,'native-evidence.json',native)
    write_json(out,'entry-evidence.json',entry_evidence)
    write_json(out,'compatibility.json',{'status':'incomplete-runtime','warnings':warnings,
        'scripts':len(scripts),'census':dict(census),'parse_errors':errors,'menu_data':sorted(MENU_DATA)})
    write_json(out,'manifest.json',{'format':'vnkit.manifest','version':1,'tool_version':__version__,
        'adapter_version':VERSION,'source':inv['source'],'identification':inv['identification'],
        'settings':{'images':'native 16-pixel tiles, all frames, lossless PNG','audio':'original PCM/banks to FLAC',
                    'movies':'VP9 lossless/FLAC with decoded hashes'},'warnings':warnings,'outputs':records})
    write_json(out,'conversion-provenance.json',{'format':'vnkit.conversion-provenance','version':1,
        'adapter_version':VERSION,'assets':provenance})
    write_json(out,'content.json',content)
    return {'status':'incomplete-runtime','scripts':len(scripts),'assets':len(assets),'out':str(out)}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--work',type=Path,required=True)
    parser.add_argument('--prepared',action='store_true')
    args=parser.parse_args()
    try:
        print(json.dumps(import_game(args.source,args.out,args.work,not args.prepared),indent=2))
        raise SystemExit(3)
    except (OSError,ValueError,subprocess.SubprocessError) as e:
        parser.exit(2,str(e)+'\n')
