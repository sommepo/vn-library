"""Original SLPS-01794 VCE banks and native sound-cue timelines.

Source instrument/sample data are exported by external VGMTrans. Bounded native
cue timing is converted to MIDI for offline FluidSynth rendering; SPU mixing,
volume curves and sample-loop phase are approximate, never console fidelity.
"""
import json
from pathlib import Path
import struct
import subprocess
import tempfile
from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..sony_sequence import render_midi
from .memoriesoff_media import tools, ROOT


def parts(data):
    if len(data) < 4:
        raise FormatError('Truncated native sound directory')
    count, = struct.unpack_from('>I', data)
    if not 1 <= count <= 16 or 4 + count * 8 > len(data):
        raise FormatError('Native sound directory count')
    result, end = [], 4 + count * 8
    for i in range(count):
        at, size = struct.unpack_from('>II', data, 4 + i * 8)
        if at < end or at % 4 or not size or at + size > len(data) or any(data[end:at]):
            raise FormatError('Native sound member extent')
        result.append(data[at:at + size]); end = at + size
    if any(data[end:]):
        raise FormatError('Unexplained native sound tail')
    return result


def bank(data):
    records = parts(data)
    if len(records) != 3:
        raise FormatError('Native sound needs VH, VB and cue')
    vh, vb, cue = records
    if len(vh) < 32 or vh[:4] != b'pBAV' or not 1 <= len(cue) <= 400:
        raise FormatError('Invalid native sound bank')
    programs, tones, samples = struct.unpack_from('<HHH', vh, 18)
    if not 0 < programs <= 128 or not 0 < samples < 256 or tones > programs * 16:
        raise FormatError('Invalid source instrument dimensions')
    if len(vh) != 0xa20 + 512 * programs or struct.unpack_from('<I', vh, 12)[0] != len(vh) + len(vb):
        raise FormatError('Source sound bank extent mismatch')
    lengths = struct.unpack_from('<256H', vh, 0x820 + 512 * programs)
    if lengths[0] or any(lengths[samples + 1:]) or sum(lengths) * 8 != len(vb):
        raise FormatError('Source sample directory extent mismatch')
    end, loops, durations = 0, [], []
    for size in lengths[1:samples + 1]:
        size *= 8
        if not size or size % 16:
            raise FormatError('Invalid source ADPCM extent')
        found = False
        for pos in range(end, end + size, 16):
            header, flags = vb[pos:pos + 2]
            if header >> 4 > 4 or header & 15 > 12 or flags > 7:
                raise FormatError('Invalid source ADPCM frame')
            if flags & 1:
                loops.append(bool(flags & 2)); durations.append(((pos - end) // 16 + 1) * 28 / 44100)
                found = True; break
        if not found:
            raise FormatError('Source ADPCM lacks bounded end')
        end += size
    return vh + vb, cue, {'sample_loops': loops, 'sample_durations': durations,
                          'zero_tone_programs': [i for i in range(128) if not vh[32+i*16]],
                          'programs': programs, 'tones': tones, 'samples': samples}


def variable(value):
    if not isinstance(value, int) or not 0 <= value < 0x10000000:
        raise FormatError('MIDI delta bound')
    output = [value & 127]
    while value >> 7:
        value >>= 7; output.append((value & 127) | 128)
    return bytes(reversed(output))


def midi(timeline):
    track = bytearray(b'\0\xff\x51\x03\x0f\x42\x40')
    last, active, last_volume, last_bend = 0, None, None, None
    def emit(frame, payload):
        nonlocal last
        if not isinstance(frame, int) or frame < last or frame > 18000:
            raise FormatError('Native cue event timing bound')
        track.extend(variable(frame-last)); track.extend(payload); last = frame
    def volume(frame, left, right):
        nonlocal last_volume
        if not 0 <= left <= 127 or not 0 <= right <= 127:
            raise FormatError('Native cue volume range')
        level = max(left, right)
        pan = round(127 * right / (left + right)) if left + right else 64
        pair = level, pan
        if pair != last_volume:
            emit(frame, bytes((0xb0, 7, level))); emit(frame, bytes((0xb0, 10, pan)))
            last_volume = pair
    # A wide bend range preserves source pitch sweeps without changing notes.
    for controller, value in [(101,0),(100,0),(6,48),(38,0),(101,127),(100,127)]:
        emit(0, bytes((0xb0,controller,value)))
    for event in timeline['events']:
        frame, op, a = event['frame'], event['op'], event['args']
        if op == 'on':
            if active is not None: emit(frame, bytes((0x80,active,0)))
            program, key, fine, left, right = a[2], a[4], a[5], a[6], a[7]
            if not 0 <= program < 128 or not 0 <= key < 128 or not 0 <= fine < 128:
                raise FormatError('Native cue instrument/pitch range')
            emit(frame, bytes((0xc0,program))); volume(frame,left,right)
            bend = round(8192 + fine / 128 * 8192 / 48)
            emit(frame, bytes((0xe0,bend & 127,bend >> 7)))
            emit(frame, bytes((0x90,key,127))); active = key; last_bend = bend
        elif op == 'off':
            if active is not None: emit(frame, bytes((0x80,active,0)))
            active = None
        elif op == 'volume':
            if active is not None: volume(frame, min(127,a[1]//128), min(127,a[2]//128))
        elif op == 'pitch':
            if active is not None:
                pitch = a[5] + a[6] / 128
                bend = round(8192 + (pitch-active) * 8192 / 48)
                if not 0 <= bend <= 16383: raise FormatError('Native cue pitch sweep bound')
                if bend != last_bend: emit(frame,bytes((0xe0,bend & 127,bend >> 7))); last_bend=bend
        else:
            raise FormatError('Unknown native cue event')
    end = timeline['frame']
    if active is not None: emit(end,bytes((0x80,active,0)))
    emit(end,b'\xff\x2f\0')
    return b'MThd'+struct.pack('>IHHH',6,0,1,60)+b'MTrk'+struct.pack('>I',len(track))+track


def convert(recovery, executable, output, vgmtrans, node='node', paired=False, variants=None):
    recovery, out, tool = Path(recovery), Path(output), Path(vgmtrans).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools(); env['XDG_CONFIG_HOME'] = str(out.resolve()/'tool-config')
    rows, sources, assets = [], {}, {}
    exe = Path(executable).read_bytes()
    variants = json.loads(Path(variants).read_text()) if variants else None
    for path in sorted((recovery/('stored/VCP' if paired else 'stored/VCE')).glob('*.bin')):
        banks = parts(path.read_bytes()) if paired else [path.read_bytes()]
        if paired and len(banks) != 2: raise FormatError('Paired source bank count')
        for part, data in enumerate(banks):
            index = int(path.stem,16)
            if paired: index = 100000 + index * 2 + part
            raw, cue, audit = bank(data)
            logical = int(path.stem,16) % 1000
            if paired and part: logical = exe[2048+0x5b1cc+logical*2+1]
            for variant in (variants.get(str(int(path.stem,16)),[]) if variants is not None else [0]):
                key = str(index) + (f':v{variant}' if variant else '')
                sources[key]=(raw,audit)
                rows.append({'id':key,'cue':cue.hex(),'logical':logical,'variant':variant})
    write_json(out,'cue-input.json',rows)
    timeline_path=out/'cue-timelines.json'
    if not timeline_path.exists():
        subprocess.run([node,str(ROOT/'scripts/kamaitachi-audio-cues.mjs'),str(Path(executable).resolve()),str((out/'cue-input.json').resolve()),str(timeline_path.resolve())],check=True,timeout=300)
    timelines=json.loads(timeline_path.read_text())
    if {r['id'] for r in timelines} != set(sources): raise FormatError('Cue timeline source set differs')
    tool_hash=sha256_file(tool)
    # Synthetic sequence solely associates a bank with its original sample
    # collection in the external exporter. It never supplies game audio events.
    binding_seq=b'pQES\0\0\0\1\x00\x3c\x0f\x42\x40\x04\x02\0\xc0\0\0\x90\x30\x7f\x3c\x80\x30\0\0\xff\x2f'
    for timeline in timelines:
        key=timeline['id']; raw,audit=sources[key]; index=int(key.split(':')[0]); tag=key.replace(':','-')
        source=write_bytes(out,f'banks/{tag}/source.bin',raw)
        original_midi=midi(timeline)
        sequence=write_bytes(out,f'banks/{tag}/cue.mid',original_midi)
        cache=out/f'banks/{tag}/render.json';url=f'audio/sound/{tag}.flac'
        if cache.exists():
            item=json.loads(cache.read_text())
            if item['source_sha256']!=source['sha256'] or item['cue_midi_sha256']!=sequence['sha256'] or item['tool_sha256']!=tool_hash or item['sha256']!=sha256_file(out/url):raise FormatError('Sound cache differs; use a new output directory')
        else:
            with tempfile.TemporaryDirectory(prefix='.cue-',dir=out.resolve()) as tmp:
                folder=Path(tmp);(folder/'source.bin').write_bytes(raw+binding_seq)
                result=subprocess.run([str(tool),str(folder/'source.bin')],input=b'collection export 0 .\nexit\n',cwd=folder,env=env,capture_output=True,timeout=90,check=True)
                sf2=folder/'PS1 Seq.sf2'
                if not sf2.is_file():raise FormatError(f'Original sound bank {index} export failed')
                (folder/'cue.mid').write_bytes(original_midi)
                info={'ppqn':60,'duration':timeline['frame']/60,'source_events':[],'controller_counts':{}}
                render=render_midi(folder/'cue.mid',sf2,folder/'sound.wav',info,
                                   silent_programs=[(0,p) for p in audit['zero_tone_programs']])
                subprocess.run([ffmpeg,'-v','error','-nostdin','-n','-i',str(folder/'sound.wav'),'-c:a','flac','-threads','1',str(folder/'sound.flac')],env=env,capture_output=True,check=True,timeout=120)
                with (folder/'sound.flac').open('rb') as stream:record=write_stream(out,url,iter(lambda:stream.read(1024**2),b''))
            item={'type':'sound','url':url,'sha256':record['sha256'],'source_sha256':source['sha256'],'cue_midi_sha256':sequence['sha256'],'tool_sha256':tool_hash,'render':render,'native_bank':audit,'cue':{k:v for k,v in timeline.items() if k!='events'}}
            # A persistent cue controller alone does not make a one-shot waveform loop.
            if timeline['stop']=='loop' and any(audit['sample_loops']):
                item.update(loopStart=timeline['loopStart']/60,loopEnd=timeline['frame']/60)
            write_json(out,str(cache.relative_to(out)),item)
        assets[f'sound:{key}']=item;print('Sound',index,'converted',flush=True)
    write_json(out,'sounds.json',{'assets':assets,'limits':['SPU synthesis and dynamic loop phase approximate']})
    return assets


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('recovery','executable','out','vgmtrans'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--paired',action='store_true')
    parser.add_argument('--variants',type=Path)
    args=parser.parse_args();convert(args.recovery,args.executable,args.out,args.vgmtrans,paired=args.paired,variants=args.variants)
