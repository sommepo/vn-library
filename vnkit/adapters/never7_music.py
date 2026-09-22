"""Render Never7's native BGM bank/song-zero selection with original instruments.

SetBGM receives bank<<16, SetFixSE passes its low seven bits (zero) to
EZMIDI.IRX MidiStart. Both source streams and Song records stay in the cache.
FluidSynth is an approximation of SPU2 synthesis, not a console audio capture.
"""
import argparse
import json
import struct
import subprocess
import tempfile
from pathlib import Path
from ..disc import FormatError, write_bytes, write_json, write_stream
from ..elf import Elf32
from ..source import Source
from ..sony_sequence import render_midi, VGMTRANS_REVISION
from .never7_ps2 import detect, EXE, probe_sq
from .remember11_media import digest, export_bank

VERSION = '0.1.0'


def selected_sequence(data):
    info = probe_sq(data)
    if info['unchanged_parser']:
        return info, info['sequence']
    song = bytes.fromhex(info['song_metadata_hex'])
    # Tested two independent Song records select MIDI 0 and MIDI 1. Reject a
    # revision with different routing; never merge streams based on guesswork.
    if song[24:40] != bytes.fromhex('a00000a07f7f0000a00001a07f7f0000'):
        raise FormatError('Unverified Never7 Song-to-MIDI selection')
    return info, info['streams'][0]['sequence']


def convert_music(source, work, vgmtrans):
    if not detect(source)['supported']:raise FormatError('Untested Never7 edition')
    s=Source(source);work=Path(work).resolve();elf=Elf32(s.read_at(EXE));tool=Path(vgmtrans).resolve()
    rows=[]
    for number in range(1,25):
        flags,hd,sq,bd=struct.unpack('<4H',elf.at(0x3687e0+number*8,8))
        if flags!=0x101:raise FormatError('Unexpected native BGM bank row')
        folder=work/f'bank-{number:02d}';sources=[]
        for resource,ext in [(hd,'hd'),(sq,'sq'),(bd,'bd')]:
            candidates=[name for name in s.entries if name.endswith(f'/A{resource:03X}.')]
            if len(candidates)!=1:raise FormatError(f'Ambiguous or missing music file {resource:#x}')
            filename=candidates[0]
            record=write_bytes(folder,'bank.'+ext,s.read_at(filename));record.pop('status',None)
            sources.append({'source':filename,**record})
        cache=folder/'render.json';rel=f'audio/music/{number:02d}.flac'
        if cache.exists():
            row=json.loads(cache.read_text(encoding='utf-8'))
            if row['version']!=VERSION or row['sources']!=sources or row['sha256']!=digest(work/rel) or row['vgmtrans_sha256']!=digest(tool):
                raise FormatError('Music cache changed; use a new work directory')
        else:
            all_sequences,seq=selected_sequence((folder/'bank.sq').read_bytes())
            with tempfile.TemporaryDirectory(prefix='.render-',dir=folder) as temp:
                temp=Path(temp)
                for ext in ('sq','hd','bd'):write_bytes(temp,'bank.'+ext,(folder/('bank.'+ext)).read_bytes())
                export_bank(tool,temp)
                result=render_midi(temp/'Sony PS2 Seq.mid',temp/'Sony PS2 Seq.sf2',temp/'render.wav',seq)
                subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(temp/'render.wav'),'-c:a','flac','-threads','1',str(temp/'render.flac')],capture_output=True,check=True,timeout=300)
                with (temp/'render.flac').open('rb') as f:write_stream(work,rel,iter(lambda:f.read(1024*1024),b''))
                for ext in ('mid','sf2'):write_bytes(folder,'export.'+ext,(temp/('Sony PS2 Seq.'+ext)).read_bytes())
            row={'version':VERSION,'id':f'music:{number}','type':'music','label':f'BGM {number:02d}',
                 'url':rel,'sha256':digest(work/rel),'sources':sources,'render':result,'sequence':seq,
                 'all_sequences':all_sequences,'selected_song':0,'selected_midi':0,
                 'vgmtrans_revision':VGMTRANS_REVISION,'vgmtrans_sha256':digest(tool)}
            if seq['loop_start'] is not None:row.update(loopStart=seq['loop_start'],loopEnd=seq['loop_end'])
            write_json(folder,'render.json',row)
        rows.append(row);print(f'Music {number}/24',flush=True)
    write_json(work,'music-manifest.json',{'format':'vnkit.never7-music','version':1,'assets':rows,
        'warnings':['Original instruments rendered with FluidSynth; SPU2 synthesis and mixing parity unverified.']})
    return {'assets':len(rows),'out':str(work)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--work',type=Path,required=True);p.add_argument('--vgmtrans',type=Path,required=True);a=p.parse_args()
    try:print(json.dumps(convert_music(a.source,a.work,a.vgmtrans),indent=2))
    except (OSError,ValueError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
