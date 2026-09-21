"""Pia Carrot 3 SLPS-25222 VAS -> unresampled 16-bit PCM WAV.

PS-ADPCM arithmetic follows vgmstream's psx_decoder.c at revision
09c9f40caae4747e44b6a993b3d5b654cef4d1f7 (permission notice retained in
third_party/LICENSE-vgmstream.txt). Container configuration comes from the
supplied game's _NstrmPlay and MODULES.MLH/NSAD.IRX, not the VAS extension.
See docs/pia-audio.md for evidence and remaining hardware comparison limits.
"""

from array import array
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import wave

from vnkit.disc import write_bytes, write_json

VERSION = '0.1.0'
SPU2_PITCH = 0xEB3
NATIVE_RATE = 48000 * SPU2_PITCH / 4096
WAV_RATE = round(NATIVE_RATE)
INTERLEAVE = 0x800
MAX_SOURCE_BYTES = 64 * 1024 * 1024
COEFFICIENTS = ((0, 0), (60, 0), (115, -52), (98, -55), (122, -60))
VOICE_ALIASES = {
    '00517': 'PIA3_6', '00532': 'PIA3_7', '03397': 'PIA3_3',
    '09598': 'PIA3_1', '09600': 'PIA3_2', '11161': 'PIA3_5',
    '11299': 'PIA3_4',
}


class AudioError(ValueError):
    """Invalid data or audio configuration outside this verified edition."""


def resolve_voice(stem: str) -> str:
    """Return the exact NVAM member selected by _NstrmPlay's alias table."""
    stem = stem.upper()
    if not re.fullmatch(r'[A-Z0-9_]{1,20}', stem):
        raise AudioError(f'Unsafe voice stem {stem!r}')
    return VOICE_ALIASES.get(stem, stem) + '.VAS'


def _offset(frame: int, channel: int, channels: int) -> int:
    byte = frame * 16
    return byte // INTERLEAVE * INTERLEAVE * channels + channel * INTERLEAVE + byte % INTERLEAVE


def inspect_vas(data: bytes, archive: str) -> dict:
    """Validate all frames, paired terminal markers and exact channel layout."""
    if archive not in ('NVAM.NFP', 'NVAS.NFP'):
        raise AudioError(f'No evidenced stream configuration for archive {archive!r}')
    channels = 1 if archive == 'NVAM.NFP' else 2
    if not data or len(data) > MAX_SOURCE_BYTES or len(data) % (INTERLEAVE * channels):
        raise AudioError('VAS size must be a bounded, nonempty number of channel sectors')
    channel_frames = len(data) // (16 * channels)
    terminals = [[] for _ in range(channels)]
    ends = [[] for _ in range(channels)]
    for offset in range(0, len(data), 16):
        header, flags = data[offset:offset + 2]
        if header >> 4 > 4 or header & 15 > 12:
            raise AudioError(f'VAS invalid ADPCM header 0x{header:02x} at file+0x{offset:x}')
        if flags not in (0, 1, 7):
            raise AudioError(f'VAS unsupported ADPCM flags 0x{flags:02x} at file+0x{offset + 1:x}')
        if flags:
            channel = offset // INTERLEAVE % channels
            frame = (offset // (INTERLEAVE * channels) * INTERLEAVE + offset % INTERLEAVE) // 16
            (ends if flags == 1 else terminals)[channel].append(frame)
    for channel in range(channels):
        if len(ends[channel]) != 1 or terminals[channel] != [ends[channel][0] + 1]:
            raise AudioError(f'VAS channel {channel}: expected one end followed by terminal frame')
    if len({value[0] for value in ends}) != 1:
        raise AudioError('VAS channel end markers disagree')
    decoded_frames = ends[0][0] + 1
    # Do not discard potential sound disguised as trailing padding.
    for channel in range(channels):
        for frame in range(decoded_frames + 1, channel_frames):
            offset = _offset(frame, channel, channels)
            if any(data[offset + 2:offset + 16]):
                raise AudioError(f'VAS nonzero data after terminal at file+0x{offset:x}')
    return dict(format='vnkit.pia-vas', version=1, adapter_version=VERSION,
                channels=channels, codec='PS-ADPCM', interleave_bytes=INTERLEAVE,
                source_bytes=len(data), source_sha256=hashlib.sha256(data).hexdigest(),
                source_frames_per_channel=channel_frames,
                decoded_frames_per_channel=decoded_frames,
                samples_per_channel=decoded_frames * 28, spu2_pitch=SPU2_PITCH,
                native_sample_rate=NATIVE_RATE, wav_sample_rate=WAV_RATE,
                playback_rate=NATIVE_RATE / WAV_RATE,
                duration_seconds=decoded_frames * 28 / NATIVE_RATE,
                terminal_frame_and_sector_padding_excluded=True,
                limitations=['SPU2 interpolation, envelope and mixer are not emulated',
                             'Exact hardware PCM rounding has not been compared'])


def decode_vas(data: bytes, archive: str) -> tuple[bytes, dict]:
    """Return PCM WAV and a source/configuration manifest; never write originals.

    Samples are decoded without resampling or normalisation. The WAV integer
    rate rounds the evidenced hardware rate by 0.34375 Hz. A browser can use
    manifest playback_rate with preservesPitch=false for the exact timing ratio.
    """
    info = inspect_vas(data, archive)
    channels = info['channels']
    decoded = [array('h') for _ in range(channels)]
    for channel in range(channels):
        recent = older = 0
        output = decoded[channel]
        for frame in range(info['decoded_frames_per_channel']):
            offset = _offset(frame, channel, channels)
            header = data[offset]
            shift = header & 15
            coefficient, previous_coefficient = COEFFICIENTS[header >> 4]
            for packed in data[offset + 2:offset + 16]:
                for nibble in (packed & 15, packed >> 4):
                    signed = nibble if nibble < 8 else nibble - 16
                    value = ((signed << 12) >> shift) + ((recent * coefficient + older * previous_coefficient) >> 6)
                    output.append(max(-32768, min(32767, value)))
                    older, recent = recent, value
    if channels == 1:
        pcm = decoded[0]
    else:
        # The native NVAS setup pans the first sector channel to RIGHT and the
        # second to LEFT (_NstrmPlay 0x13fc40..0x13fc74). WAV order is L,R.
        pcm = array('h')
        for left, right in zip(decoded[1], decoded[0]):
            pcm.extend((left, right))
    if sys.byteorder != 'little':
        pcm.byteswap()
    target = io.BytesIO()
    with wave.open(target, 'wb') as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(WAV_RATE)
        output.writeframes(pcm.tobytes())
    wav = target.getvalue()
    info['wav_sha256'] = hashlib.sha256(wav).hexdigest()
    info['channel_order'] = ['mono'] if channels == 1 else ['source-channel-1-left', 'source-channel-0-right']
    return wav, info


def convert_voice_candidates(scripts: list[Path], resources: Path, output: Path) -> dict:
    """Convert existing five-digit script resource candidates, without ordering text.

    This is asset preparation only. Runtime Name/native calls establish whether
    and when a candidate is voiced. The manifest retains every source reference.
    """
    from vnkit.adapters.pia_ps2 import parse_script
    references = {}
    for path in scripts:
        script = parse_script(path.read_bytes(), path.name)
        if script['failures']:
            raise AudioError(f'{path.name}: script parse failed; cannot select resources')
        for item in script['strings']:
            if re.fullmatch(r'\d{5}', item['text']):
                references.setdefault(item['text'], []).append(item['id'])
    assets, converted = {}, {}
    for stem, source_ids in references.items():
        member = resolve_voice(stem)
        if member not in converted:
            source = resources / 'NVAM.NFP' / member
            wav, info = decode_vas(source.read_bytes(), 'NVAM.NFP')
            info['source'] = 'NVAM.NFP/' + member
            write_bytes(output, Path(member).stem + '.wav', wav)
            write_json(output, Path(member).stem + '.audio.json', info)
            converted[member] = info
        assets[stem] = dict(member=member, wav=Path(member).stem + '.wav',
                            source_string_ids=source_ids, **converted[member])
    result = dict(format='vnkit.pia-voice-candidates', version=1,
                  scripts=[path.name for path in scripts], assets=assets,
                  note='Candidate assets only; voice association is established during native execution')
    write_json(output, 'voice-candidates.json', result)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='An original extracted VAS member')
    parser.add_argument('--archive', choices=('NVAM.NFP', 'NVAS.NFP'))
    parser.add_argument('--scripts', type=Path, nargs='+', help='Prepare five-digit voice candidates from these scripts; source is the extracted resource directory')
    parser.add_argument('--out', required=True, type=Path, help='New or matching output directory')
    parser.add_argument('--inspect', action='store_true', help='Only validate and write metadata')
    args = parser.parse_args(argv)
    try:
        if args.scripts:
            if args.archive or args.inspect:
                raise AudioError('--scripts cannot be combined with --archive or --inspect')
            result = convert_voice_candidates(args.scripts, args.source, args.out)
            print(json.dumps(dict(voice_candidates=len(result['assets']), output=str(args.out))))
            return 0
        if not args.archive:
            raise AudioError('--archive is required for a single VAS source')
        if args.source.stat().st_size > MAX_SOURCE_BYTES:
            raise AudioError('Source exceeds configured limit')
        data = args.source.read_bytes()
        if args.inspect:
            info = inspect_vas(data, args.archive)
        else:
            wav, info = decode_vas(data, args.archive)
            write_bytes(args.out, args.source.stem + '.wav', wav)
        info['source'] = args.archive + '/' + args.source.name
        write_json(args.out, args.source.stem + '.audio.json', info)
        print(json.dumps(info, ensure_ascii=False))
        return 0
    except (OSError, ValueError) as exc:
        print(f'pia-audio: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
