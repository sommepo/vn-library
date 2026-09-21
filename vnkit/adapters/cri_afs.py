"""Bounded AFS indexing and KID LZSS, for the tested Remember11 PS2 disc.

AFS end-name-table layout and LZSS ring conventions adapted from GARbro
(ArcAFS.cs / LzssStream.cs), Copyright (c) 2014-2020 morkt, MIT.
See third_party/GARbro-LICENSE.txt. Not all AFS variants are supported.
"""
import struct
from ..disc import FormatError, safe_name


def index_afs(source, archive):
    size = source.entries[archive].size
    head = source.read_at(archive, 0, 8)
    if head[:4] != b'AFS\0':
        raise FormatError(f'{archive}: not AFS')
    count = struct.unpack_from('<I', head, 4)[0]
    if not 0 < count <= 100000 or 8 + count * 8 > size:
        raise FormatError(f'{archive}: invalid AFS count')
    pairs = list(struct.iter_unpack('<II', source.read_at(archive, 8, count * 8)))
    end = 8 + count * 8
    for offset, length in pairs:
        if offset < end or length == 0 or offset + length > size:
            raise FormatError(f'{archive}: invalid/overlapping member extent')
        end = offset + length
    names_offset = (end + 2047) & ~2047
    if names_offset + count * 48 > size:
        raise FormatError(f'{archive}: missing end filename table (other AFS variants unsupported)')
    names = source.read_at(archive, names_offset, count * 48)
    members = []
    for i, (offset, length) in enumerate(pairs):
        record = names[i*48:(i+1)*48]
        name = safe_name(record[:32].split(b'\0')[0].decode('cp932'))
        if '/' in name or struct.unpack_from('<I', record, 44)[0] != length:
            raise FormatError(f'{archive}: invalid filename/size record {i}')
        # Keep ordinal identity even where two original names are equal.
        members.append({'index': i, 'name': name, 'offset': offset, 'size': length})
    return members


def unpack_lzss(data, limit=64*1024*1024):
    if len(data) < 5:
        raise FormatError('KID compressed resource: truncated header')
    expected = struct.unpack_from('<I', data)[0]
    if not 0 < expected <= limit:
        raise FormatError('KID compressed resource: invalid output size')
    ring = bytearray(4096)
    pos, cursor, output = 0xfee, 4, bytearray()
    while len(output) < expected:
        if cursor >= len(data):
            raise FormatError('KID compressed resource: truncated flag')
        flag = data[cursor]; cursor += 1
        for bit in range(8):
            if len(output) == expected:
                break
            need = 1 if flag & (1 << bit) else 2
            if cursor + need > len(data):
                raise FormatError('KID compressed resource: truncated token')
            if need == 1:
                chunk = [data[cursor]]; cursor += 1
            else:
                low, high = data[cursor:cursor+2]; cursor += 2
                offset, count = low | ((high & 0xf0) << 4), (high & 15) + 3
                if len(output) + count > expected:
                    raise FormatError('KID compressed resource: output overrun')
                # Overlapping copies must observe bytes just written to the ring.
                for n in range(count):
                    value = ring[(offset+n) & 4095]
                    output.append(value); ring[pos] = value; pos = (pos+1) & 4095
                continue
            output.extend(chunk); ring[pos] = chunk[0]; pos = (pos+1) & 4095
    if cursor != len(data):
        raise FormatError('KID compressed resource: unexplained trailing bytes')
    return bytes(output)
