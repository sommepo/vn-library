"""Exact-disc effect banks and source MML note requests.

Original VAB instruments are rendered externally. Cue note timing is native;
SPU envelopes, live volume/pitch ramps and sample-loop phase are approximate.
"""
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..sony_sequence import render_midi
from .memoriesoff_media import tools, ROOT
from .otogirisou_data import resources
from .kamaitachi_sound import variable


def banks(data):
    result, at = [], 0
    while at < len(data) and any(data[at:]):
        if len(result) >= 2 or at + 32 > len(data) or data[at:at+8] != b'pBAV\x07\0\0\0':
            raise FormatError('Unverified Otogirisou effect bank')
        size = struct.unpack_from('<I',data,at+12)[0]
        programs, tones, samples = struct.unpack_from('<HHH',data,at+18)
        vh = 0xa20+programs*512
        if not 0 < programs <= 128 or not 0 < samples < 256 or not 0 < tones <= programs*16 or size < vh or at+size > len(data):
            raise FormatError('Effect bank extent')
        raw = data[at:at+size]; lengths = struct.unpack_from('<256H',raw,0x820+programs*512)
        if lengths[0] or sum(lengths)*8 != size-vh or any(lengths[samples+1:]):
            raise FormatError('Effect sample extent')
        sample_info, start = [], vh
        for length in lengths[1:samples+1]:
            if not length or length % 2:
                raise FormatError('Effect sample frame alignment')
            end = start + length*8; loop = None; terminal = None
            for pos in range(start,end,16):
                header, flags = raw[pos:pos+2]
                if header>>4>4 or header&15>12 or flags>7:raise FormatError('Effect ADPCM frame')
                if flags&4:loop=(pos-start)//16*28/44100
                if flags&1:
                    terminal=((pos-start)//16+1)*28/44100
                    if not flags&2:loop=None
                    break
            if terminal is None:raise FormatError('Effect sample has no end')
            sample_info.append({'duration':terminal,'loopStart':loop});start=end
        tone=raw[0x820:0x840];sample=struct.unpack_from('<H',tone,22)[0]
        if not 1<=sample<=samples or raw[32]!=1:raise FormatError('Unverified effect program zero')
        # Native voice construction starts program/tone zero and note 60.
        scale=2**((tone[4]+tone[5]/128-60)/12)
        wave=sample_info[sample-1]
        result.append((raw,{'duration':wave['duration']*scale,'loopStart':None if wave['loopStart'] is None else wave['loopStart']*scale,
            'zero_tone_programs':[i for i in range(128) if not raw[32+i*16]]}))
        at+=size
    if not result:raise FormatError('Empty effect bank')
    return result


def cue_midi(events,duration,end):
    if not isinstance(end, int) or not 0 < end <= 18000 or not math.isfinite(duration) or duration <= 0:
        raise FormatError('Cue duration bound')
    ordered=[(0,-1,b'\xff\x51\x03\x0f\x42\x40')]
    for n,event in enumerate(events):
        frame,pitch,volume=event['frame'],event['pitch'],event['volume'];channel=n%8
        if not all(isinstance(v, int) for v in (frame,pitch,volume)) or not 0<=frame<end or not 0<=pitch<128 or not 0<=volume<128:raise FormatError('Cue note/volume range')
        for order,payload in enumerate([bytes((0xc0|channel,0)),bytes((0xb0|channel,7,volume)),bytes((0x90|channel,pitch,127))]):ordered.append((frame,order,payload))
        ordered.append((min(end,frame+math.ceil(duration*60)), -1,bytes((0x80|channel,pitch,0))))
    ordered.append((end,9,b'\xff\x2f\0'))
    track=bytearray();last=0
    for frame,_,payload in sorted(ordered,key=lambda row:(row[0],row[1])):
        track.extend(variable(frame-last));track.extend(payload);last=frame
    return b'MThd'+struct.pack('>IHHH',6,0,1,60)+b'MTrk'+struct.pack('>I',len(track))+track


def convert(executable,cdimg,output,vgmtrans):
    exe=Path(executable).read_bytes();cd=Path(cdimg).read_bytes();out=Path(output).resolve();out.mkdir(parents=True,exist_ok=True)
    source_banks={r['id']:banks(r['bytes']) for r in resources(exe,cd) if r['kind']=='sound-bank' and r['id']>=27}
    cue_file=out/'cues.json'
    if not cue_file.exists():subprocess.run(['node',str(ROOT/'scripts/otogirisou-audio-cues.mjs'),str(Path(executable).resolve()),str(cue_file)],check=True,timeout=120)
    cues=json.loads(cue_file.read_text());tool=Path(vgmtrans).resolve();tool_hash=sha256_file(tool);ffmpeg,env=tools();assets={}
    env['XDG_CONFIG_HOME'] = str(out / 'tool-config')
    binding=b'pQES\0\0\0\1\x00\x3c\x0f\x42\x40\x04\x02\0\xc0\0\0\x90\x30\x7f\x3c\x80\x30\0\0\xff\x2f'
    for cue in cues:
        if 'error' in cue:raise FormatError('Unresolved original effect cue')
        logical=cue['id'];physical=exe[2048+0x51f9c+logical];parts=source_banks[physical]
        if any(e['logical']!=logical or e['part']>=len(parts) for e in cue['events']):raise FormatError('Cue changes to an unavailable bank')
        cache=out/f'cache/{logical}.json';url=f'audio/sound/{logical:03}.flac'
        digest=write_bytes(out,f'banks/{logical}.bin',b''.join(p[0] for p in parts))['sha256']
        cue_hash=write_json(out,f'cues/{logical}.json',cue)['sha256']
        if cache.exists():
            row=json.loads(cache.read_text())
            if row['source_sha256']!=digest or row['cue_sha256']!=cue_hash or row['tool_sha256']!=tool_hash or sha256_file(out/url)!=row['sha256']:raise FormatError('Effect cache differs; use a new folder')
        else:
            loop=None;period=cue['frame']-(cue['loopStart'] or 0)
            if cue['stop']=='loop' and period>1:loop=((cue['loopStart']-1)/60,(cue['frame']-1)/60)
            end=max(e['frame']/60+parts[e['part']][1]['duration'] for e in cue['events'])
            if loop:end=max(end,loop[1])
            if loop is None:
                waves=[(e['frame']/60+parts[e['part']][1]['loopStart'],e['frame']/60+parts[e['part']][1]['duration']) for e in cue['events'] if parts[e['part']][1]['loopStart'] is not None]
                if len(waves)==1:loop=waves[0]
                elif len(waves)>1:loop=(max(a for a,b in waves),max(b for a,b in waves));end=max(end,loop[1])
            if not 0<end<300:raise FormatError('Effect duration bound')
            with tempfile.TemporaryDirectory(prefix='.effect-',dir=out) as tmp:
                folder=Path(tmp);waves=[]
                for part,(raw,audit) in enumerate(parts):
                    events=[e for e in cue['events'] if e['part']==part]
                    if not events:continue
                    sub=folder/str(part);sub.mkdir();(sub/'source.bin').write_bytes(raw+binding)
                    subprocess.run([str(tool),str(sub/'source.bin')],cwd=sub,env=env,input=b'collection export 0 .\nexit\n',capture_output=True,check=True,timeout=90)
                    sf2=sub/'PS1 Seq.sf2'
                    if not sf2.exists():raise FormatError('Original effect bank export failed')
                    midi=cue_midi(events,end if audit['loopStart'] is not None else audit['duration'],math.ceil(end*60));(sub/'cue.mid').write_bytes(midi)
                    render_midi(sub/'cue.mid',sf2,sub/'effect.wav',{'ppqn':60,'duration':end,'source_events':[],'controller_counts':{}},silent_programs=[(0,p) for p in audit['zero_tone_programs']]);waves.append(sub/'effect.wav')
                cmd=[ffmpeg,'-v','error','-nostdin','-n']
                for wave in waves:cmd+=['-i',str(wave)]
                if len(waves)>1:cmd+=['-filter_complex',f'amix=inputs={len(waves)}:normalize=0']
                cmd+=['-c:a','flac','-threads','1',str(folder/'effect.flac')]
                subprocess.run(cmd,env=env,capture_output=True,check=True,timeout=120)
                with (folder/'effect.flac').open('rb') as stream:record=write_stream(out,url,iter(lambda:stream.read(1024**2),b''))
            row={'type':'sound','url':url,'sha256':record['sha256'],'source_sha256':digest,'cue_sha256':cue_hash,'tool_sha256':tool_hash,'duration':end+3}
            if loop and loop[1]>loop[0]:row.update(loopStart=loop[0],loopEnd=loop[1])
            write_json(out,str(cache.relative_to(out)),row)
        assets[f'sound:{logical}']=row;print('Effect',logical,'converted',flush=True)
    write_json(out,'sounds.json',{'assets':assets,'limits':['SPU envelope, live pitch/volume ramps, cue changes after sample-end waits and loop phase approximate']})
    return {'effects':len(assets)}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('executable','cdimg','out','vgmtrans'):p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();print(convert(a.executable,a.cdimg,a.out,a.vgmtrans))
