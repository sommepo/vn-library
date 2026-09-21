"""Import this tested KID edition through source bytecode and original media."""
import argparse,hashlib,json,os,subprocess,sys,struct
from collections import Counter
from pathlib import Path
from ..source import Source
from ..disc import FormatError,write_bytes,write_stream,write_json
from .. import __version__
from . import remember11_ps2 as recovery
from .cri_afs import unpack_lzss
from .remember11_script import Script,native_metadata
from .remember11_media import digest,VERSION
ROOT=Path(__file__).resolve().parents[2]
# Native INIT menu references these four as table data, not command entrypoints.
DATA={155,156,157,158}

def import_game(source,out,work=None,prepare=True):
 out=Path(out);work=Path(work or out.parent/(out.name+'-work'));s=Source(source)
 identity=recovery.detect(source)
 if not identity['supported']:raise FormatError(identity['reason'])
 inv=recovery.inspect(source,True);resources=work/'archives-v2';media=work/'media-v2'
 if prepare:
  recovery.extract(source,resources)
  tool=os.environ.get('VNKIT_VGMTRANS',str(ROOT/'private/tooling/remember11-vgmtrans-shell'))
  for kind in ['image','voice','sound','music']:
   cmd=[sys.executable,str(ROOT/'scripts/convert-remember11-media.py'),str(resources),'--out',str(media),'--kind',kind,'--jobs','4']
   if kind=='music':cmd+=['--vgmtrans',tool]
   subprocess.run(cmd,check=True)
  for name in s.entries:
   if name.endswith('.PSS'):write_stream(work/'movies-source',Path(name).name,s.chunks(name))
  subprocess.run([sys.executable,str(ROOT/'scripts/convert-remember11-movies.py'),str(work/'movies-source'),'--out',str(media/'movies')],check=True)
 native=native_metadata(s.read_at(recovery.EXE));assets={};scripts={};by_resource={};records=[];census=Counter();errors=[];provenance={}
 def copied(src,rel):
  with src.open('rb') as f:r=write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
  r.pop('status',None);records.append(r)
 for archive,entries in inv['archives'].items():
  for e in entries:
   name=f"{e['index']:05d}-{e['name']}";p=resources/archive/name
   if archive=='MAC.AFS':
    data=unpack_lzss(p.read_bytes())
    if e['index'] in DATA:
     copied(p,'native-data/'+name);continue
    script=Script(data,name,native['commands']).discover();errors.extend(script['errors'])
    rel='scripts/'+name+'.json';write_json(out,rel,script);scripts[name]={'url':rel,'sha256':script['sha256']};by_resource[e['index']]=name;assets['script:'+name]={'type':'script','url':rel}
    for i in script['instructions'].values():
     if 'op' in i:census[f"{i['op']:02x} {i['name']}"]+=1
   elif archive in ['BG.AFS','EV.AFS','CHR.AFS'] and e['name'].endswith('.BIP'):
    rel=f'images/{archive}/{name}.png';meta=json.loads((media/(rel+'.json')).read_text())
    provenance[rel]=meta
    if meta['source_sha256']!=digest(p) or meta['sha256']!=digest(media/rel):raise FormatError('Image cache integrity failure '+name)
    copied(media/rel,rel);n=['BG.AFS','EV.AFS','CHR.AFS'].index(archive)+1;assets[f"image:{n*4096+e['index']//2}"]={k:meta[k] for k in ['url','width','height','type']}
   elif archive in ['VOICE.AFS','SE.AFS','BGM.AFS']:
    kind={'VOICE.AFS':'voice','SE.AFS':'sound','BGM.AFS':'music'}[archive];rel=f'audio/{archive}/{name}.flac';meta=json.loads((media/(rel+'.json')).read_text())
    provenance[rel]=meta
    if meta['source_sha256']!=digest(p) or meta['sha256']!=digest(media/rel):raise FormatError('Audio cache integrity failure '+name)
    copied(media/rel,rel);asset={'type':kind,'url':rel,'label':e['name'].rsplit('.',1)[0]}
    seq=meta.get('sequence',{})
    if seq.get('loop_start') is not None:asset.update(loopStart=seq['loop_start'],loopEnd=seq['loop_end'])
    if kind=='sound':
     b=p.read_bytes();rate=struct.unpack_from('>I',b,8)[0]
     if b[18]==3 and len(b)>44 and struct.unpack_from('>I',b,24)[0]:
      asset.update(loopStart=struct.unpack_from('>I',b,28)[0]/rate,loopEnd=struct.unpack_from('>I',b,36)[0]/rate)
    assets[f"{kind}:{(16384 if kind=='music' else 0)+e['index']}"]=asset
 for m in native['movies']:
  stem=Path(m['name']).stem;rel=f'movies/{stem}/{stem}.vp9.mp4';meta=json.loads((media/(rel+'.json')).read_text());check=json.loads((media/Path(rel).parent/'roundtrip.json').read_text())
  provenance[rel]={'conversion':meta,'roundtrip':check}
  if meta['movie_sha256']!=digest(media/rel) or check['movie_sha256']!=meta['movie_sha256']:raise FormatError('Movie integrity failure '+stem)
  copied(media/rel,rel);assets[f"video:{m['index']}"]={'type':'video','url':rel}
 if errors:raise FormatError('Scenario decode failures: '+'; '.join(errors))
 warnings=['Native transitions, lip/eye motion, screen effects, clock/title artwork and detailed timing are incomplete.',
  'Music uses original instrument banks with approximate FluidSynth synthesis, not bit-identical SPU2 audio.',
  'Native TIPS/chronology/gallery menus and auxiliary debug scripts are not implemented.',
  'Source compact-Latin glyph mapping and original-console comparisons are unverified.',
  'Static command coverage does not prove every ending or cross-playthrough unlock.']
 content={'format':'vnkit.content','version':1,'id':'remember11-slpm65550-1.02','title':'Remember11 — the age of infinity',
  'adapter':{'id':'remember11-ps2','version':VERSION},'viewport':{'width':640,'height':448},'assets':assets,
  'runtime':{'id':'remember11-ps2-kid','version':1,'entry':by_resource[159],'scripts':scripts,'byResource':by_resource,'movies':native['movies']},
  'compatibility':{'status':'incomplete-runtime','summary':'Japanese PS2 source-script interpreter with original images, voices, music and movies. Native presentation and extras remain incomplete.'}}
 write_json(out,'native-evidence.json',native);write_json(out,'compatibility.json',{'status':'incomplete-runtime','warnings':warnings,'census':dict(census),'scripts':len(scripts),'data_resources':sorted(DATA),'parse_errors':errors})
 write_json(out,'manifest.json',{'format':'vnkit.manifest','version':1,'source':inv['source'],'identification':identity,'tool_version':__version__,'adapter_version':VERSION,
  'settings':{'art':'native dimensions, lossless PNG','voice_effects':'decoded PCM to FLAC','music':'Sony SQ/HD/BD through VGMTrans/FluidSynth','movies':'VP9 lossless/FLAC, verified decoded hashes'},'warnings':warnings,'outputs':records})
 write_json(out,'conversion-provenance.json',{'format':'vnkit.conversion-provenance','version':1,'adapter_version':VERSION,
  'software_lock_sha256':digest(ROOT/'scripts/audio-tools.lock.json'),
  'vgmtrans_pressure_patch_sha256':digest(ROOT/'scripts/vgmtrans-remember11-pressure.patch'),
  'assets':provenance})
 write_json(out,'content.json',content)
 return {'status':'incomplete-runtime','scripts':len(scripts),'instructions':sum(census.values()),'assets':len(assets),'out':str(out),'warnings':warnings}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--prepared',action='store_true');a=p.parse_args()
 try:print(json.dumps(import_game(a.source,a.out,a.work,not a.prepared),ensure_ascii=False,indent=2));raise SystemExit(3)
 except (OSError,ValueError,subprocess.SubprocessError) as e:p.exit(2,str(e)+'\n')
