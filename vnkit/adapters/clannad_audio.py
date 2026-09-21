"""PS2 CLANNAD AFS and packed voice banks, using local proven audio decoders."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
from vnkit.source import Source
from vnkit.disc import FormatError, write_bytes, write_stream, write_json
from .hunex import decompress_mzx

ROOT=Path(__file__).resolve().parents[2]


def voice_entries(source, bank):
    hed=source.read_at(bank+'.HED');nam=source.read_at(bank+'.NAM');result=[]
    if len(hed)%4:raise FormatError('Voice HED alignment')
    for i in range(len(hed)//4):
        word,=struct.unpack_from('<I',hed,i*4)
        if word==0xffffffff:
            if any(x!=255 for x in hed[i*4:]):raise FormatError('Voice HED tail')
            return result
        at=((word&65535)|((word>>28)<<16))*2048
        size=((word>>16)&4095)*2048
        name=nam[i*8:i*8+8].rstrip(b'\0').decode('ascii')
        if len(nam)<(i+1)*8 or not size or at+size>source.entries[bank+'.MRG'].size:
            raise FormatError(f'{bank} voice {i}: invalid extent')
        result.append({'bank':bank,'index':i,'name':name,'offset':at,'size':size,'global_id':i+(20000 if bank=='VOICE2' else 0)})
    raise FormatError('Voice HED terminator absent')


def afs_entries(source, name):
    header=source.read_at(name,0,8)
    if header[:4]!=b'AFS\0':raise FormatError('Expected AFS header')
    count,=struct.unpack_from('<I',header,4)
    if count>100000:raise FormatError('AFS count limit')
    table=source.read_at(name,8,count*8)
    result=[]
    for i,(offset,size) in enumerate(struct.iter_unpack('<II',table)):
        if offset<8+count*8 or offset+size>source.entries[name].size:raise FormatError(f'{name}:{i} invalid AFS extent')
        result.append({'bank':name,'index':i,'offset':offset,'size':size})
    return result


def convert(source, output, workers=4, voice_ids=None, entries=None):
    source=source if isinstance(source,Source) else Source(source);output=Path(output)
    from ..windows_tools import vgmstream_path
    vgm=vgmstream_path()
    if not vgm.is_file():raise FormatError('Run python3 scripts/bootstrap-clannad-media.py for AHX decoding')
    sysroot=ROOT/'private/tooling/audio-sysroot';ffmpeg=sysroot/'usr/bin/ffmpeg'
    if not ffmpeg.is_file():ffmpeg=Path(shutil.which('ffmpeg') or '')
    if not ffmpeg.is_file():raise FormatError('FFmpeg is required for lossless FLAC output')
    env=os.environ.copy()
    if (sysroot/'usr/lib/x86_64-linux-gnu').is_dir():
        env['LD_LIBRARY_PATH']=':'.join(str(sysroot/p) for p in ['usr/lib/x86_64-linux-gnu','usr/lib/x86_64-linux-gnu/pulseaudio'])
    subprocess.run([str(ffmpeg),'-version'],env=env,check=True,capture_output=True,timeout=15)
    probe=subprocess.run([str(vgm),'-V'],capture_output=True,timeout=15)
    if probe.returncode not in (0,1) or b'r2117' not in probe.stdout:raise FormatError('Pinned vgmstream decoder could not start')
    if entries is None:
        entries=[]
        for bank in ('VOICE','VOICE2'):
            entries += [e for e in voice_entries(source,bank) if voice_ids is None or e['global_id'] in voice_ids]
        for name in ('BGM.AFS','VSE.AFS'):entries+=afs_entries(source,name)
    def worker(e):
        ident=f'voice:{e["global_id"]}' if 'global_id' in e else f'{"music" if e["bank"]=="BGM.AFS" else "sound"}:{e.get("effect_id",e["index"])}'
        relative='audio/'+ident.replace(':','-')+'.flac';recordpath='records/'+ident.replace(':','-')+'.json'
        bank=e['bank']+'.MRG' if 'global_id' in e else e['bank']
        raw=source.read_at(bank,e['offset'],e['size']);sourcehash=hashlib.sha256(raw).hexdigest()
        # Resume verifies the actual derivative, source bank extent and converter ABI.
        existing=output/recordpath
        if existing.is_file():
            record=json.loads(existing.read_text())
            if record.get('source')!=e or record.get('source_sha256')!=sourcehash or record.get('converter')!='clannad-audio-1/vgmstream-r2117':raise FormatError('Changed conversion settings/source; use a new media directory')
            target=output/relative
            if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==record['sha256']:return record
        if 'global_id' in e:
            if raw[:7]!=b'LV\x03\0\0\x09\0':raise FormatError(f'{ident}: unknown voice wrapper {raw[:7].hex()}')
            raw,_=decompress_mzx(raw[7:],invert=False)
        if raw[:2]!=b'\x80\0':raise FormatError(f'{ident}: expected CRI audio header')
        with tempfile.TemporaryDirectory(prefix='clannad-audio-') as temporary:
            directory=Path(temporary);src=directory/('source.ahx' if 'global_id' in e else 'source.adx');src.write_bytes(raw)
            info=subprocess.run([str(vgm),'-m','-I',str(src)],check=True,capture_output=True,text=True,timeout=30)
            meta=json.loads(info.stdout)
            wav=directory/'decoded.wav'
            subprocess.run([str(vgm),'-i','-o',str(wav),str(src)],check=True,capture_output=True,timeout=120)
            flac=directory/'converted.flac'
            subprocess.run([str(ffmpeg),'-v','error','-nostdin','-i',str(wav),'-c:a','flac','-compression_level','5',str(flac)],env=env,check=True,capture_output=True,timeout=120)
            with flac.open('rb') as stream:r=write_stream(output,relative,iter(lambda:stream.read(1024*1024),b''))
        record={'id':ident,'url':relative,'source':e,'source_sha256':sourcehash,'sha256':r['sha256'],
                'converter':'clannad-audio-1/vgmstream-r2117','metadata':meta}
        write_json(output,recordpath,record);return record
    records=[];failures=[]
    def safe(e):
        try:return worker(e),None
        except (OSError,ValueError,subprocess.SubprocessError) as error:return None,{'source':e,'error':str(error)}
    with ThreadPoolExecutor(max_workers=max(1,min(workers,8))) as pool:
        for n,(record,error) in enumerate(pool.map(safe,entries),1):
            if record:records.append(record)
            if error:failures.append(error)
            if n%1000==0:print(f'{n}/{len(entries)} audio resources, {len(failures)} failures',flush=True)
    result={'format':'vnkit.clannad-audio','version':1,'records':records,'failures':failures}
    write_json(output,'audio.json',result)
    return {'converted':len(records),'failures':failures}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--workers',type=int,default=4);p.add_argument('--voice-limit',type=int);a=p.parse_args()
    try:
        result=convert(a.source,a.out,a.workers,set(range(a.voice_limit)) if a.voice_limit is not None else None)
        print(json.dumps(result,ensure_ascii=False));raise SystemExit(3 if result['failures'] else 0)
    except (OSError,ValueError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
