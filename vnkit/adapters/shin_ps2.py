"""Bounded Shin PS2 ROM 1.4 directory and sector recovery.

The sector cipher follows Umineko Project's BSD-3-Clause AlchemistUnpacker
(higu.cpp, commit 4529a1198066f229a3d0ab064f282061caa90258). Unlike that
tool, the index and seed are recovered from the supplied disc, never bundled.
Directory decryption and CRC are confirmed in SLPM-66913 at 0x12fd18.
See docs/higurashi-investigation.md and third_party/LICENSE-umineko-project.txt.
"""
from dataclasses import dataclass, asdict
from pathlib import Path
import hashlib
import struct
import zlib
from ..disc import FormatError, safe_name, write_stream

SECTOR = 2048
MAX_INDEX = 16 * 1024 * 1024


def crypt(data, seed):
    """Symmetric byte cipher; inputs are never modified."""
    result = bytearray(data)
    for i in range(len(result)):
        seed = (seed * 0x343fd + 0x269ec3) & 0xffffffff
        result[i] ^= (seed ^ (seed >> 16)) & 255
    return bytes(result)


@dataclass(frozen=True)
class Member:
    name: str
    offset: int
    size: int
    sector: int
    directory_offset: int


def index_rom(index, base, disc_size):
    """Parse decrypted directory; reject cycles, aliasing, traversal and overlap."""
    if len(index) < 16 or index[:8] != b'ROM \x04\0\x01\0':
        raise FormatError('Expected Shin PS2 ROM version 1.4')
    sectors, checksum = struct.unpack_from('<II', index, 8)
    if sectors * SECTOR != len(index) or len(index) > MAX_INDEX:
        raise FormatError('Invalid Shin ROM index size')
    if zlib.crc32(index[16:]) != checksum:
        raise FormatError('Shin ROM directory CRC mismatch')
    if base < 0 or base % SECTOR or base + len(index) > disc_size:
        raise FormatError('Shin ROM directory outside disc')
    files, directories, names = [], set(), set()

    def walk(offset, prefix, declared_size=None, depth=0):
        if depth > 32 or offset < 16 or offset + 4 > len(index) or offset % 16:
            raise FormatError('Invalid Shin ROM directory offset/depth')
        if offset in directories:
            raise FormatError('Shin ROM directory cycle or alias')
        directories.add(offset)
        count = struct.unpack_from('<I', index, offset)[0]
        table_end = offset + 4 + count * 12
        limit = len(index) if declared_size is None else offset + declared_size
        if not 2 <= count <= 100000 or table_end > limit or limit > len(index):
            raise FormatError('Invalid Shin ROM directory table')
        for i in range(count):
            at = offset + 4 + i * 12
            name_flags, units, size = struct.unpack_from('<III', index, at)
            name_at = offset + (name_flags & 0x7fffffff)
            end = index.find(b'\0', name_at, min(limit, name_at + 1024))
            if name_at < table_end or end < 0:
                raise FormatError('Invalid Shin ROM filename extent')
            name = index[name_at:end].decode('cp932', 'strict')
            is_dir = bool(name_flags & 0x80000000)
            if name in ('.', '..'):
                if not is_dir:
                    raise FormatError('Shin ROM dot entry is not a directory')
                continue
            safe_name(name)
            reserved = {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)),
                        *(f'LPT{i}' for i in range(1, 10))}
            if '/' in name or name.endswith(('.', ' ')) or name.split('.')[0].upper() in reserved:
                raise FormatError('Shin ROM filename is not a portable file path')
            path = prefix + name
            portable = path.casefold()
            if portable in names:
                raise FormatError('Duplicate Shin ROM path')
            names.add(portable)
            if len(names) > 150000:
                raise FormatError('Shin ROM entry limit exceeded')
            if is_dir:
                walk(units * 16, path + '/', size, depth + 1)
            else:
                absolute = base + units * SECTOR
                if absolute < base + len(index) or size <= 0 or absolute + size > disc_size:
                    raise FormatError(f'Shin ROM file outside disc: {path}')
                files.append(Member(path, absolute, size, units, at))

    walk(16, '')
    ordered = sorted(files, key=lambda m: m.offset)
    for left, right in zip(ordered, ordered[1:]):
        if left.offset + left.size > right.offset:
            raise FormatError('Overlapping Shin ROM file extents')
    return files


class Rom:
    def __init__(self, path, base):
        self.path, self.base = Path(path), base
        self.size = self.path.stat().st_size
        if base < 0 or base % SECTOR or base + 16 > self.size:
            raise FormatError('Invalid Shin ROM base')
        with self.path.open('rb') as f:
            f.seek(base)
            header = f.read(16)
            if header[:8] != b'ROM \x04\0\x01\0':
                raise FormatError('Expected Shin PS2 ROM version 1.4')
            sectors, self.seed = struct.unpack_from('<II', header, 8)
            length = sectors * SECTOR
            if not 16 <= length <= MAX_INDEX or base + length > self.size:
                raise FormatError('Invalid Shin ROM index length')
            encrypted = f.read(length - 16)
        self.index = header + crypt(encrypted, self.seed)
        self.members = index_rom(self.index, base, self.size)
        self.by_name = {m.name: m for m in self.members}

    def chunks(self, name):
        member = self.by_name[name]
        with self.path.open('rb') as f:
            f.seek(member.offset)
            pos = 0
            while pos < member.size:
                data = bytearray(f.read(min(1024 * 1024, member.size - pos)))
                if not data:
                    raise FormatError(f'Truncated Shin ROM member: {name}')
                for at in range(0, len(data), SECTOR):
                    seed = (self.seed + member.sector + (pos + at) // SECTOR) & 0xffffffff
                    seed = (seed * 0x343fd + 0x269ec3) & 0xffffffff
                    stop = min(at + 16, len(data))
                    data[at:stop] = crypt(data[at:stop], seed)
                yield bytes(data)
                pos += len(data)

    def read(self, name, limit=64 * 1024 * 1024):
        if self.by_name[name].size > limit:
            raise FormatError('Shin ROM member exceeds in-memory read limit')
        return b''.join(self.chunks(name))

    def extract(self, destination, names=None):
        selected = self.members if names is None else [self.by_name[n] for n in names]
        rows = []
        for member in selected:
            record = write_stream(destination, member.name, self.chunks(member.name))
            record.pop('status', None)
            rows.append({**asdict(member), 'output': record})
        return rows

    def manifest(self):
        return {'format': 'vnkit.shin-ps2-rom', 'version': 1, 'base': self.base,
                'index_sha256': hashlib.sha256(self.index).hexdigest(),
                'index_bytes': len(self.index), 'directory_crc32': f'{self.seed:08x}',
                'members': [asdict(m) for m in self.members]}
