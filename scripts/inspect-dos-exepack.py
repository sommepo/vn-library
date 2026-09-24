#!/usr/bin/env python3
"""Bounded static EXEPACK expansion for disassembly; never executes the input.

Supports only the stub measured in the supplied AI5X/INSTALL executables.
The result is an unrelocated load-module binary, not a runnable replacement EXE.
"""
import argparse
import hashlib
from pathlib import Path
import struct
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.disc import FormatError, write_bytes, write_json


def expand(data):
    if len(data) < 32 or data[:2] != b'MZ':
        raise FormatError('not a DOS MZ file')
    header, ip, cs = struct.unpack_from('<H', data, 8)[0] * 16, *struct.unpack_from('<HH', data, 20)
    base = header + cs * 16
    if ip != 16 or base + 0x132 > len(data) or data[base+14:base+16] != b'RB':
        raise FormatError('unsupported EXEPACK header/stub')
    output_size = struct.unpack_from('<H', data, base+12)[0] * 16
    if not 0 < output_size <= 1024 * 1024:
        raise FormatError('EXEPACK output size limit')
    src = base - 1
    while src >= base - 16 and data[src] == 255:
        src -= 1
    out = bytearray(output_size)
    dst = output_size
    runs = 0
    while True:
        if src < header + 2:
            raise FormatError('truncated EXEPACK control')
        opcode = data[src]
        count = int.from_bytes(data[src-2:src], 'little')
        src -= 3
        if not count or count > dst or runs > 65536:
            raise FormatError('EXEPACK invalid run')
        if opcode & 0xfe == 0xb0:
            if src < header:
                raise FormatError('truncated EXEPACK fill')
            out[dst-count:dst] = bytes([data[src]]) * count
            src -= 1
        elif opcode & 0xfe == 0xb2:
            if src - count + 1 < header:
                raise FormatError('truncated EXEPACK literal')
            out[dst-count:dst] = data[src-count+1:src+1]
            src -= count
        else:
            raise FormatError(f'unknown EXEPACK opcode {opcode:#x}')
        dst -= count
        runs += 1
        if opcode & 1:
            break
    if src - header + 1 != dst:
        raise FormatError(f'EXEPACK unaccounted input/output prefix: {src - header + 1}/{dst}')
    # The native backward expansion leaves the unchanged prefix in place.
    out[:dst] = data[header:src+1]
    return bytes(out), dict(header_size=header, packed_stub_offset=base,
                            original_ip=int.from_bytes(data[base:base+2], 'little'),
                            original_cs=int.from_bytes(data[base+2:base+4], 'little'),
                            runs=runs, unchanged_prefix=dst, relocations='not applied; load-module base zero')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    if a.input.stat().st_size > 1024 * 1024:
        raise FormatError('MZ input limit')
    raw = a.input.read_bytes()
    data, report = expand(raw)
    report['input_sha256'] = hashlib.sha256(raw).hexdigest()
    report['output'] = {k: v for k, v in write_bytes(a.out, 'module.bin', data).items() if k != 'status'}
    write_json(a.out, 'exepack.json', report)
    print(f'Statically expanded {len(data)} bytes; no executable was run.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f'exepack-inspect: {error}')
