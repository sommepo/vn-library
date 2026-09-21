"""Shared read-only view of an ISO9660 image or an extracted disc directory."""
from pathlib import Path
from .disc import IsoImage, DiscEntry, FormatError, safe_name, sha256_file
import hashlib
import json


class Source:
    def __init__(self, path):
        self.path = Path(path)
        self.iso = None if self.path.is_dir() else IsoImage(self.path)
        self.entries = {}
        if self.iso:
            self.entries = {e.path:e for e in self.iso.entries if not e.directory}
        else:
            for p in sorted(self.path.rglob('*')):
                if p.is_symlink():
                    raise FormatError(f'symlink input: {p}')
                if p.is_file():
                    name = safe_name(p.relative_to(self.path).as_posix())
                    self.entries[name] = DiscEntry(name, 0, p.stat().st_size)

    def chunks(self, name, offset=0, size=None):
        e = self.entries[name]
        size = e.size-offset if size is None else size
        if offset < 0 or size < 0 or offset+size > e.size:
            raise FormatError(f'extent out of bounds: {name}@{offset:#x}+{size}')
        with (self.path if self.iso else self.path/name).open('rb') as stream:
            stream.seek(e.offset+offset)
            while size:
                data = stream.read(min(size,1024*1024))
                if not data:
                    raise FormatError(f'source changed or truncated: {name}')
                size -= len(data)
                yield data

    def read_at(self, name, offset=0, size=None):
        size = self.entries[name].size-offset if size is None else size
        if size > 64*1024*1024:
            raise FormatError(f'bounded read exceeds 64 MiB: {name}')
        return b''.join(self.chunks(name, offset, size))

    def fingerprint(self):
        if self.iso:
            return {'type':'iso', 'size':self.iso.size, 'sha256':sha256_file(self.path)}
        files = [{'path':name, 'size':e.size, 'sha256':sha256_file(self.path/name)} for name,e in self.entries.items()]
        return {'type':'directory', 'files':files, 'sha256':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()}
