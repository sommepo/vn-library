"""YU-NO PC-98 CD resource volumes, measured from this edition's AI5X input.

No third-party implementation is copied here. This is not the Windows ARC/DAT
layout. A four-byte header precedes encrypted 20-byte directory records. The
payloads themselves are returned unchanged, including compressed MES files.
"""
from dataclasses import dataclass
import re
import struct

from ..disc import FormatError


@dataclass(frozen=True)
class Entry:
    name: str
    offset: int
    size: int
    index_offset: int


def entries(data: bytes) -> list[Entry]:
    if len(data) < 4 or len(data) > 16 * 1024 * 1024:
        raise FormatError('PC-98 resource volume size is invalid')
    count, version, key = struct.unpack_from('<HBB', data)
    end = 4 + count * 20
    if version != 1 or not 1 <= count <= 4096 or end > len(data):
        raise FormatError('unsupported PC-98 resource volume directory')
    table = bytes((((x >> 1) | (x << 7)) & 255) ^ ((key + i) & 255)
                  for i, x in enumerate(data[4:end]))
    result = []
    seen = set()
    expected_offset = 0
    for i in range(count):
        row = table[i*20:(i+1)*20]
        name_field = row[:14]
        terminator = name_field.find(b'\0')
        if terminator < 0 or any(name_field[terminator:]):
            raise FormatError(f'invalid resource name padding at directory row {i}')
        name = name_field[:terminator].decode('ascii', 'strict')
        if not re.fullmatch(r'[A-Z0-9_]{1,8}\.[A-Z0-9]{1,3}', name) or name in seen:
            raise FormatError(f'invalid/duplicate resource name at directory row {i}')
        offset, size = struct.unpack_from('<IH', row, 14)
        if offset != expected_offset or not size or end + offset + size > len(data):
            raise FormatError(f'invalid resource extent at directory row {i}')
        result.append(Entry(name, end + offset, size, 4 + i * 20))
        seen.add(name)
        expected_offset += size
    if end + expected_offset != len(data):
        raise FormatError('resource volume has unaccounted trailing data')
    return result


def expand_mes(data: bytes) -> bytes:
    """AI5X 0000:9ee2: MSB bits, 4 KiB ring at 1, 12/4 reference, +2 length.

    A zero reference ends the stream. Unlike byte-flag LZSS in the PS2 adapters,
    flags and literals share one bitstream. No dictionary state is invented:
    references to unwritten positions stop instead of inheriting another file.
    """
    bit = 0
    ring = bytearray(4096)
    written = bytearray(4096)
    cursor = 1
    output = bytearray()

    def read(width):
        nonlocal bit
        if bit + width > len(data) * 8:
            raise FormatError('truncated PC-98 MES compression stream')
        value = 0
        for _ in range(width):
            value = (value << 1) | ((data[bit // 8] >> (7 - bit % 8)) & 1)
            bit += 1
        return value

    def emit(value):
        nonlocal cursor
        if len(output) >= 65535:
            raise FormatError('PC-98 MES exceeds native segment size')
        output.append(value)
        ring[cursor] = value
        written[cursor] = 1
        cursor = (cursor + 1) & 4095

    while True:
        if read(1):
            emit(read(8))
        else:
            position = read(12)
            if not position:
                # The compressor may add zero bytes after its stop code.
                if any(read(1) for _ in range(len(data) * 8 - bit)):
                    raise FormatError('nonzero trailing MES compressed data')
                break
            for _ in range(read(4) + 2):
                if not written[position]:
                    raise FormatError('MES refers to uninitialised native dictionary state')
                emit(ring[position])
                position = (position + 1) & 4095
    return bytes(output)
