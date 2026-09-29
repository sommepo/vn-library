"""Exact-disc STR recovery, retaining raw Mode 2 sectors and XA audio.

Original MOVxxx files are converted independently. Native dispatch association
uses the executable's LBA. One exact-edition seek begins in an incomplete final
frame of the previous stream; its next complete frame is checked explicitly.
"""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
from ..disc import FormatError, write_json, write_stream, sha256_file
from .otogirisou_ps1 import identify
from .memoriesoff_media import tools


def convert(cue, output):
    disc, exe = identify(cue)
    out = Path(output).resolve(); out.mkdir(parents=True, exist_ok=True)
    ffmpeg, env = tools(); probe = str(Path(ffmpeg).with_name('ffprobe'))
    entries = {entry.offset // 2048: entry for entry in disc.entries
               if not entry.directory and entry.path.endswith('.STR')}
    lbas = struct.unpack_from('<54I', exe, 2048 + 0x533a8)
    assets, unresolved = {}, []
    for index, lba in enumerate(lbas):
        entry = entries.get(lba)
        skipped = 0
        if entry is None and index == 42:
            # This exact disc seeks ten sectors before MOV042. The preceding
            # bytes are frame-98 chunks 4..8, XA and padding. They cannot form
            # a complete video frame. Admit only the observed next frame 1.
            prefix = list(disc.raw_sectors(lba,11))
            chunks = []
            for sector in prefix[:10]:
                payload=sector[24:]
                if payload[:4] == b'\x60\x01\x01\x80':
                    chunk,count,frame=struct.unpack_from('<HHI',payload,4)
                    if count!=9 or frame!=98:raise FormatError('Movie 42 seek prefix differs')
                    chunks.append(chunk)
                elif sector[18]&0x04 == 0 and any(payload[:2048]):
                    raise FormatError('Movie 42 has non-stream seek padding')
            first=prefix[10][24:]
            if chunks != list(range(4,9)) or first[:4]!=b'\x60\x01\x01\x80' or struct.unpack_from('<HHI',first,4)!=(0,9,1):
                raise FormatError('Movie 42 complete-frame boundary differs')
            entry=entries.get(lba+10);skipped=10
        if entry is None:
            unresolved.append({'id': index, 'lba': lba, 'reason': 'native LBA has no matching STR file start'})
            continue
        cache = out / f'cache/{index:02}.json'; url = f'movies/{index:02}.mp4'
        digest = hashlib.sha256()
        with tempfile.TemporaryDirectory(prefix='.str-', dir=out) as tmp:
            folder = Path(tmp); source = folder / 'source.str'
            with source.open('xb') as stream:
                for sector in disc.raw_sectors(lba+skipped, (entry.size + 2047) // 2048):
                    digest.update(sector); stream.write(sector)
            if cache.exists():
                row = json.loads(cache.read_text())
                if row['source_sha256'] != digest.hexdigest() or row['sha256'] != sha256_file(out / url):
                    raise FormatError('Otogirisou movie cache differs')
            else:
                data = json.loads(subprocess.check_output([probe, '-v', 'error', '-f', 'psxstr', '-show_streams', '-of', 'json', str(source)], env=env, timeout=30))
                video = [s for s in data['streams'] if s['codec_type'] == 'video']
                audio = [s for s in data['streams'] if s['codec_type'] == 'audio']
                if len(video) != 1 or len(audio) > 1:
                    raise FormatError(f'Otogirisou movie {index}: ambiguous stream set')
                movie = folder / 'movie.mp4'
                command = [ffmpeg, '-v', 'error', '-nostdin', '-n', '-threads', '1', '-f', 'psxstr', '-i', str(source),
                           '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libvpx-vp9', '-lossless', '1', '-threads', '1',
                           '-c:a', 'flac', '-strict', '-2', '-movflags', '+faststart', str(movie)]
                result = subprocess.run(command, env=env, capture_output=True, timeout=180, check=True)
                if result.stderr:
                    raise FormatError(f'Otogirisou movie {index} decode error: {result.stderr.decode()[:300]}')
                output_probe = json.loads(subprocess.check_output([probe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)], env=env, timeout=30))
                if len(output_probe['streams']) != len(data['streams']):
                    raise FormatError('STR conversion lost a source stream')
                with movie.open('rb') as stream:
                    record = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
                row = {'type': 'movie', 'url': url, 'sha256': record['sha256'], 'source_sha256': digest.hexdigest(),
                       'source': {'lba': lba, 'incomplete_prefix_sectors':skipped,
                                  'path': entry.path, 'bytes': entry.size},
                       'width': video[0]['width'], 'height': video[0]['height'],
                       'duration': float(output_probe['format']['duration']), 'audio': bool(audio)}
                write_json(out, str(cache.relative_to(out)), row)
        assets[f'movie:{index}'] = row
        print('Movie', index, 'converted', flush=True)
    write_json(out, 'movies.json', {'assets': assets, 'unresolved': unresolved})
    return {'movies': len(assets), 'unresolved': len(unresolved)}


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cue', type=Path, required=True); p.add_argument('--out', type=Path, required=True)
    a = p.parse_args(); print(convert(a.cue, a.out))
