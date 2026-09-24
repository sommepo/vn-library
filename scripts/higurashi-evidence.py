#!/usr/bin/env python3
"""Save bounded, read-only native evidence for exact Higurashi SLPM-66913.

The outputs contain original executable bytes/disassembly and remain private.
This does not execute the ELF or validate story-command semantics.
"""
import argparse
import hashlib
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.disc import FormatError, write_bytes, write_json
from vnkit.elf import Elf32
from vnkit.adapters.higurashi_ps2 import EXE_SHA256
from vnkit.adapters.higurashi_script import compact_table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    data = args.executable.read_bytes()
    if hashlib.sha256(data).hexdigest() != EXE_SHA256:
        raise FormatError('Untested Higurashi executable')
    elf = Elf32(data)
    dispatch = []
    for opcode in range(256):
        adjust, virtual, function = struct.unpack('<hhI', elf.at(0x20ca38+opcode*8, 8))
        if function != 0x15fe40:
            dispatch.append({'opcode': opcode, 'this_offset': adjust,
                             'virtual_offset': virtual, 'function': function})
    write_json(args.out, 'dispatch.json', dispatch)
    write_json(args.out, 'compact-kana.json', compact_table(data))
    ranges = {'directory': (0x12fd18, 0x218), 'sector': (0x12f9b0, 0xa0),
              'rom-base': (0x13ea18, 0x30), 'registers-entry-operands': (0x15f9e8, 0x358),
              'dispatch-step': (0x15fd40, 0x108),
              'system-word-get-set': (0x16a6f8, 0x20),
              'sget-consumer': (0x1b8470, 0xc0), 'sset-consumer': (0x1b85d0, 0x40)}
    generators = []
    # CCommandGenerator RTTI points to this native vtable. These are command
    # allocation functions, separate from the CScripter operand readers above.
    for opcode in range(0x80, 0xc1):
        slot = 0x10+(opcode-0x80)*8
        adjust, virtual, function = struct.unpack('<hhI', elf.at(0x219a48+slot, 8))
        generators.append({'opcode': opcode, 'vtable_slot': slot,
                           'this_offset': adjust, 'virtual_offset': virtual, 'function': function})
    write_json(args.out, 'command-generators.json', generators)
    for row in generators:
        address = row['function']
        following = min((r['function'] for r in generators if r['function'] > address), default=address+0x100)
        ranges[f'generator-{row["opcode"]:02x}'] = (address, min(following-address, 0x2000))
    functions = sorted({r['function'] for r in dispatch})
    for row in dispatch:
        address = row['function']
        following = min((f for f in functions if f > address), default=address+0x100)
        ranges[f'op-{row["opcode"]:02x}'] = (address, min(following-address, 0x2000))
    for name, (address, size) in ranges.items():
        elf.symbols['range'] = {'address': address, 'size': size}
        lines = [f'{r["address"]:08x} {r["word"]:08x} {r["instruction"]}'
                 for r in elf.disassemble_mips('range')]
        write_bytes(args.out, name+'.txt', ('\n'.join(lines)+'\n').encode())
    write_json(args.out, 'evidence.json', {'executable_sha256':EXE_SHA256,
               'ranges': {k: {'address': a, 'size': s} for k,(a,s) in ranges.items()},
               'notice':'Explicit static ranges, not guaranteed function boundaries; unknown MIPS words retained.'})
    print(f'Recorded {len(dispatch)} opcode handlers and {len(ranges)} static ranges; no native code executed.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f'higurashi-evidence: {error}')
