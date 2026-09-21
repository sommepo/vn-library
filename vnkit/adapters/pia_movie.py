"""Bounded demux of this edition's MPEG-2 PSS with embedded SShd PCM audio.

The ordinary FFmpeg MPEG-PS demuxer detects only the video in this source.
This adapter preserves each identified private-stream audio payload, verifies
its complete SShd/SSbd body, then uses FFmpeg for browser-compatible encoding.
"""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from vnkit.disc import write_bytes, write_json, write_stream

VERSION = '0.1.0'
MAX_PSS = 512 * 1024 * 1024


class MovieError(ValueError):
    pass


def _pts(data: bytes, position: int):
    if len(data) < position + 14 or not data[position + 7] & 0x80:
        return None
    q = data[position + 9:position + 14]
    if not (q[0] & q[2] & q[4] & 1):
        raise MovieError(f'Invalid PES timestamp at file+0x{position + 9:x}')
    return ((q[0] >> 1 & 7) << 30) | (q[1] << 22) | (q[2] >> 1 << 15) | (q[3] << 7) | (q[4] >> 1)


def demux_pss(data: bytes) -> tuple[bytes, dict]:
    """Return the original complete Sony audio stream and source evidence."""
    if not data or len(data) > MAX_PSS:
        raise MovieError('PSS is empty or exceeds the configured limit')
    position = 0
    audio = bytearray()
    counts = Counter()
    first_pts = {}
    ended = False
    while position < len(data):
        if data[position:position + 3] != b'\0\0\1' or position + 4 > len(data):
            raise MovieError(f'Expected MPEG packet at file+0x{position:x}')
        kind = data[position + 3]
        counts[kind] += 1
        if kind == 0xB9:
            position += 4
            ended = True
            break
        if kind == 0xBA:
            if position + 14 > len(data) or data[position + 4] & 0xC0 != 0x40:
                raise MovieError(f'Unsupported/truncated MPEG pack at file+0x{position:x}')
            size = 14 + (data[position + 13] & 7)
        else:
            if position + 6 > len(data):
                raise MovieError(f'Truncated MPEG packet at file+0x{position:x}')
            size = 6 + struct.unpack_from('>H', data, position + 4)[0]
            if size == 6 or position + size > len(data):
                raise MovieError(f'Invalid packet extent at file+0x{position:x}')
            if kind in (0xBD, 0xE0):
                if size < 9 or data[position + 6] & 0xC0 != 0x80:
                    raise MovieError(f'Unsupported PES header at file+0x{position:x}')
                header = 9 + data[position + 8]
                if header > size:
                    raise MovieError(f'PES header exceeds packet at file+0x{position:x}')
                timestamp = _pts(data, position)
                if timestamp is not None:
                    first_pts.setdefault(kind, timestamp)
                if kind == 0xBD:
                    payload = data[position + header:position + size]
                    if not payload.startswith(b'\xff\xa0\0\0'):
                        raise MovieError(f'Unknown private stream at file+0x{position + header:x}')
                    audio.extend(payload[4:])
            elif kind not in (0xBB, 0xBE):
                raise MovieError(f'Unimplemented MPEG stream 0x{kind:02x} at file+0x{position:x}')
        if position + size > len(data):
            raise MovieError(f'Truncated packet at file+0x{position:x}')
        position += size
    if not ended or any(value not in (0, 255) for value in data[position:]):
        raise MovieError('Missing program end or nonpadding bytes after program end')
    if len(audio) < 40 or audio[:4] != b'SShd' or audio[32:36] != b'SSbd':
        raise MovieError('Private audio lacks complete SShd/SSbd headers')
    header_size, codec, rate, channels, interleave, loop_start, loop_end = struct.unpack_from('<7I', audio, 4)
    body_size = struct.unpack_from('<I', audio, 36)[0]
    if (header_size, codec, channels, interleave, loop_start, loop_end) != (24, 1, 2, 512, 0xFFFFFFFF, 0xFFFFFFFF):
        raise MovieError('Unsupported Sony PCM configuration')
    if rate != 48000 or body_size != len(audio) - 40 or body_size % (channels * interleave):
        raise MovieError('Sony PCM rate, body size or channel alignment is inconsistent')
    if 0xBD not in first_pts or first_pts.get(0xE0) != first_pts[0xBD]:
        raise MovieError('Audio/video initial PTS differ; explicit synchronization is required')
    info = dict(format='vnkit.pia-pss', version=1, adapter_version=VERSION,
                source_sha256=hashlib.sha256(data).hexdigest(), source_bytes=len(data),
                audio_sha256=hashlib.sha256(audio).hexdigest(), audio_body_bytes=body_size,
                audio_codec='PCM16LE', sample_rate=rate, channels=channels,
                interleave_bytes=interleave, duration_audio=body_size / (channels * 2 * rate),
                first_audio_video_pts=first_pts[0xBD], pts_time_base='1/90000',
                packet_counts={f'{key:02x}': value for key, value in counts.items()})
    return bytes(audio), info


def convert_movie(source: Path, output: Path, audio_codec='flac', ffmpeg='ffmpeg', ffprobe='ffprobe', video_codec='vp9') -> dict:
    if source.stat().st_size > MAX_PSS:
        raise MovieError('PSS exceeds configured limit')
    audio, info = demux_pss(source.read_bytes())
    output.mkdir(parents=True, exist_ok=True)
    stem = source.stem
    write_bytes(output, stem + '.ss2', audio)
    probe = json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-show_streams', '-of', 'json', str(source)], text=True))
    video = next((item for item in probe['streams'] if item['codec_type'] == 'video'), None)
    if not video or video['codec_name'] != 'mpeg2video':
        raise MovieError('Expected one MPEG-2 video source')
    info.update(width=video['width'], height=video['height'], frame_rate=video['r_frame_rate'],
                source=str(source), ffmpeg_version=subprocess.check_output([ffmpeg, '-version'], text=True).splitlines()[0],
                video_conversion=('VP9 lossless decoded pixels' if video_codec == 'vp9' else 'H.264 CRF16') + '; original dimensions and frame rate; no scaling',
                audio_conversion='FLAC lossless PCM preservation' if audio_codec == 'flac' else 'AAC 256 kbit/s compatibility derivative')
    name = stem + ('.vp9' if video_codec == 'vp9' else '') + ('.mp4' if audio_codec == 'flac' else '-aac.mp4')
    with tempfile.TemporaryDirectory(prefix='.movie-', dir=output) as temporary:
        movie = Path(temporary, name)
        command = [ffmpeg, '-v', 'error', '-nostdin', '-n', '-i', str(source), '-i', str(output / (stem + '.ss2')),
                   '-map', '0:v:0', '-map', '1:a:0']
        if video_codec == 'vp9':
            command.extend(['-c:v', 'libvpx-vp9', '-lossless', '1', '-b:v', '0', '-row-mt', '1', '-cpu-used', '4'])
        else:
            command.extend(['-c:v', 'libx264', '-preset', 'medium', '-crf', '16'])
        command.extend(['-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-c:a', audio_codec, '-threads', '4'])
        if audio_codec == 'flac':
            command.extend(['-strict', '-2'])
        else:
            command.extend(['-b:a', '256k'])
        command.extend(['-movflags', '+faststart', str(movie)])
        subprocess.run(command, check=True)
        info['output_probe'] = json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)], text=True))
        # Deterministic manifests omit the temporary converter filename.
        info['output_probe'].get('format', {}).pop('filename', None)
        if audio_codec == 'flac':
            hashes = []
            for item in (output / (stem + '.ss2'), movie):
                digest = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(item), '-map', '0:a:0', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip()
                hashes.append(digest)
            if hashes[0] != hashes[1]:
                raise MovieError('Lossless movie audio failed decoded-PCM hash comparison')
            info['decoded_pcm_sha256'] = hashes[0]
            info['audio_roundtrip_verified'] = True
        with movie.open('rb') as stream:
            write_stream(output, name, iter(lambda: stream.read(1024 * 1024), b''))
    info['movie'] = name
    info['movie_sha256'] = hashlib.sha256((output / name).read_bytes()).hexdigest()
    write_json(output, name + '.json', info)
    return info



def verify_movie(source: Path, movie: Path, ffmpeg='ffmpeg') -> dict:
    """Compare decoded original video and PCM against an existing lossless derivative."""
    audio, info = demux_pss(source.read_bytes())
    result = dict(format='vnkit.pia-movie-roundtrip', version=1,
                  source_sha256=info['source_sha256'],
                  movie_sha256=hashlib.sha256(movie.read_bytes()).hexdigest())
    with tempfile.TemporaryDirectory(prefix='.movie-verify-', dir=movie.parent) as temporary:
        original_audio = Path(temporary, 'original.ss2')
        original_audio.write_bytes(audio)
        for kind, first, selector in [('video', source, 'v'), ('audio', original_audio, 'a')]:
            hashes = [subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(path),
                      '-map', f'0:{selector}:0', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip()
                      for path in (first, movie)]
            if hashes[0] != hashes[1]:
                raise MovieError(f'{kind} decoded hash differs: derivative is not lossless')
            result[kind + '_decoded_sha256'] = hashes[0]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--verify-existing', type=Path, help='verify an existing lossless derivative without re-encoding')
    parser.add_argument('--audio-codec', choices=('flac', 'aac'), default='flac')
    parser.add_argument('--video-codec', choices=('vp9', 'h264'), default='vp9')
    args = parser.parse_args()
    try:
        if args.verify_existing:
            info = verify_movie(args.source, args.verify_existing)
            write_json(args.out, args.verify_existing.name + '.roundtrip.json', info)
        else:
            info = convert_movie(args.source, args.out, args.audio_codec, video_codec=args.video_codec)
        print(json.dumps({key: value for key, value in info.items() if key != 'output_probe'}))
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f'pia-movie: {exc}', file=__import__('sys').stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
