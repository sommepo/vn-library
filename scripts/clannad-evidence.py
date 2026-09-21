"""Read-only MIPS evidence for the stripped SLPM-66302 executable.

Addresses are explicit user/research inputs; this tool never executes game code.
"""
import argparse
from pathlib import Path
import struct
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from vnkit.elf import Elf32

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('executable',type=Path)
p.add_argument('--xref',type=lambda s:int(s,0))
p.add_argument('--address',type=lambda s:int(s,0))
p.add_argument('--bytes',type=lambda s:int(s,0),default=0x200)
a=p.parse_args(); elf=Elf32(a.executable.read_bytes())
if a.xref is not None:
    for section in elf.sections:
        if not section[2]&4: continue
        address,offset,size=section[3:6]
        words=list(struct.unpack('<'+'I'*(size//4),elf.read(offset,size//4*4)))
        for i,w in enumerate(words):
            if w>>26!=15:continue
            register=(w>>16)&31; high=(w&65535)<<16
            for j in range(i+1,min(i+17,len(words))):
                ins=words[j];op=ins>>26;rs=(ins>>21)&31;rt=(ins>>16)&31;im=ins&65535
                if rs==register and op in (9,13,0x20,0x21,0x23,0x24,0x25,0x27,0x28,0x29,0x2b,0x31,0x37,0x39):
                    value=(high|im) if op==13 else (high+(im if im<32768 else im-65536))&0xffffffff
                    if value==a.xref: print(f'{address+i*4:#x} -> {address+j*4:#x}: {value:#x}')
                if rt==register and op in (9,13,15,35):break
if a.address is not None:
    if not 0<a.bytes<=0x10000:p.error('bytes must be 1..65536')
    elf.symbols['range']={'address':a.address,'size':a.bytes}
    for row in elf.disassemble_mips('range'):
        print(f'{row["address"]:08x} {row["word"]:08x} {row["instruction"]}')
