"""PS1 SEQ/VAB recovery, external VGMTrans export and approximate bank rendering.

No game programs run. The source SEQ is audited independently of the converter.
VGMTrans (zlib) stays an external tool; FluidSynth does not reproduce the PS1 SPU.
"""
import collections
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..sony_sequence import _var, render_midi
from .memoriesoff_ps1 import identify, table_resource, unpack
from .memoriesoff_media import tools


def container(data):
    if len(data) < 32:
        raise FormatError('truncated Memories Off bank')
    header = int.from_bytes(data[:4], 'little')
    if header not in (32, 48):
        raise FormatError('unknown Memories Off bank directory')
    result, end = {}, header
    for offset in range(0, header, 16):
        start, length, tag, ordinal, total = struct.unpack_from('<II4sHH', data, offset)
        if start != end or not length or start + length > len(data) or ordinal != offset // 16 + 1 or total != header // 16:
            raise FormatError('invalid Memories Off bank extent')
        if tag not in (b'VH\0\0', b'VB\0\0', b'SEQ\0') or tag in result:
            raise FormatError('unknown/duplicate Memories Off bank record')
        result[tag] = data[start:start + length]
        end = start + length
    if result[b'VH\0\0'][:8] != b'pBAV\x07\0\0\0':
        raise FormatError('unrecognised PS1 VAB bank')
    return result


def inspect_seq(data, *, replace_loop_start=False):
    if len(data) < 18 or len(data) > 1024**2 or data[:8] != b'pQES\0\0\0\1':
        raise FormatError('unrecognised PS1 SEQ header')
    ppqn = int.from_bytes(data[8:10], 'big')
    tempo = int.from_bytes(data[10:13], 'big')
    if not 0 < ppqn <= 9600 or not tempo:
        raise FormatError('invalid SEQ tempo/resolution')
    position, ticks, seconds, running = 15, 0, 0., None
    controls, events, ended = collections.Counter(), [], False
    loop_start = loop_end = None
    while position < len(data):
        delta, position = _var(data, position)
        ticks += delta
        seconds += delta * tempo / (ppqn * 1000000)
        if seconds > 1800 or position >= len(data):
            raise FormatError('SEQ duration/truncation bound')
        status = data[position]; position += 1
        if status < 128:
            if running is None:
                raise FormatError('SEQ missing running status')
            status, position = running, position - 1
        else:
            # Sony SEQ also permits running FF/51 tempo events. This differs
            # from Standard MIDI, where meta events clear running status.
            running = status
        if status == 255:
            if position >= len(data):
                raise FormatError('truncated SEQ meta event')
            meta = data[position]; position += 1
            if meta == 47:
                ended = True
                break
            if meta != 81 or position + 3 > len(data):
                raise FormatError('unknown SEQ meta event')
            tempo = int.from_bytes(data[position:position + 3], 'big'); position += 3
            if not tempo:
                raise FormatError('zero SEQ tempo')
            continue
        size = {0x80: 2, 0x90: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2}.get(status & 240)
        if size is None or position + size > len(data):
            raise FormatError(f'unknown/truncated SEQ status {status:#x}')
        args = data[position:position + size]; position += size
        if any(v > 127 for v in args):
            raise FormatError('invalid SEQ channel data')
        if status & 240 == 0xb0:
            controls[args[0]] += 1
            events.append({'tick': ticks, 'seconds': seconds, 'channel': status & 15,
                           'controller': args[0], 'value': args[1]})
            if args[0] == 99 and args[1] == 20:
                if loop_start is not None and loop_end is None and not replace_loop_start:
                    raise FormatError('multiple SEQ loops need explicit interpretation')
                if loop_end is None:
                    loop_start = seconds
            if args[0] == 99 and args[1] == 30:
                if loop_end is None:
                    loop_end = seconds
    if not ended or any(data[position:]):
        raise FormatError('SEQ missing exact end or has unexplained tail')
    if loop_start is None and loop_end is not None:
        # Sony libsnd permits repeat from the beginning when there is no marker.
        loop_start = 0.
    return {'ppqn': ppqn, 'duration': seconds, 'end_tick': ticks,
            'controller_counts': dict(controls), 'source_events': events,
            'loopStart': loop_start, 'loopEnd': loop_end}


def convert(cue, output, vgmtrans, short_vgmtrans=None):
    disc, exe = identify(cue)
    out = Path(output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools()
    env['XDG_CONFIG_HOME'] = str(out / 'tool-config')
    assets = {}
    for kind, indices in [('music', range(16)), ('sound', (1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,18,19,20,21,23))]:
        for index in indices:
            tool = Path(short_vgmtrans if kind == 'sound' and index == 10 and short_vgmtrans else vgmtrans).resolve()
            extent = table_resource(exe, 0x8006abbc if kind == 'music' else 0x8006ac3c, index, 25)
            if not extent:
                raise FormatError('missing source music/sound bank')
            bank = container(disc.read_at(extent['lba'] * 2048, extent['sectors'] * 2048))
            if kind == 'music':
                seq_extent = table_resource(exe, 0x8006abfc, index, 16)
                seq = unpack(disc.read_at(seq_extent['lba'] * 2048, seq_extent['sectors'] * 2048))
            else:
                seq = bank[b'SEQ\0']
            audit = inspect_seq(seq)
            combined = bank[b'VH\0\0'] + bank[b'VB\0\0'] + seq
            source = write_bytes(out, f'banks/{kind}-{index:02}/source.bin', combined)
            cache = out / f'banks/{kind}-{index:02}/render.json'
            url = f'audio/{kind}/{index:02}.flac'
            if cache.exists():
                row = json.loads(cache.read_text())
                if row['source_sha256'] != source['sha256'] or row['sha256'] != sha256_file(out / url) or row['tool_sha256'] != sha256_file(tool):
                    raise FormatError('music cache differs; use a new work directory')
            else:
                with tempfile.TemporaryDirectory(prefix='.render-', dir=out) as folder:
                    folder = Path(folder)
                    # An inert gap separates the four-frame VAB from the SEQ;
                    # neither native sample bytes nor sequence bytes change.
                    tool_input = (bank[b'VH\0\0'] + bank[b'VB\0\0'] + bytes(16) + seq
                                  if kind == 'sound' and index == 10 else combined)
                    (folder / 'source.bin').write_bytes(tool_input)
                    result = subprocess.run([str(tool), str(folder / 'source.bin')], input=b'collection export 0 .\nexit\n',
                                            cwd=folder, env=env, capture_output=True, timeout=90, check=True)
                    if not (folder / 'PS1 Seq.mid').is_file() or not (folder / 'PS1 Seq.sf2').is_file() or b'invalid' in result.stdout:
                        raise FormatError('PS1 VGMTrans export failed validation')
                    # PS1 exporter already retains sustain. Shared rendering alone is reused.
                    info = {**audit, 'source_events': [], 'controller_counts': {}}
                    render = render_midi(folder / 'PS1 Seq.mid', folder / 'PS1 Seq.sf2', folder / 'music.wav', info)
                    render['synthesis'] = 'FluidSynth original VAB; PS1 SPU synthesis/mixing approximation'
                    subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-i', str(folder / 'music.wav'),
                                    '-c:a', 'flac', '-threads', '1', str(folder / 'music.flac')], env=env,
                                   capture_output=True, timeout=120, check=True)
                    with (folder / 'music.flac').open('rb') as stream:
                        record = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
                row = {'type': kind, 'url': url, 'sha256': record['sha256'], 'source_sha256': source['sha256'],
                       'tool_sha256': sha256_file(tool), 'render': render, 'sequence': audit}
                if audit['loopStart'] is not None and audit['loopEnd'] is not None:
                    row.update(loopStart=audit['loopStart'], loopEnd=audit['loopEnd'])
                write_json(out, str(cache.relative_to(out)), row)
            assets[f'{kind}:{index}'] = row
            print(f'{kind} {index} converted', flush=True)
    manifest = json.loads(json.dumps({'assets': assets}))
    target = out / 'music.json'
    # JSON object keys become strings on cache reload; retain an existing exact
    # semantic manifest instead of rewriting it with a different key order.
    if not target.exists() or json.loads(target.read_text()) != manifest:
        write_json(out, 'music.json', manifest)
    return assets


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('cue', type=Path)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--vgmtrans', type=Path, required=True)
    p.add_argument('--short-vgmtrans', type=Path, required=True)
    a = p.parse_args()
    convert(a.cue, a.out, a.vgmtrans, a.short_vgmtrans)
