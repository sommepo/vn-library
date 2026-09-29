"""Exact CDIMG Sony SEQ/VAB banks, rendered with the original instruments.

The source VAB sample-size sum binds the VB extent independently of signature
location. FFmpeg/FluidSynth synthesis is an approximation of the original SPU.
"""
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..sony_sequence import render_midi
from .memoriesoff_music import inspect_seq
from .memoriesoff_media import tools
from .otogirisou_data import resources


def music_bank(data):
    candidates = []
    at = data.find(b'pBAV')
    while at >= 0:
        if at + 32 <= len(data) and data[at + 4:at + 8] == b'\x07\0\0\0':
            size = int.from_bytes(data[at + 12:at + 16], 'little')
            programs, tones, samples = struct.unpack_from('<HHH', data, at + 18)
            vh_size = 0xa20 + programs * 512
            seq = size - vh_size
            if (0 < programs <= 128 and 0 < samples <= 256 and tones <= programs * 16
                    and 0 < seq < at and seq % 16 == 0 and at + vh_size <= len(data)
                    and data[seq:seq + 8] == b'pQES\0\0\0\1'
                    and not any(data[at + vh_size:])):
                lengths = struct.unpack_from('<256H', data, at + 0x820 + programs * 512)
                if sum(lengths) * 8 == seq:
                    candidates.append((at, vh_size, seq))
        at = data.find(b'pBAV', at + 4)
    if len(candidates) != 1:
        raise FormatError('Otogirisou music requires one source-bound VAB/SEQ extent')
    vh, size, seq = candidates[0]
    audit = inspect_seq(data[seq:vh], replace_loop_start=True)
    audit['zero_tone_programs'] = [i for i in range(128) if not data[vh + 32 + i * 16]]
    return data[vh:vh + size] + data[:seq] + data[seq:vh], audit


def convert(exe, cdimg, output, vgmtrans, exact_vab_tool=None):
    out, tool = Path(output), Path(vgmtrans).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools()
    env['XDG_CONFIG_HOME'] = str(out.resolve() / 'tool-config')
    candidates = [tool] + ([Path(exact_vab_tool).resolve()] if exact_vab_tool else [])
    tool_hashes, assets = {str(t): sha256_file(t) for t in candidates}, {}
    for source_row in resources(exe, cdimg):
        if source_row['kind'] != 'sound-bank' or source_row['id'] >= 27:
            continue
        index = source_row['id']
        bank, audit = music_bank(source_row['bytes'])
        source = write_bytes(out, f'banks/{index:03}/source.bin', bank)
        cache = out / f'banks/{index:03}/render.json'
        url = f'audio/music/{index:03}.flac'
        if cache.exists():
            row = json.loads(cache.read_text())
            if row['source_sha256'] != source['sha256'] or row['sha256'] != sha256_file(out / url) or row['tool_sha256'] not in tool_hashes.values():
                raise FormatError('Otogirisou music cache differs; use a new output directory')
        else:
            with tempfile.TemporaryDirectory(prefix='.render-', dir=out.resolve()) as folder:
                folder = Path(folder)
                (folder / 'source.bin').write_bytes(bank)
                midi, sf2 = folder / 'PS1 Seq.mid', folder / 'PS1 Seq.sf2'
                for converter in candidates:
                    result = subprocess.run([str(converter), str(folder / 'source.bin')],
                        input=b'collection export 0 .\nexit\n', cwd=folder, env=env,
                        capture_output=True, timeout=90, check=True)
                    if midi.is_file() and sf2.is_file() and b'invalid' not in result.stdout.lower():
                        tool_hash = tool_hashes[str(converter)]
                        break
                    midi.unlink(missing_ok=True)
                    sf2.unlink(missing_ok=True)
                else:
                    raise FormatError('Otogirisou original bank export failed')
                render = render_midi(midi, sf2, folder / 'music.wav', audit,
                    silent_programs=[(0, p) for p in audit['zero_tone_programs']])
                render['synthesis'] = 'FluidSynth original VAB; PS1 SPU synthesis/mixing approximation'
                subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-i',
                    str(folder / 'music.wav'), '-c:a', 'flac', '-threads', '1',
                    str(folder / 'music.flac')], env=env, capture_output=True, timeout=120, check=True)
                with (folder / 'music.flac').open('rb') as stream:
                    record = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
            row = {'type': 'music', 'url': url, 'sha256': record['sha256'],
                   'source_sha256': source['sha256'], 'tool_sha256': tool_hash,
                   'render': render, 'sequence': audit}
            if audit['loopStart'] is not None and audit['loopEnd'] is not None:
                row.update(loopStart=audit['loopStart'], loopEnd=audit['loopEnd'])
            write_json(out, str(cache.relative_to(out)), row)
        assets[f'music:{index}'] = row
        print(f'Music {index} converted', flush=True)
    if len(assets) != 27:
        raise FormatError('Otogirisou music bank count mismatch')
    # JSON object keys become strings on cache reload. Preserve an existing
    # semantically identical report without rewriting its original bytes.
    manifest = {'assets': assets}
    prior = out / 'music.json'
    if not prior.exists() or json.loads(prior.read_text()) != json.loads(json.dumps(manifest)):
        write_json(out, 'music.json', manifest)
    return assets


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('exe', 'cdimg', 'out', 'vgmtrans'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--exact-vab-tool', type=Path)
    args = parser.parse_args()
    convert(args.exe.read_bytes(), args.cdimg.read_bytes(), args.out, args.vgmtrans, args.exact_vab_tool)
