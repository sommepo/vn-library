"""Shin PS2 PSS: preserve MPEG video and Sony ADPCM private-stream audio."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
from ..disc import FormatError, write_bytes, write_json, write_stream
from .pia_movie import _pts


def demux(data):
    if not data or len(data)>512*1024*1024: raise FormatError('PSS size limit')
    at=0;audio=bytearray();pts={};ended=False
    while at<len(data):
        if data[at:at+3]!=b'\0\0\1':raise FormatError(f'PSS packet magic at {at:x}')
        kind=data[at+3]
        if kind==0xb9:at+=4;ended=True;break
        if kind==0xba:size=14+(data[at+13]&7)
        else:
            if at+6>len(data):raise FormatError('PSS truncated header')
            size=6+struct.unpack_from('>H',data,at+4)[0]
            if size<=6 or at+size>len(data):raise FormatError('PSS packet range')
            if kind in (0xbd,0xe0):
                header=9+data[at+8]
                if header>size:raise FormatError('PSS PES range')
                stamp=_pts(data,at)
                if stamp is not None:pts.setdefault(kind,stamp)
                if kind==0xbd:
                    chunk=data[at+header:at+size]
                    if chunk[:4]!=b'\xff\xa1\0\0':raise FormatError('Unknown PSS audio substream')
                    audio.extend(chunk[4:])
            elif kind not in (0xbb,0xbe):raise FormatError(f'Unknown PSS stream {kind:x}')
        at+=size
    if not ended or any(v not in (0,255) for v in data[at:]):raise FormatError('PSS trailing data')
    if audio[:4]!=b'SShd' or audio[32:36]!=b'SSbd':raise FormatError('PSS audio container missing')
    size=struct.unpack_from('<I',audio,36)[0]
    if size!=len(audio)-40:raise FormatError('PSS audio size mismatch')
    if pts.get(0xbd)!=pts.get(0xe0):raise FormatError('PSS needs explicit timestamp synchronization')
    return audio,pts


def convert(source,out,vgmstream):
    source,out=Path(source).resolve(),Path(out).resolve();out.mkdir(parents=True,exist_ok=True)
    data=source.read_bytes();sha=hashlib.sha256(data).hexdigest();name=source.stem+'.mp4';meta=out/(name+'.json')
    if meta.exists():
        old=json.loads(meta.read_text())
        if old['source_sha256']==sha and hashlib.sha256((out/name).read_bytes()).hexdigest()==old['sha256']:return old
        raise FormatError('Changed movie cache')
    audio,pts=demux(data)
    with tempfile.TemporaryDirectory(prefix='movie-',dir=out) as temp:
        t=Path(temp);ads=t/'audio.ads';ads.write_bytes(audio);wav=t/'audio.wav'
        subprocess.run([str(Path(vgmstream).resolve()),'-i','-o',str(wav),str(ads)],stdout=subprocess.DEVNULL,check=True,timeout=120)
        dest=t/name
        subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-threads','2','-i',str(source),'-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libvpx-vp9','-lossless','1','-b:v','0','-row-mt','1','-cpu-used','4','-threads','2','-pix_fmt','yuv420p','-fps_mode','passthrough','-c:a','flac','-strict','-2','-movflags','+faststart',str(dest)],check=True,timeout=3600)
        checks={}
        for kind,original in [('v',source),('a',wav)]:
            hashes=[]
            for p in (original,dest):
                hashes.append(subprocess.check_output(['ffmpeg','-v','error','-threads','2','-i',str(p),'-map',f'0:{kind}:0','-f','hash','-hash','sha256','-'],text=True,timeout=300).strip())
            if hashes[0]!=hashes[1]:raise FormatError(f'Movie {kind} roundtrip differs')
            checks[kind]=hashes[0]
        with dest.open('rb') as stream:r=write_stream(out,name,iter(lambda:stream.read(1024*1024),b''))
    result={'source_sha256':sha,'sha256':r['sha256'],'url':name,'roundtrip':checks,'pts':pts}
    write_json(out,name+'.json',result);return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--vgmstream',required=True);a=p.parse_args()
    for f in sorted(a.folder.glob('*.pss')):
        print('Movie',f.name,flush=True);convert(f,a.out,a.vgmstream)

if __name__=='__main__':main()
