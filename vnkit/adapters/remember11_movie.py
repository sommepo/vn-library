"""Video-only KID PSS variant; reject any unhandled audio/private stream."""
import hashlib,json,struct,subprocess,tempfile
from pathlib import Path
from ..disc import FormatError,write_json,write_stream

def convert_silent(source,out):
 source=Path(source);out=Path(out);b=source.read_bytes();p=0;ended=False;counts={}
 while p<len(b):
  if b[p:p+3]!=b'\0\0\1' or p+4>len(b):raise FormatError('Invalid silent PSS packet')
  kind=b[p+3];counts[kind]=counts.get(kind,0)+1
  if kind==0xb9:ended=True;p+=4;break
  if kind==0xba:
   if p+14>len(b) or b[p+4]&0xc0!=0x40:raise FormatError('Unsupported PSS pack')
   n=14+(b[p+13]&7)
  else:
   if kind not in (0xbb,0xbe,0xe0) or p+6>len(b):raise FormatError('Silent conversion refuses nonvideo stream')
   n=6+struct.unpack_from('>H',b,p+4)[0]
  if n<=6 or p+n>len(b):raise FormatError('Invalid PSS extent')
  p+=n
 if not ended or any(v not in (0,255) for v in b[p:]):raise FormatError('PSS end/padding invalid')
 out.mkdir(parents=True,exist_ok=True);name=source.stem+'.vp9.mp4'
 with tempfile.TemporaryDirectory(prefix='.movie-',dir=out) as tmp:
  target=Path(tmp)/name
  subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(source),'-map','0:v:0','-c:v','libvpx-vp9','-lossless','1','-b:v','0','-row-mt','1','-cpu-used','4','-threads','4','-fps_mode','passthrough','-movflags','+faststart',str(target)],check=True)
  hashes=[subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:v:0','-f','hash','-hash','sha256','-'],text=True).strip() for p in (source,target)]
  if hashes[0]!=hashes[1]:raise FormatError('Silent movie lossless verification failed')
  with target.open('rb') as f:write_stream(out,name,iter(lambda:f.read(1024*1024),b''))
 info={'source_sha256':hashlib.sha256(b).hexdigest(),'movie':name,'movie_sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'audio':'No audio/private packets in original PSS','video_decoded_sha256':hashes[0],'packet_counts':counts}
 write_json(out,name+'.json',info);write_json(out,'roundtrip.json',info);return info
