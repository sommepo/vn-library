"""Bounded CUE/BIN input, including a ZIP containing a CUE and its tracks.

This intentionally accepts only separate MODE1/2352 and AUDIO track files.
It does not guess sector layouts from filename extensions or execute disc files.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from pathlib import Path
import re
import stat
import struct
import zipfile

from .disc import FormatError, safe_name, sha256_file, write_json, write_stream

SECTOR = 2352
SYNC = b'\x00' + b'\xff' * 10 + b'\x00'
MAX_TOTAL = 9 * 1024**3


@dataclass(frozen=True)
class Track:
    number: int
    filename: str
    mode: str
    start: int
    sectors: int
    pregap: int | None = None


def cue_tracks(text: str, sizes: dict[str, int]) -> list[Track]:
    """Parse a deliberately narrow, auditable CUE dialect; no silent directives."""
    rows = []
    filename = None
    current = None
    for line_number, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('REM '):
            continue
        match = re.fullmatch(r'FILE "([^"]+)" BINARY', line)
        if match:
            filename = safe_name(match[1])
            if '/' in filename or filename not in sizes:
                raise FormatError(f'CUE track is missing or not a sibling: {filename}')
            current = None
            continue
        match = re.fullmatch(r'TRACK (\d{2}) (MODE1/2352|AUDIO)', line)
        if match and filename:
            if any(row['filename'] == filename for row in rows):
                raise FormatError('CUE multiple tracks in one file are not supported yet')
            number = int(match[1])
            if number != len(rows) + 1 or number > 99:
                raise FormatError('CUE track numbering must be consecutive from 01')
            size = sizes[filename]
            if not size or size % SECTOR:
                raise FormatError(f'CUE track length is not whole sectors: {filename}')
            current = dict(number=number, filename=filename, mode=match[2],
                           sectors=size // SECTOR, indexes={})
            rows.append(current)
            continue
        match = re.fullmatch(r'INDEX (00|01) (\d{2}):(\d{2}):(\d{2})', line)
        if match and current:
            index, minutes, seconds, frames = map(int, match.groups())
            position = (minutes * 60 + seconds) * 75 + frames
            if seconds >= 60 or frames >= 75 or position >= current['sectors'] or index in current['indexes']:
                raise FormatError(f'invalid CUE index at line {line_number}')
            current['indexes'][index] = position
            continue
        raise FormatError(f'unsupported CUE directive at line {line_number}: {line[:80]}')
    if not rows or rows[0]['mode'] != 'MODE1/2352' or any(r['mode'] != 'AUDIO' for r in rows[1:]):
        raise FormatError('expected one Mode 1 data track followed by optional audio tracks')
    result = []
    for row in rows:
        indexes = row.pop('indexes')
        if 1 not in indexes or (0 in indexes and indexes[0] >= indexes[1]):
            raise FormatError('CUE missing INDEX 01 or invalid pregap')
        result.append(Track(**row, start=indexes[1], pregap=indexes.get(0)))
    return result


class CueMedia:
    """Read source track streams without extracting or changing their originals."""
    def __init__(self, path):
        self.path = Path(path)
        self.archive = None
        self.members = {}
        self.track_hashes = {}
        if self.path.is_dir():
            candidates = list(self.path.glob('*.cue')) + list(self.path.glob('*.CUE'))
            if len(candidates) != 1:
                raise FormatError('choose a folder with exactly one CUE sheet')
            self.path = candidates[0]
        if self.path.suffix.lower() == '.zip':
            self.archive = zipfile.ZipFile(self.path)
            try:
                total = 0
                for entry in self.archive.infolist():
                    name = safe_name(entry.filename)
                    mode = entry.external_attr >> 16
                    if '/' in name or entry.is_dir() or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)):
                        raise FormatError('CUE ZIP must contain regular sibling files only')
                    if name.casefold() in {n.casefold() for n in self.members}:
                        raise FormatError('duplicate CUE ZIP name')
                    total += entry.file_size
                    if total > MAX_TOTAL or len(self.members) >= 100 or entry.flag_bits & 1:
                        raise FormatError('CUE ZIP size/count/encryption limit exceeded')
                    self.members[name] = entry
                cues = [n for n in self.members if n.lower().endswith('.cue')]
                if len(cues) != 1 or self.members[cues[0]].file_size > 65536:
                    raise FormatError('CUE ZIP needs one bounded CUE sheet')
                self.cue_name = cues[0]
                cue_data = self.archive.read(self.cue_name)
                sizes = {n: e.file_size for n, e in self.members.items()}
            except BaseException:
                self.archive.close()
                raise
        elif self.path.suffix.lower() == '.cue':
            if self.path.is_symlink() or self.path.stat().st_size > 65536:
                raise FormatError('invalid CUE source')
            self.cue_name = self.path.name
            cue_data = self.path.read_bytes()
            sizes = {}
            for p in self.path.parent.iterdir():
                if p.is_file() and not p.is_symlink():
                    sizes[p.name] = p.stat().st_size
        else:
            raise FormatError('expected a CUE sheet, CUE folder or CUE/BIN ZIP')
        try:
            try:
                cue_text = cue_data.decode('utf-8-sig')
            except UnicodeDecodeError:
                cue_text = cue_data.decode('cp932', 'strict')
            self.tracks = cue_tracks(cue_text, sizes)
            self.cue_hash = hashlib.sha256(cue_data).hexdigest()
            if sum(sizes[t.filename] for t in self.tracks) > MAX_TOTAL:
                raise FormatError('CUE total track size limit exceeded')
            if self.archive and set(self.members) != {self.cue_name, *(t.filename for t in self.tracks)}:
                raise FormatError('unreferenced members in CUE ZIP')
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.archive:
            self.archive.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def open_track(self, track):
        if self.archive:
            return self.archive.open(track.filename)
        path = self.path.parent / track.filename
        if path.is_symlink() or path.stat().st_size != track.sectors * SECTOR:
            raise FormatError('CUE track changed since inspection')
        return path.open('rb')

    def sectors(self, track):
        digest = hashlib.sha256()
        with self.open_track(track) as source:
            for index in range(track.sectors):
                sector = source.read(SECTOR)
                if len(sector) != SECTOR:
                    raise FormatError(f'truncated CD track {track.number} sector {index}')
                digest.update(sector)
                if index >= track.start:
                    yield index, sector
            if source.read(1):
                raise FormatError('CD track grew during extraction')
        self.track_hashes[track.number] = digest.hexdigest()

    def data_chunks(self):
        for index, sector in self.sectors(self.tracks[0]):
            if sector[:12] != SYNC or sector[15] != 1:
                raise FormatError(f'not a Mode 1 sector at track 01 sector {index}')
            yield sector[16:2064]

    def normalize(self, destination, *, audio=True):
        """Lossless ISO/WAV preparation. Audio INDEX 00 is retained in provenance."""
        destination = Path(destination)
        files = [write_stream(destination, 'data.iso', self.data_chunks())]
        if audio:
            for track in self.tracks[1:]:
                size = (track.sectors - track.start) * SECTOR
                if size > 0xffffffff - 36:
                    raise FormatError('audio track exceeds WAV size limit')
                header = struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', size + 36, b'WAVE',
                                     b'fmt ', 16, 1, 2, 44100, 176400, 4, 16, b'data', size)
                def chunks(t=track, h=header):
                    yield h
                    for _, sector in self.sectors(t):
                        yield sector
                files.append(write_stream(destination, f'cdda/track-{track.number:02}.wav', chunks()))
        # Even a data-only inspection fingerprints omitted audio and pregaps.
        for track in self.tracks:
            if track.number not in self.track_hashes:
                for _ in self.sectors(track):
                    pass
        # Strip mutable create/resume statuses from the immutable manifest.
        manifest = dict(format='vnkit.cd-media', version=2, cue=self.cue_name,
                        cue_sha256=self.cue_hash,
                        source_zip_sha256=sha256_file(self.path) if self.archive else None,
                        sector_format='MODE1/2352', audio_format='CDDA s16le stereo 44100',
                        tracks=[dict(**asdict(t),sha256=self.track_hashes[t.number]) for t in self.tracks],
                        audio_prepared=audio,
                        files=[{k: v for k, v in f.items() if k != 'status'} for f in files])
        write_json(destination, 'media.json', manifest)
        return manifest
