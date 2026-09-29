"""SLPS-01794 MUS banks; original samples/sequences, approximate SPU synthesis.

The native 0x800284b0 consumer reads three BE32 offsets: VH, VB and SEQ.
VGMTrans remains an external zlib-licensed converter. No game code is run.
"""
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file
from ..sony_sequence import render_midi
from .memoriesoff_media import tools
from .memoriesoff_music import inspect_seq


def music_bank(data):
    if len(data) < 44:
        raise FormatError('Truncated Kamaitachi music bank')
    vh, vb, seq = struct.unpack_from('>III', data)
    if vb != 12 or not vb < seq < vh < len(data) - 32:
        raise FormatError('Kamaitachi music extent order')
    if data[vh:vh + 4] != b'pBAV' or data[vh + 4:vh + 8] not in (b'\x06\0\0\0', b'\x07\0\0\0'):
        raise FormatError('Unknown Kamaitachi VAB version')
    programs, tones, samples = struct.unpack_from('<HHH', data, vh + 18)
    header_size = 0x820 + programs * 0x200 + 0x200
    if not 0 < programs <= 128 or not 0 < samples <= 256 or tones > programs * 16:
        raise FormatError('Invalid Kamaitachi VAB dimensions')
    if vh + header_size > len(data) or any(data[vh + header_size:]):
        raise FormatError('Kamaitachi VAB has an unexplained extent')
    size, = struct.unpack_from('<I', data, vh + 12)
    if size != header_size + seq - vb:
        raise FormatError('Kamaitachi VAB sample extent mismatch')
    sequence = data[seq:vh]
    audit = inspect_seq(sequence, replace_loop_start=True)
    audit['zero_tone_programs'] = [i for i in range(128) if data[vh + 32 + i * 16] == 0]
    return data[vh:vh + header_size] + data[vb:seq] + sequence, audit


def convert(recovery, output, vgmtrans):
    recovery, out, tool = Path(recovery), Path(output), Path(vgmtrans).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools()
    env['XDG_CONFIG_HOME'] = str(out.resolve() / 'tool-config')
    tool_hash, assets = sha256_file(tool), {}
    for path in sorted((recovery / 'stored/MUS').glob('*.bin')):
        index = int(path.stem, 16)
        bank, audit = music_bank(path.read_bytes())
        source = write_bytes(out, f'banks/{index:04x}/source.bin', bank)
        cache = out / f'banks/{index:04x}/render.json'
        url = f'audio/music/{index:04x}.flac'
        if cache.exists():
            row = json.loads(cache.read_text())
            if row['source_sha256'] != source['sha256'] or row['sha256'] != sha256_file(out / url) or row['tool_sha256'] != tool_hash:
                raise FormatError('Kamaitachi music cache differs; use a new output directory')
        else:
            with tempfile.TemporaryDirectory(prefix='.render-', dir=out.resolve()) as folder:
                folder = Path(folder)
                (folder / 'source.bin').write_bytes(bank)
                result = subprocess.run([str(tool), str(folder / 'source.bin')],
                    input=b'collection export 0 .\nexit\n', cwd=folder, env=env,
                    capture_output=True, timeout=90, check=True)
                midi, sf2 = folder / 'PS1 Seq.mid', folder / 'PS1 Seq.sf2'
                if not midi.is_file() or not sf2.is_file() or b'invalid' in result.stdout.lower():
                    raise FormatError('Kamaitachi PS1 bank export failed validation')
                info = {**audit, 'source_events': [], 'controller_counts': {}}
                render = render_midi(midi, sf2, folder / 'music.wav', info,
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
    if len(assets) != 73:
        raise FormatError('Kamaitachi MUS member count mismatch')
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
    parser.add_argument('recovery', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--vgmtrans', type=Path, required=True)
    args = parser.parse_args()
    convert(args.recovery, args.out, args.vgmtrans)
