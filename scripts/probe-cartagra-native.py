#!/usr/bin/env python3
"""Save bounded static MIPS evidence from the exact Cartagra PS2 executable."""
import argparse
import hashlib
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.elf import Elf32
from vnkit.disc import FormatError, write_bytes
from vnkit.adapters.cartagra_ps2 import EXE_SHA256


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('executable', type=Path)
    p.add_argument('address', type=lambda s: int(s, 0))
    p.add_argument('size', type=lambda s: int(s, 0))
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    data = a.executable.read_bytes()
    if hashlib.sha256(data).hexdigest() != EXE_SHA256 or not 0 < a.size <= 131072:
        raise FormatError('Untested executable or excessive probe size')
    e = Elf32(data)
    e.symbols['probe'] = {'address': a.address, 'size': a.size}
    rows = e.disassemble_mips('probe')
    text = '\n'.join(f"{r['address']:08x} {r['word']:08x} {r['instruction']}" for r in rows)+'\n'
    write_bytes(a.out.parent, a.out.name, text.encode())
    print(f'Saved {len(rows)} static instructions to {a.out}')


if __name__ == '__main__':
    main()
