"""Exact SLPS-02296 resource recovery; source scripts are not a text playlist.

Native evidence: resource MSF reader 8001a810, scenario table 8006aca0,
LZSS decoder 80026904, bytecode dispatcher 8001c5a8. All offsets are retained.
"""
import hashlib
from pathlib import Path
import re
import struct

from ..disc import FormatError, write_bytes, write_json
from ..psx_disc import Mode2Image

EXE_SHA256 = '70e95cbbd8af166c8f004501ea2d99928fc62dc4f331ede3cd622d408b342efa'
FONT_SHA256 = '4fa89f1cb59686302f68ef3f750877217c24a5b92f86537f0cfb5527d4a5f5c5'
ADAPTER_ID = 'memoriesoff-ps1'
ADAPTER_VERSION = '0.1.0'


def detect(path):
    if Path(path).suffix.lower() != '.cue':
        return {'supported': False, 'reason': 'Memories Off PS1 needs its single-track CUE/BIN pair'}
    identify(path)
    return {'supported': True, 'playable': True, 'adapter': ADAPTER_ID,
            'adapter_version': ADAPTER_VERSION, 'title': 'Memories Off',
            'edition': 'Japanese PlayStation SLPS-02296', 'platform': 'PlayStation',
            'executable_sha256': EXE_SHA256,
            'reason': 'Experimental source-driven reader; native presentation remains incomplete'}


def inspect(path, fingerprint=False):
    disc, _ = identify(path)
    return {'identification': detect(path), 'source': disc.inspect(fingerprint),
            'archives': {'scripts': 46, 'container': 'Executable MSF tables, LZSS and XA channels'}}


def extract(source, destination):
    return recover(source, destination)


def executable_at(exe, address, length):
    offset = address - 0x8000f800
    if offset < 0x800 or length < 0 or offset + length > len(exe):
        raise FormatError(f'Memories Off executable range outside image: {address:#x}')
    return exe[offset:offset + length]


def identify(cue):
    disc = Mode2Image(cue)
    cnf = disc.read('SYSTEM.CNF')
    exe = disc.read('SLPS_022.96')
    if not re.search(rb'(?m)^BOOT\s*=\s*cdrom:\\SLPS_022\.96;1\s*$', cnf):
        raise FormatError('Memories Off boot executable mismatch')
    if hashlib.sha256(exe).hexdigest() != EXE_SHA256 or disc.volume_id != 'MEMOFF':
        raise FormatError('unrecognised Memories Off PS1 edition')
    for name, lba, size in [('DATA.BIN', 1000, 53366784), ('DISC.BIN', 30000, 500498432)]:
        entry = disc.entry(name)
        if entry.offset != lba * 2048 or entry.size != size:
            raise FormatError(f'Memories Off resource layout mismatch: {name}')
    return disc, exe


def resource(exe, pointer):
    raw = executable_at(exe, pointer, 12).split(b'\0')[0]
    if not re.fullmatch(rb'\d{7,10}', raw):
        raise FormatError(f'invalid Memories Off MSF resource at {pointer:#x}')
    minute, second, frame, count = (int(raw[:2]), int(raw[2:4]), int(raw[4:6]), int(raw[6:]))
    if second >= 60 or frame >= 75 or not 0 < count <= 32768:
        raise FormatError('invalid Memories Off MSF extent')
    lba = (minute * 60 + second) * 75 + frame - 150
    if lba < 0:
        raise FormatError('negative Memories Off resource LBA')
    return {'pointer': pointer, 'lba': lba, 'sectors': count}


def table_resource(exe, base, index, count):
    if not 0 <= index < count:
        raise FormatError('Memories Off resource index out of bounds')
    pointer = struct.unpack('<I', executable_at(exe, base + index * 4, 4))[0]
    return resource(exe, pointer) if pointer else None


def unpack(data, limit=4 * 1024**2):
    """Okumura-style ring, with compressed total length (not output length)."""
    if len(data) < 5:
        raise FormatError('Memories Off LZSS truncated header')
    end = struct.unpack_from('<I', data)[0]
    if not 4 < end <= len(data):
        raise FormatError('Memories Off LZSS compressed length out of bounds')
    ring, output = bytearray(4096), bytearray()
    cursor, position = 4, 0xfee
    while cursor < end:
        flag = data[cursor]
        cursor += 1
        for bit in range(8):
            if cursor == end:
                break
            if flag & (1 << bit):
                source, count = None, 1
                value = data[cursor]
                cursor += 1
            else:
                if cursor + 2 > end:
                    raise FormatError('Memories Off LZSS truncated reference')
                low, high = data[cursor:cursor + 2]
                cursor += 2
                source, count = low | ((high & 0xf0) << 4), (high & 15) + 3
            if len(output) + count > limit:
                raise FormatError('Memories Off LZSS output limit exceeded')
            for n in range(count):
                if source is not None:
                    value = ring[(source + n) & 4095]
                output.append(value)
                ring[position] = value
                position = (position + 1) & 4095
    return bytes(output)


# Lengths are from the exact executable's PC updates, including wait opcodes.
LENGTHS = {0: 1, 5: 2, 6: 1, 9: 1, 0x13: 1, 0x14: 1, 0x15: 1,
           0x16: 1, 0x17: 1, 0x20: 3, 0x28: 6, 0x29: 1, 0x30: 5,
           0x31: 5, 0x32: 7, 0x35: 2, 0x36: 1, 0x38: 2, 0x39: 3,
           0x49: 1, 0x50: 3, 0x5d: 2, 0x5e: 1, 0x5f: 2, 0x60: 3,
           0x61: 3, 0x62: 3, 0x68: 3, 0x6a: 3, 0x6b: 3, 0x6f: 3,
           0x75: 1, 0x76: 1, 0x78: 2, 0x79: 1, 0x7a: 1, 0x80: 3,
           0x81: 2, 0x82: 3, 0x83: 2, 0x85: 4, 0x86: 1, 0x87: 1,
           0x90: 1, 0x91: 1, 0x99: 1}


def parse_script(data, script_id):
    if not data or len(data) > 65536:
        raise FormatError('Memories Off script length outside 16-bit address space')
    cursor, rows = 0, []
    while cursor < len(data):
        opcode = data[cursor]
        row = {'offset': cursor, 'code': opcode, 'id': f'mo1:{script_id}:{cursor:04x}'}
        length = LENGTHS.get(opcode)
        if opcode in (0x10, 0x11):
            start = cursor + (3 if opcode == 0x10 else 1)
            if opcode == 0x10:
                end_match = re.search(rb'\x81\x66[\x00\x01]', data[start:])
                if not end_match:
                    raise FormatError(f'{row["id"]}: unterminated text')
                end = start + end_match.end() - 1
                row['read_id'] = int.from_bytes(data[cursor + 1:cursor + 3], 'little')
                row['continuation'] = data[end]
            else:
                end = data.find(b'\0', start)
                if end < 0:
                    raise FormatError(f'{row["id"]}: unterminated choice strings')
            row['raw_text'] = data[start:end].hex()
            length = end + 1 - cursor
        elif opcode == 0x52:
            pos = cursor + 1
            clauses = []
            while True:
                if pos + 6 > len(data) or len(clauses) >= 64:
                    raise FormatError(f'{row["id"]}: truncated/oversized condition')
                kind, low, high, compare, value, more = data[pos:pos + 6]
                if compare not in (1, 2, 3, 4, 5):
                    raise FormatError(f'{row["id"]}: unknown condition comparison {compare}')
                clauses.append({'kind': kind, 'variable': low | (high << 8),
                                'compare': compare, 'value': value})
                pos += 5
                if not more:
                    pos += 3
                    break
                if pos + 2 >= len(data):
                    raise FormatError(f'{row["id"]}: truncated condition join')
                clauses[-1]['join'] = data[pos + 1]
                pos += 2
            row['clauses'] = clauses
            length = pos - cursor
        if length is None or cursor + length > len(data):
            raise FormatError(f'{row["id"]}: unknown/truncated command {opcode:#x}')
        row['next'] = cursor + length
        row['args'] = list(data[cursor + 1:cursor + length]) if opcode not in (0x10, 0x11) else []
        rows.append(row)
        cursor += length
    boundaries = {row['offset'] for row in rows}
    for row in rows:
        if row['code'] in (0x50, 0x52):
            target = int.from_bytes(bytes(row['args'][-2:]), 'little')
            row['target'] = target
            if target not in boundaries:
                # Retain the original target; execution must stop if reached.
                row['unresolved_target'] = target
    return {'id': str(script_id), 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'instructions': rows}


def recover(cue, destination):
    disc, exe = identify(cue)
    destination = Path(destination)
    records = []
    write_bytes(destination, 'source/SLPS_022.96', exe)
    write_bytes(destination, 'source/SYSTEM.CNF', disc.read('SYSTEM.CNF'))
    font_resource = table_resource(exe, 0x8006ac9c, 0, 1)
    font = disc.read_at(font_resource['lba'] * 2048, font_resource['sectors'] * 2048)
    if hashlib.sha256(font).hexdigest() != FONT_SHA256:
        raise FormatError('Memories Off source font mismatch')
    write_bytes(destination, 'source/font.bin', font)
    for index in range(48):
        extent = table_resource(exe, 0x8006aca0, index, 48)
        if extent is None:
            continue
        packed = disc.read_at(extent['lba'] * 2048, extent['sectors'] * 2048)
        decoded = unpack(packed, 65536)
        script = parse_script(decoded, index)
        write_bytes(destination, f'source/scripts/{index:02}.bin', decoded)
        write_json(destination, f'scripts/{index:02}.json', script)
        records.append({'id': index, **extent, 'size': len(decoded), 'sha256': script['sha256'],
                        'instructions': len(script['instructions']),
                        'unresolved_targets': [r['offset'] for r in script['instructions'] if 'unresolved_target' in r]})
    report = {'status': 'recovery-only', 'serial': 'SLPS-02296', 'platform': 'ps1',
              'executable_sha256': EXE_SHA256, 'font_sha256': FONT_SHA256,
              'scripts': records, 'limits': ['Runtime and media validation required before library admission.']}
    write_json(destination, 'recovery.json', report)
    return report


if __name__ == '__main__':
    import argparse
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cue', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = recover(args.cue, args.out)
        print(json.dumps({'status': report['status'], 'scripts': len(report['scripts']),
                          'instructions': sum(r['instructions'] for r in report['scripts']),
                          'unresolved_targets': sum(len(r['unresolved_targets']) for r in report['scripts'])}))
    except (OSError, ValueError) as error:
        parser.exit(2, f'Memories Off recovery: {error}\n')
