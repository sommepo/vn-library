"""Reproducible private media conversion for the tested Remember11 PS2 disc."""
import hashlib,json,os,struct,subprocess,tempfile
from pathlib import Path
from ..disc import FormatError,write_bytes,write_stream,write_json
from ..sony_sequence import inspect_sq,render_midi,VGMTRANS_REVISION
from .cri_afs import unpack_lzss
from .remember11_graphics import png
VERSION='0.2.0'
def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def cached(out,rel,source):
 p=out/(rel+'.json')
 if not p.exists():return None
 info=json.loads(p.read_text())
 if info['version']!=VERSION or info['source_sha256']!=digest(source) or info['sha256']!=digest(out/rel):raise FormatError('Media cache differs; use a fresh output: '+rel)
 return info

def convert(source,out,kind,vgmtrans=None):
 source=Path(source);out=Path(out);arc=source.parent.name
 rel=f'images/{arc}/{source.name}.png' if kind=='image' else f'audio/{arc}/{source.name}.flac'
 hit=cached(out,rel,source)
 if hit:return hit
 info={'version':VERSION,'source':f'{arc}/{source.name}','source_sha256':digest(source),'url':rel,'type':kind}
 (out/rel).parent.mkdir(parents=True,exist_ok=True)
 if kind=='image':
  w,h,data=png(unpack_lzss(source.read_bytes()));write_bytes(out,rel,data);info.update(width=w,height=h)
 else:
  with tempfile.TemporaryDirectory(prefix='.convert-',dir=out) as tmp:
   tmp=Path(tmp).resolve();pcm=source
   if kind=='music':
    b=unpack_lzss(source.read_bytes())
    if struct.unpack_from('<I',b)[0]!=3:raise FormatError('Unsupported KID sound bank')
    raw_offsets=struct.unpack_from('<3I',b,4)
    variants=[[16+unit*v for v in raw_offsets]+[len(b)] for unit in (4,16)]
    variants=[o for o in variants if o==sorted(o) and b[o[1]:o[1]+8]==b'IECSsreV' and b[o[1]+16:o[1]+24]==b'IECSdaeH']
    if len(variants)!=1:raise FormatError('Ambiguous KID sound-bank offset units')
    offsets=variants[0]
    if offsets!=sorted(offsets) or offsets[0]!=16:raise FormatError('Invalid KID sound-bank bounds')
    for n,ext in enumerate(['sq','hd','bd']):write_bytes(tmp,'bank.'+ext,b[offsets[n]:offsets[n+1]])
    seq=inspect_sq((tmp/'bank.sq').read_bytes(),require_loop=False)
    if not vgmtrans:raise FormatError('VGMTrans shell is required for original instrument banks')
    export_bank(vgmtrans,tmp)
    pcm=tmp/'render.wav';info['render']=render_midi(tmp/'Sony PS2 Seq.mid',tmp/'Sony PS2 Seq.sf2',pcm,seq)
    info.update(sequence=seq,vgmtrans_revision=VGMTRANS_REVISION,vgmtrans_sha256=digest(vgmtrans))
   target=tmp/'audio.flac'
   subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(pcm),'-map','0:a:0','-c:a','flac','-threads','1',str(target)],check=True,capture_output=True,timeout=300)
   with target.open('rb') as f:write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
 info['sha256']=digest(out/rel);write_json(out,rel+'.json',info);return info

def export_bank(vgmtrans,tmp):
 # Binary stdin preserves LF: Windows text mode adds CR, which this shell
 # retains in the destination token ('.\r' is an invalid Windows directory).
 proc=subprocess.run([str(Path(vgmtrans).resolve()),*[str(tmp/('bank.'+e)) for e in ['sq','hd','bd']]],input=b'collection export 0 .\nexit\n',capture_output=True,cwd=tmp,timeout=120)
 if proc.returncode or not (tmp/'Sony PS2 Seq.sf2').exists():
  raise FormatError('VGMTrans bank export failed: '+proc.stderr[-1000:].decode('utf-8',errors='replace'))
