"""Shared Sony PS2 SQ/HD/BD music helpers using original instrument banks.

VGMTrans exports the bank and expressive MIDI; source SQ inspection restores
sustain events omitted by its SonyPS2 exporter and retains source loop markers.
FluidSynth is an explicitly approximate replacement for SPU2 synthesis.
"""
import argparse
from collections import Counter
import ctypes as C
import ctypes.util
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import wave

from vnkit.disc import write_bytes, write_json, write_stream

VERSION = '0.1.0'
VGMTRANS_REVISION = '3e16daae49d42246f2d1b302b04f6e80a8037342'
RATE = 48000


class MusicError(ValueError):
    pass


def _var(data, position):
    result = 0
    for _ in range(4):
        if position >= len(data):
            raise MusicError('Truncated variable-length value')
        value = data[position]; position += 1
        result = result * 128 + (value & 127)
        if value < 128:
            return result, position
    raise MusicError('Variable-length value exceeds four bytes')


def inspect_sq(data, require_loop=True):
    if len(data) < 74 or len(data) > 4 * 1024 * 1024:
        raise MusicError('Sony SQ size outside bounds')
    if any(data[p:p+8] != s for p, s in ((0,b'IECSsreV'),(16,b'IECSuqeS'),(48,b'IECSidiM'))):
        raise MusicError('Unsupported Sony SQ signatures')
    block = 48 + struct.unpack_from('<I', data, 64)[0]
    if block + 6 > len(data):
        raise MusicError('SQ sequence block outside source')
    offset, ppqn = struct.unpack_from('<IH', data, block)
    if offset != 6 or not 1 <= ppqn <= 9600:
        raise MusicError('Unsupported SQ compression/header')
    position = block + offset
    ticks = 0; seconds = 0.; tempo = 500000; running = None; skip = False
    events = []; controls = Counter(); ended = False
    while position < len(data):
        if not skip:
            delta, position = _var(data, position)
            ticks += delta; seconds += delta * tempo / (ppqn * 1000000)
            if seconds > 1800:raise MusicError('SQ duration exceeds the 30-minute conversion bound')
        skip = False; location = position
        if position >= len(data):
            raise MusicError('SQ event missing after delta')
        status = data[position]; position += 1
        if status < 128:
            if running is None:
                raise MusicError(f'SQ running status absent at 0x{location:x}')
            position -= 1; status = running
        elif status != 255:
            running = status
        kind = status & 240
        if status == 255:
            if position >= len(data):
                raise MusicError('Truncated SQ meta event')
            meta = data[position]; position += 1
            if meta == 0x2f:
                ended = True; break
            if meta != 0x51 or position+4 > len(data) or data[position] != 3:
                raise MusicError(f'Unsupported SQ meta 0x{meta:x} at 0x{location:x}')
            tempo = int.from_bytes(data[position+1:position+4], 'big'); position += 4
            if not tempo:
                raise MusicError('Zero SQ tempo')
            continue
        count = {0x80:1,0x90:2,0xb0:2,0xc0:1,0xd0:1,0xe0:2}.get(kind)
        if count is None or position+count > len(data):
            raise MusicError(f'Unsupported/truncated SQ status 0x{status:x} at 0x{location:x}')
        args = list(data[position:position+count]); position += count
        skip = bool(args[-1] & 128); args[-1] &= 127
        if any(value > 127 for value in args):
            raise MusicError(f'Invalid SQ data at 0x{location:x}')
        if kind == 0xb0:
            controls[args[0]] += 1
            if args[0] not in (1,2,6,7,10,11,38,64,98,99):
                raise MusicError(f'Unsupported SQ controller {args[0]} at 0x{location:x}')
            if args[0] in (6,38,64,98,99):
                events.append(dict(offset=location,tick=ticks,seconds=seconds,channel=status&15,controller=args[0],value=args[1]))
    tail=data[position:]
    song=tail.find(b'IECSgnoS')
    if song>=0:
        if song+32!=len(tail) or any(v not in (0,255) for v in tail[:song]):raise MusicError('Invalid trailing SQ Song metadata')
        tail=tail[:song]
    if not ended or any(value not in (0,255) for value in tail):
        raise MusicError('SQ missing end marker or has nonpadding trailing data')
    starts = [e for e in events if e['controller']==99 and e['value']==0]
    ends = [e for e in events if e['controller']==99 and e['value']==1]
    counts = [e for e in events if e['controller']==38]
    valid_loop=len(starts)==1 and len(ends)==1 and len(counts)==1 and counts[0]['value']==0 and starts[0]['tick']<ends[0]['tick']
    if require_loop and not valid_loop:
        raise MusicError('Unverified SQ looping structure')
    return dict(ppqn=ppqn,duration=seconds,end_tick=ticks,controller_counts=dict(controls),
                source_events=events,loop_start=starts[0]['seconds'] if valid_loop else None,loop_end=ends[0]['seconds'] if valid_loop else None,
                loop_timing='NRPN-99 source marker times; native NRPN execution boundary unverified')


def midi_events(data):
    if data[:4] != b'MThd' or len(data)<14:
        raise MusicError('VGMTrans did not produce MIDI')
    length,kind,tracks,ppqn=struct.unpack_from('>IHHH',data,4)
    if length!=6 or kind not in (0,1) or ppqn&0x8000:
        raise MusicError('Unsupported generated MIDI header')
    position=14; result=[]; order=0
    for track in range(tracks):
        if data[position:position+4]!=b'MTrk' or position+8>len(data):raise MusicError('Missing MIDI track')
        size=struct.unpack_from('>I',data,position+4)[0];position+=8;end=position+size
        if end>len(data):raise MusicError('Truncated MIDI track')
        tick=0;running=None
        while position<end:
            delta,position=_var(data,position);tick+=delta
            status=data[position];position+=1
            if status<128:
                if running is None:raise MusicError('MIDI running status absent')
                position-=1;status=running
            elif status<240:running=status
            if status==255:
                meta=data[position];position+=1;size,position=_var(data,position)
                args=data[position:position+size];position+=size
                if meta==0x51:result.append((tick,order,'tempo',int.from_bytes(args,'big')))
            elif status in (0xf0,0xf7):
                size,position=_var(data,position);position+=size
                # Exported GM resets are metadata for a GM player; PS2 banks use
                # all 16 channels as explicit programs, without a GM drum channel.
            else:
                size=1 if status&240 in (0xc0,0xd0) else 2
                args=list(data[position:position+size]);position+=size
                if len(args)!=size or any(v>127 for v in args):raise MusicError('Invalid MIDI event')
                result.append((tick,order,status,args))
            order+=1
        if position!=end:raise MusicError('MIDI event crosses track boundary')
    if position!=len(data):raise MusicError('Trailing generated MIDI data')
    return ppqn,sorted(result,key=lambda e:(e[0],e[1]))


def render_midi(midi, sf2, output, source_info, library=None):
    """Offline only: no sound device, MIDI device, subprocess shell or host config."""
    ppqn, events = midi_events(midi.read_bytes())
    if ppqn != source_info['ppqn']:raise MusicError('SQ/MIDI tick resolutions differ')
    # Restore sustain controls with their original channel/tick. No melodic
    # note or expressive pitch/volume conversion is reimplemented here.
    events.extend((e['tick'],-1,0xb0|e['channel'],[64,e['value']])
                  for e in source_info['source_events'] if e['controller']==64)
    events.sort(key=lambda e:(e[0],e[1]))
    from .windows_tools import load_fluidsynth
    lib=load_fluidsynth(library)
    def bind(name,result,args):
        f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
    ptr=C.c_void_p;integer=C.c_int
    settings=bind('new_fluid_settings',ptr,[])()
    setnum=bind('fluid_settings_setnum',integer,[ptr,C.c_char_p,C.c_double])
    setint=bind('fluid_settings_setint',integer,[ptr,C.c_char_p,integer])
    setnum(settings,b'synth.sample-rate',RATE);setnum(settings,b'synth.gain',0.35)
    setint(settings,b'synth.cpu-cores',1);setint(settings,b'synth.chorus.active',0)
    synth=bind('new_fluid_synth',ptr,[ptr])(settings)
    if not synth:raise MusicError('Cannot create offline FluidSynth')
    try:
        font=bind('fluid_synth_sfload',integer,[ptr,C.c_char_p,integer])(synth,str(sf2).encode(),0)
        if font<0:raise MusicError('Cannot load original extracted SoundFont')
        program=bind('fluid_synth_program_select',integer,[ptr,integer,integer,integer,integer])
        channeltype=bind('fluid_synth_set_channel_type',integer,[ptr,integer,integer])
        cc=bind('fluid_synth_cc',integer,[ptr,integer,integer,integer])
        noteon=bind('fluid_synth_noteon',integer,[ptr,integer,integer,integer])
        noteoff=bind('fluid_synth_noteoff',integer,[ptr,integer,integer])
        pressure=bind('fluid_synth_channel_pressure',integer,[ptr,integer,integer])
        bend=bind('fluid_synth_pitch_bend',integer,[ptr,integer,integer])
        write=bind('fluid_synth_write_s16',integer,[ptr,integer,ptr,integer,integer,ptr,integer,integer])
        for channel in range(16):channeltype(synth,channel,0)
        buffer=(C.c_int16*(2048*2))();frame=0;tick=0;seconds=0.;tempo=500000
        bank=[0]*16;programs=set();missing={};peak=0
        with wave.open(str(output),'wb') as target:
            target.setnchannels(2);target.setsampwidth(2);target.setframerate(RATE)
            def until(target_frame):
                nonlocal frame,peak
                while frame<target_frame:
                    count=min(2048,target_frame-frame)
                    if write(synth,count,buffer,0,2,buffer,1,2)<0:raise MusicError('FluidSynth rendering failed')
                    payload=C.string_at(buffer,count*4)
                    peak=max(peak,max(abs(v) for v in buffer[:count*2]))
                    target.writeframesraw(payload);frame+=count
            for event_tick,_,status,args in events:
                seconds+=(event_tick-tick)*tempo/(1000000*ppqn);tick=event_tick
                until(round(seconds*RATE))
                if status=='tempo':tempo=args;continue
                channel=status&15;kind=status&240
                if kind==0x90:
                    if args[1] and channel in missing:raise MusicError(f'Original bank lacks sounding instrument {missing[channel]} on channel {channel}')
                    noteon(synth,channel,*args) if args[1] else noteoff(synth,channel,args[0])
                elif kind==0x80:noteoff(synth,channel,args[0])
                elif kind==0xc0:
                    if program(synth,channel,font,bank[channel],args[0])<0:
                        missing[channel]=(bank[channel],args[0])
                    else:missing.pop(channel,None)
                    programs.add((bank[channel],args[0]))
                elif kind==0xb0:
                    if args[0]==0:bank[channel]=(bank[channel]&127)|(args[1]<<7)
                    elif args[0]==32:bank[channel]=(bank[channel]&~127)|args[1]
                    else:cc(synth,channel,*args)
                elif kind==0xd0:pressure(synth,channel,args[0])
                elif kind==0xe0:bend(synth,channel,args[0]+128*args[1])
                else:raise MusicError(f'Unsupported exported MIDI status {status:x}')
            until(round((source_info['duration']+3)*RATE))
        if not peak:raise MusicError('Rendered original-bank track is silent')
        return dict(sample_rate=RATE,channels=2,frames=frame,peak=peak,programs=sorted(programs),fluidsynth_version=bind('fluid_version_str',C.c_char_p,[])().decode(),
                    restored_sustain_events=source_info['controller_counts'].get(64,0),
                    synthesis='FluidSynth original extracted bank; SPU2 ADSR/reverb/interpolation approximation')
    finally:
        bind('delete_fluid_synth',None,[ptr])(synth)
        bind('delete_fluid_settings',None,[ptr])(settings)
