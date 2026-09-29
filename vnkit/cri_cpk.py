"""Bounded read-only CPK/UTF and CRILAYLA recovery for observed CRI archives.

UTF layout was cross-checked with vgmstream's ISC-licensed cri_utf.c; retain
third_party/LICENSE-vgmstream.txt. Unsupported table variants fail closed.
Archive directory strings are metadata, never host paths. Members are identified
by numeric ID because valid CPKs can contain duplicate filenames.
"""
from dataclasses import dataclass
import struct

from .disc import FormatError, safe_name

MAX_TABLE = 8 * 1024**2
MAX_MEMBER = 128 * 1024**2


def utf_table(data):
    if len(data) < 32 or data[:4] != b'@UTF':
        raise FormatError('invalid UTF header')
    size, rows, strings, blob, name, columns, width, count = struct.unpack_from('>IIIIIHHI', data, 4)
    size, rows, strings, blob = size + 8, rows + 8, strings + 8, blob + 8
    if not 32 <= rows <= strings < blob <= size <= len(data) or size > MAX_TABLE:
        raise FormatError('UTF section bounds or unsupported version')
    if not 0 < columns <= 256 or count > 100000 or rows + width * count > strings:
        raise FormatError('UTF row/column bounds')

    def string(index):
        start = strings + index
        if not strings <= start < blob:
            raise FormatError('UTF string pointer outside table')
        end = data.find(b'\0', start, blob)
        if end < 0:
            raise FormatError('unterminated UTF string')
        try:
            return data[start:end].decode('utf-8', 'strict')
        except UnicodeError as error:
            raise FormatError('unsupported UTF string encoding') from error

    def value(kind, at, end):
        formats = ('B', 'b', 'H', 'h', 'I', 'i', 'Q', 'q', 'f', 'd', 'I', 'II')
        fmt = '>' + formats[kind]
        length = struct.calcsize(fmt)
        if at + length > end:
            raise FormatError('UTF value outside its row/schema')
        result = struct.unpack_from(fmt, data, at)
        if kind == 10:
            return string(result[0]), length
        if kind == 11:
            offset, length_data = result
            if blob + offset + length_data > size:
                raise FormatError('UTF data extent outside table')
            return data[blob + offset:blob + offset + length_data], length
        return result[0], length

    schema, names, cursor = [], set(), 32
    for _ in range(columns):
        if cursor + 5 > rows:
            raise FormatError('truncated UTF schema')
        flags, key = struct.unpack_from('>BI', data, cursor)
        cursor += 5
        kind, storage = flags & 15, flags & 0xf0
        if kind > 11 or storage not in (0x10, 0x30, 0x50):
            raise FormatError('unsupported UTF column type/storage')
        key = string(key)
        if key in names:
            raise FormatError('duplicate UTF column')
        names.add(key)
        constant = '' if kind == 10 else (b'' if kind == 11 else 0)
        if storage == 0x30:
            constant, length = value(kind, cursor, rows)
            cursor += length
        schema.append((key, kind, storage, constant))
    result = []
    for index in range(count):
        cursor, end = rows + index * width, rows + (index + 1) * width
        row = {}
        for key, kind, storage, constant in schema:
            if storage == 0x50:
                constant, length = value(kind, cursor, end)
                cursor += length
            row[key] = constant
        if cursor != end:
            raise FormatError('UTF row width does not match schema')
        result.append(row)
    return string(name), result


def decompress_crilayla(data, expected):
    """Reverse MSB-first LZ stream; preserve the uncompressed 256-byte prefix."""
    if not 0 <= expected <= MAX_MEMBER:
        raise FormatError('CPK member exceeds recovery limit')
    if not data.startswith(b'CRILAYLA'):
        if len(data) != expected:
            raise FormatError('CPK uncompressed member length mismatch')
        return data
    if len(data) < 16:
        raise FormatError('truncated CRILAYLA header')
    length, packed = struct.unpack_from('<II', data, 8)
    if length + 256 != expected or 16 + packed + 256 != len(data):
        raise FormatError('CRILAYLA input/output extent mismatch')
    output = bytearray(expected)
    output[:256] = data[16 + packed:]
    position, byte_position, remaining, byte = expected - 1, 16 + packed - 1, 0, 0

    def bits(count):
        nonlocal byte_position, remaining, byte
        result = 0
        for _ in range(count):
            if not remaining:
                if byte_position < 16:
                    raise FormatError('truncated CRILAYLA bitstream')
                byte = data[byte_position]
                byte_position -= 1
                remaining = 8
            remaining -= 1
            result = (result << 1) | ((byte >> remaining) & 1)
        return result

    while position >= 256:
        if bits(1) == 0:
            output[position] = bits(8)
            position -= 1
            continue
        distance, count = bits(13) + 3, 3
        for width in (2, 3, 5, 8):
            extra = bits(width)
            count += extra
            if extra != (1 << width) - 1:
                break
        else:
            while True:
                extra = bits(8)
                count += extra
                if extra != 255:
                    break
                if count > expected:
                    raise FormatError('CRILAYLA run exceeds output')
        if position + distance >= expected or count > position - 255:
            raise FormatError('CRILAYLA reference outside output')
        for _ in range(count):
            output[position] = output[position + distance]
            position -= 1
    return bytes(output)


@dataclass(frozen=True)
class CpkMember:
    id: int
    name: str
    directory: str
    offset: int
    size: int
    extracted_size: int


class CpkArchive:
    def __init__(self, source, name):
        self.source, self.name = source, name
        self.size = source.entries[name].size
        self._metadata_extents = []
        table_name, header = self._packet(0, b'CPK ')
        if table_name != 'CpkHeader' or len(header) != 1:
            raise FormatError('CPK header table mismatch')
        self.header = header[0]
        toc = self._integer(self.header, 'TocOffset')
        content = self._integer(self.header, 'ContentOffset')
        content_size = self._integer(self.header, 'ContentSize')
        if toc < 16 or content < 16 or content + content_size > self.size:
            raise FormatError('CPK content extent mismatch')
        # The observed trailing-TOC variant records ContentSize=0. Its content
        # ends at the TOC, not at end-of-file (which also includes metadata).
        content_end = content + content_size
        if content_size == 0 and toc > content:
            content_end = toc
        table_name, rows = self._packet(toc, b'TOC ')
        if table_name != 'CpkTocInfo' or len(rows) != self._integer(self.header, 'Files'):
            raise FormatError('CPK TOC count mismatch')
        self.members, identifiers, extents = [], set(), []
        for row in rows:
            ident = self._integer(row, 'ID')
            size = self._integer(row, 'FileSize')
            extracted = self._integer(row, 'ExtractSize')
            offset = min(toc, content) + self._integer(row, 'FileOffset')
            filename, directory = row.get('FileName'), row.get('DirName')
            if not isinstance(filename, str) or not isinstance(directory, str):
                raise FormatError('CPK filename/directory type mismatch')
            safe_name(filename)
            if '/' in filename or ident in identifiers or ident > 0xffffffff:
                raise FormatError('CPK non-basename filename or duplicate/invalid ID')
            if not content <= offset <= offset + size <= content_end:
                raise FormatError('CPK member outside content extent')
            if size > MAX_MEMBER or extracted > MAX_MEMBER:
                raise FormatError('CPK member exceeds recovery limit')
            identifiers.add(ident)
            extents.append((offset, offset + size))
            self.members.append(CpkMember(ident, filename, directory, offset, size, extracted))
        last_end = content
        for start, end in sorted(extents):
            if start < last_end:
                raise FormatError('overlapping CPK members')
            if any(start < meta_end and meta_start < end
                   for meta_start, meta_end in self._metadata_extents):
                raise FormatError('CPK member overlaps archive metadata')
            last_end = end

    @staticmethod
    def _integer(row, key):
        result = row.get(key)
        if type(result) is not int or result < 0:
            raise FormatError(f'CPK invalid integer field {key}')
        return result

    def _packet(self, offset, magic):
        header = self.source.read_at(self.name, offset, 16)
        if header[:4] != magic or struct.unpack_from('<I', header, 4)[0] != 0xff:
            raise FormatError('unsupported CPK packet header')
        length = struct.unpack_from('<Q', header, 8)[0]
        if not 32 <= length <= MAX_TABLE or offset + 16 + length > self.size:
            raise FormatError('CPK table outside archive')
        if any(offset < end and start < offset + 16 + length
               for start, end in self._metadata_extents):
            raise FormatError('overlapping CPK metadata tables')
        self._metadata_extents.append((offset, offset + 16 + length))
        return utf_table(self.source.read_at(self.name, offset + 16, length))

    def read(self, member):
        if member not in self.members:
            raise FormatError('CPK member is not in this archive')
        data = b''.join(self.source.chunks(self.name, member.offset, member.size))
        return decompress_crilayla(data, member.extracted_size)
