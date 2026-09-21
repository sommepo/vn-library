"""Bounded read-only evidence probe for the edition's condition evaluator.

Not a PS2 emulator: no syscalls, peripherals, executable entrypoint or arbitrary
code addresses. Only 0x148240..0x148708, private input/stack and variable banks.
Used to resolve shipped malformed conditions without inventing missing aliases.
"""
import hashlib
from vnkit.disc import FormatError
from vnkit.elf import Elf32


def probe(executable, argument, banks=None):
    if hashlib.sha256(executable).hexdigest() != '1fee7a7a08db470b811e287103038f3f158a4d59c36246449c176ecc208c073a':
        raise FormatError('Untested CLANNAD condition evaluator')
    elf=Elf32(executable);mem={};registers=[0]*32;reads=set()
    signed=lambda v: (v&0xffffffff)-(0x100000000 if v&0x80000000 else 0)
    def put(at,v,n):
        for j in range(n):mem[at+j]=(v>>(8*j))&255
    def get(at,n):return sum(mem.get(at+j,0)<<(8*j) for j in range(n))
    for bank,base in [('F',0x371ab8),('Z',0x372418),('G',0x372f08)]:
        for k,v in (banks or {}).get(bank,{}).items():put(base+int(k)*2,v,2)
    # Native call receives the opening bracket.
    source=argument.encode('cp932')+b';\0'
    for j,v in enumerate(source):mem[0x800000+j]=v
    registers[4]=0x800000;registers[5]=0x900000;registers[29]=0xa10000;registers[31]=0
    pc=0x148240;delayed=None
    for steps in range(20000):
        if pc==0:return {'value':signed(get(0x900000,2)<<16)>>16,'steps':steps,'consumed':registers[2]-0x800000,'variable_reads':sorted(reads)}
        if not 0x148240<=pc<0x148708:raise FormatError(f'Condition probe left audited range at {pc:#x}')
        w=int.from_bytes(elf.at(pc,4),'little');op=w>>26;rs=w>>21&31;rt=w>>16&31;rd=w>>11&31;shift=w>>6&31;fn=w&63;imm=w&65535;si=imm if imm<32768 else imm-65536
        a,b=registers[rs],registers[rt];dest=delayed;delayed=None;nextpc=pc+4
        if op==0:
            if fn==0:registers[rd]=(b<<shift)&0xffffffff
            elif fn==3:registers[rd]=signed(b)>>shift
            elif fn==8:delayed=a
            elif fn==0x18:registers[rd]=signed(a)*signed(b)
            elif fn in (0x21,0x2d):registers[rd]=a+b
            elif fn==0x23:registers[rd]=a-b
            elif fn==0x24:registers[rd]=a&b
            elif fn==0x25:registers[rd]=a|b
            elif fn==0x2a:registers[rd]=int(signed(a)<signed(b))
            elif fn==0x2b:registers[rd]=int((a&0xffffffff)<(b&0xffffffff))
            elif fn==0x0b:
                if b:registers[rd]=a
            else:raise FormatError(f'Unsupported condition-probe instruction {w:08x} at {pc:#x}')
        elif op==9:registers[rt]=a+si
        elif op==0xa:registers[rt]=int(signed(a)<si)
        elif op==0xb:registers[rt]=int((a&0xffffffff)<(si&0xffffffff))
        elif op==0xc:registers[rt]=a&imm
        elif op==0xd:registers[rt]=a|imm
        elif op==0xe:registers[rt]=a^imm
        elif op==0xf:registers[rt]=imm<<16
        elif op in (4,5,0x14,0x15):
            taken=(a==b) if op in (4,0x14) else (a!=b)
            if taken:delayed=pc+4+si*4
            elif op in (0x14,0x15):nextpc+=4
        elif op==1:
            if rt!=1:raise FormatError('Untested condition branch')
            if signed(a)>=0:delayed=pc+4+si*4
        elif op==3:registers[31]=pc+8;delayed=(w&0x3ffffff)*4
        elif op in (0x24,0x25,0x21,0x37):
            size={0x24:1,0x25:2,0x21:2,0x37:8}[op]
            if 0x371ab8<=((a+si)&0xffffffff)<0x373ea8:reads.add((a+si)&0xffffffff)
            v=get((a+si)&0xffffffff,size)
            registers[rt]=(v-65536 if v&32768 else v) if op==0x21 else v
        elif op in (0x29,0x3f):put((a+si)&0xffffffff,b,2 if op==0x29 else 8)
        else:raise FormatError(f'Unsupported condition-probe instruction {w:08x} at {pc:#x}')
        registers[:]=[v&0xffffffff for v in registers];registers[0]=0
        pc=dest if dest is not None else nextpc
    raise FormatError('Condition probe exceeded instruction bound')
