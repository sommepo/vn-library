"""Read-only, bounded ISO9660 inspection and no-clobber extraction (stdlib)."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import tempfile

SECTOR = 2048

class FormatError(ValueError):
    pass


def safe_name(name: str) -> str:
    """Accept portable relative names, rejecting traversal and OS-special forms."""
    if not name or '\\' in name or ':' in name or '\x00' in name or name.startswith('/'):
        raise FormatError(f'unsafe archive path: {name!r}')
    parts = name.split('/')
    if any(p in ('', '.', '..') or any(ord(c) < 32 for c in p) for p in parts):
        raise FormatError(f'unsafe archive path: {name!r}')
    return name


def safe_target(root: Path, name: str) -> Path:
    safe_name(name)
    root = Path(root).absolute()
    current = root
    for parent in reversed(root.parents):
        if parent.is_symlink():
            raise FormatError(f'symlink destination parent: {parent}')
    if root.is_symlink():
        raise FormatError(f'symlink destination: {root}')
    root.mkdir(parents=True, exist_ok=True)
    for part in PurePosixPath(name).parts[:-1]:
        current /= part
        if current.is_symlink():
            raise FormatError(f'symlink destination parent: {current}')
        current.mkdir(exist_ok=True)
    result = current / PurePosixPath(name).name
    if result.is_symlink():
        raise FormatError(f'symlink destination: {result}')
    return result


def write_stream(root: Path, name: str, chunks) -> dict:
    """Atomic create or exact-match resume. Never replaces existing content."""
    target = safe_target(root, name)
    digest = hashlib.sha256()
    size = 0
    fd, temp = tempfile.mkstemp(prefix='.vnkit-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            for chunk in chunks:
                out.write(chunk); digest.update(chunk); size += len(chunk)
            out.flush(); os.fsync(out.fileno())
        sha = digest.hexdigest()
        if target.exists():
            if not target.is_file() or target.stat().st_size != size or sha256_file(target) != sha:
                raise FileExistsError(f'refusing to overwrite different file: {target}')
            status = 'unchanged'
        else:
            try:
                os.link(temp, target)
            except FileExistsError:
                raise FileExistsError(f'destination changed during extraction: {target}')
            status = 'created'
        return {'path': name, 'size': size, 'sha256': sha, 'status': status}
    finally:
        Path(temp).unlink(missing_ok=True)


def write_bytes(root: Path, name: str, data: bytes) -> dict:
    return write_stream(root, name, [data])


def write_json(root: Path, name: str, value) -> dict:
    return write_bytes(root, name, (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode())


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def dual32(data: bytes, at: int) -> int:
    a = int.from_bytes(data[at:at+4], 'little')
    b = int.from_bytes(data[at+4:at+8], 'big')
    if a != b:
        raise FormatError(f'ISO mismatched dual-endian field at {at}')
    return a

@dataclass(frozen=True)
class DiscEntry:
    path: str
    offset: int
    size: int
    directory: bool = False

class IsoImage:
    def __init__(self, path):
        self.path = Path(path)
        if not self.path.is_file():
            raise FormatError(f'not an ISO file: {self.path}')
        self.size = self.path.stat().st_size
        with self.path.open('rb') as descriptor_file:
            descriptor_file.seek(16 * SECTOR)
            descriptors = descriptor_file.read(240 * SECTOR)
        self.volume_descriptors = [{'sector':16 + i // SECTOR, 'type':descriptors[i], 'identifier':descriptors[i+1:i+6].decode('ascii')}
                                   for i in range(0, len(descriptors)-SECTOR+1, SECTOR)
                                   if descriptors[i+1:i+6] in (b'CD001', b'BEA01', b'NSR02', b'NSR03', b'TEA01')]
        self.entries: list[DiscEntry] = []
        self._paths = set()
        self._visited = set()
        with self.path.open('rb') as f:
            primary = None
            for sector in range(16, min(256, self.size // SECTOR)):
                f.seek(sector * SECTOR); record = f.read(SECTOR)
                if record[1:6] != b'CD001' or record[6] != 1:
                    raise FormatError('not a supported 2048-byte ISO9660 image')
                if record[0] == 1:
                    primary = record
                if record[0] == 255:
                    break
            if primary is None:
                raise FormatError('ISO9660 primary volume descriptor missing')
            self.system_id = primary[8:40].decode('ascii', 'strict').rstrip()
            self.volume_id = primary[40:72].decode('ascii', 'strict').rstrip()
            self.volume_blocks = dual32(primary, 80)
            if self.volume_blocks * SECTOR > self.size:
                raise FormatError('truncated ISO volume')
            if int.from_bytes(primary[128:130], 'little') != SECTOR or int.from_bytes(primary[130:132], 'big') != SECTOR:
                raise FormatError('unsupported logical block size')
            root = primary[156:190]
            self._walk(f, dual32(root, 2) * SECTOR, dual32(root, 10), '', 0)

    def _walk(self, f, offset, size, prefix, depth):
        if depth > 32 or size > 32 * 1024 * 1024:
            raise FormatError('ISO directory complexity limit exceeded')
        if (offset, size) in self._visited:
            raise FormatError('ISO directory cycle or alias')
        self._visited.add((offset, size))
        self._bounds(offset, size)
        f.seek(offset); data = f.read(size); pos = 0
        while pos < size:
            length = data[pos]
            if length == 0:
                pos = (pos // SECTOR + 1) * SECTOR
                continue
            if length < 34 or pos + length > size or (pos % SECTOR) + length > SECTOR:
                raise FormatError(f'malformed ISO directory record at {offset+pos:#x}')
            record = data[pos:pos+length]; pos += length
            if record[32] > length - 33:
                raise FormatError('ISO filename exceeds directory record')
            raw = record[33:33+record[32]]
            if raw in (b'\0', b'\1'):
                continue
            if record[1] or record[25] & (0x80 | 4) or record[26] or record[27]:
                raise FormatError('unsupported ISO extended, associated, interleaved or multi-extent entry')
            name = raw.decode('ascii', 'strict').split(';')[0]
            full = safe_name(f'{prefix}/{name}' if prefix else name)
            if full.casefold() in self._paths:
                raise FormatError(f'duplicate ISO path: {full}')
            self._paths.add(full.casefold())
            at, n = dual32(record, 2) * SECTOR, dual32(record, 10)
            self._bounds(at, n)
            entry = DiscEntry(full, at, n, bool(record[25] & 2))
            self.entries.append(entry)
            if len(self.entries) > 100000:
                raise FormatError('ISO entry limit exceeded')
            if entry.directory:
                self._walk(f, at, n, full, depth+1)

    def _bounds(self, offset, size):
        if offset < 0 or size < 0 or offset + size > self.size:
            raise FormatError(f'ISO extent out of bounds: {offset:#x}+{size:#x}')

    def entry(self, name: str) -> DiscEntry:
        for entry in self.entries:
            if entry.path.casefold() == name.lstrip('/').casefold():
                return entry
        raise FileNotFoundError(name)

    def read(self, entry: str | DiscEntry, limit=64*1024*1024) -> bytes:
        entry = self.entry(entry) if isinstance(entry, str) else entry
        if entry.directory or entry.size > limit:
            raise FormatError(f'entry cannot be read in memory: {entry.path}')
        return b''.join(self.chunks(entry))

    def chunks(self, entry: DiscEntry):
        self._bounds(entry.offset, entry.size)
        with self.path.open('rb') as f:
            f.seek(entry.offset); remaining = entry.size
            while remaining:
                data = f.read(min(1024*1024, remaining))
                if not data:
                    raise FormatError('ISO changed or truncated while reading')
                remaining -= len(data)
                yield data

    def inspect(self, fingerprint=False):
        report = {'format': 'ISO9660', 'logical_sector_size': SECTOR, 'system_id': self.system_id,
                  'volume_id': self.volume_id, 'size': self.size, 'volume_descriptors': self.volume_descriptors, 'files': [asdict(e) for e in self.entries]}
        if fingerprint:
            report['sha256'] = sha256_file(self.path)
        return report

    def extract(self, destination):
        destination = Path(destination)
        files = [write_stream(destination, e.path, self.chunks(e)) for e in self.entries if not e.directory]
        return {'format_version': 1, 'source_sha256': sha256_file(self.path), 'files': files}


def inspect(source, fingerprint=False):
    source = Path(source)
    if source.is_dir():
        files = []
        for path in sorted(source.rglob('*')):
            if path.is_symlink():
                raise FormatError(f'symlink in extracted input: {path}')
            if path.is_file():
                files.append({'path': path.relative_to(source).as_posix(), 'size': path.stat().st_size})
        return {'format': 'directory', 'files': files}
    return IsoImage(source).inspect(fingerprint)


def extract(source, destination):
    return IsoImage(source).extract(destination)
