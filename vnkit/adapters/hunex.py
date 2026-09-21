"""Bounded HuneX MZX/MRG helpers; support is validated per edition.

MZX algorithm adapted from mangetsu (MIT, Ross Schlaikjer), with bounds checks,
output termination and the documented 4096-word reset restored. See provenance.
"""
import struct
from vnkit.disc import FormatError


def decompress_mzx(data, invert=True, max_size=64*1024*1024):
    if len(data) < 8 or data[:4] != b'MZX0':
        raise FormatError('expected MZX0 header')
    size = struct.unpack_from('<I', data, 4)[0]
    if size > max_size:
        raise FormatError('MZX output exceeds limit')
    xor = 255 if invert else 0
    ring = [bytes([xor, xor])] * 64
    out, cursor, ring_at, remaining = bytearray(), 8, 0, 0
    last = bytes([xor, xor])
    def take(n):
        nonlocal cursor
        if cursor + n > len(data):
            raise FormatError(f'truncated MZX command at {cursor:#x}')
        b = data[cursor:cursor+n]; cursor += n
        return b
    while len(out) < size:
        if remaining <= 0:
            remaining, last = 4096, bytes([xor, xor])
        command = take(1)[0]; kind, length = command & 3, (command >> 2) + 1
        words = 1 if kind == 2 else length
        # Source encoders may finish with a full word run; the header truncates
        # that final run. Every command is bounded to at most 128 output bytes.
        if kind == 0:
            out.extend(last * length)
        elif kind == 1:
            distance = (take(1)[0] + 1) * 2
            if distance > len(out):
                raise FormatError(f'MZX backreference before output at {cursor-1:#x}')
            for _ in range(length):
                at = len(out)-distance; last = bytes(out[at:at+2]); out.extend(last)
        elif kind == 2:
            last = ring[length-1]; out.extend(last)
        else:
            for _ in range(length):
                raw = take(2); last = bytes([raw[0]^xor, raw[1]^xor]); out.extend(last)
                ring[ring_at] = last; ring_at = (ring_at+1) & 63
        remaining -= words
    return bytes(out[:size]), {'compressed_consumed': cursor, 'decompressed_size': size}


def mrg_sections(data):
    """mrgd00 section table, using packed sector/offset/length fields."""
    if len(data)<8 or data[:6]!=b'mrgd00':
        raise FormatError('expected mrgd00')
    count = struct.unpack_from('<H', data, 6)[0]
    start = 8 + count*8
    if not count or start > len(data):
        raise FormatError('invalid mrgd00 table size')
    sections = []
    for i in range(count):
        sector, offset, sectors, length = struct.unpack_from('<HHHH', data, 8+i*8)
        at = start + sector*2048 + offset
        size = ((sectors*2048) & ~65535) | length
        if size > sectors*2048:
            size -= 65536
        if offset >= 2048 or sectors < 1 or size < 0 or at+size > len(data):
            raise FormatError(f'mrgd00 section {i} out of bounds')
        sections.append({'index':i, 'offset':at, 'size':size, 'data':data[at:at+size]})
    return sections
