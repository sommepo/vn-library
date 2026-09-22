"""Minimal bounded ELF32 static evidence reader; never executes input."""
import struct
from .disc import FormatError

class Elf32:
    def __init__(self, data):
        self.data=data
        if data[:7]!=b'\x7fELF\x01\x01\x01' or len(data)<52:
            raise FormatError('expected little-endian ELF32')
        self.machine=struct.unpack_from('<H',data,18)[0]
        self.entry=struct.unpack_from('<I',data,24)[0]
        phoff,shoff=struct.unpack_from('<II',data,28)
        phsize,phnum,shsize,shnum=struct.unpack_from('<HHHH',data,42)
        if phsize!=32 or shsize!=40 or phnum>1024 or shnum>65535:
            raise FormatError('unsupported ELF header sizes')
        self.programs=[struct.unpack('<IIIIIIII',self.read(phoff+i*32,32)) for i in range(phnum)]
        self.sections=[struct.unpack('<IIIIIIIIII',self.read(shoff+i*40,40)) for i in range(shnum)]
        self.symbols={}
        self.symbol_count=0
        for section in self.sections:
            if section[1]!=2:continue
            _,_,_,_,offset,size,link,_,_,entsize=section
            if entsize!=16 or size%16 or link>=len(self.sections):raise FormatError('malformed ELF symtab')
            strings=self.sections[link]
            string_data=self.read(strings[4],strings[5])
            for at in range(offset,offset+size,16):
                name,value,length,info,other,shndx=struct.unpack('<IIIBBH',self.read(at,16))
                if name>=len(string_data):raise FormatError('ELF symbol name out of bounds')
                end=string_data.find(b'\0',name)
                if end<0:raise FormatError('ELF symbol name unterminated')
                label=string_data[name:end].decode('ascii','strict')
                self.symbol_count+=1
                if label and length:self.symbols[label]={'address':value,'size':length,'type':info&15,'section':shndx}

    def read(self,offset,size):
        if offset<0 or size<0 or offset+size>len(self.data):raise FormatError('ELF file range out of bounds')
        return self.data[offset:offset+size]

    def at(self,address,size):
        for p in self.programs:
            if p[0]==1 and p[2]<=address and address+size<=p[2]+p[4]:
                return self.read(p[1]+address-p[2],size)
        raise FormatError(f'ELF address has no file bytes: {address:#x}')

    def direct_calls(self,name):
        symbol=self.symbols[name]
        reverse={v['address']:k for k,v in self.symbols.items()}
        data=self.at(symbol['address'],symbol['size']);calls=[]
        for offset in range(0,len(data)-3,4):
            word=struct.unpack_from('<I',data,offset)[0]
            if word>>26==3:
                address=((symbol['address']+offset+4)&0xf0000000)|((word&0x3ffffff)<<2)
                calls.append({'site':symbol['address']+offset,'target':address,'symbol':reverse.get(address)})
        return calls

    def evidence(self):
        handlers={}
        for name,symbol in self.symbols.items():
            if name.startswith('__scrCmd'):
                handlers[name]={'address':symbol['address'],'size':symbol['size'],'direct_calls':self.direct_calls(name)}
        return {'format':'ELF32 little endian','machine':self.machine,'entry':self.entry,
                'symbol_count':self.symbol_count,'named_sized_symbols':len(self.symbols),'opcode_handlers':handlers}

    def disassemble_mips(self, name):
        """Evidence-only MIPS subset. Unknown/R5900 words remain explicit .word.

        This is not an emulator, decompiler, or full instruction-set decoder.
        It exposes retained function boundaries, literal loads and direct calls
        needed to independently inspect the documented adapter decisions.
        """
        regs=('zero at v0 v1 a0 a1 a2 a3 t0 t1 t2 t3 t4 t5 t6 t7 '
              's0 s1 s2 s3 s4 s5 s6 s7 t8 t9 k0 k1 gp sp fp ra').split()
        symbol=self.symbols[name]
        reverse={v['address']:k for k,v in self.symbols.items()}
        data=self.at(symbol['address'],symbol['size']);output=[]
        for offset in range(0,len(data)-3,4):
            pc=symbol['address']+offset;word=struct.unpack_from('<I',data,offset)[0]
            op=word>>26;rs=regs[(word>>21)&31];rt=regs[(word>>16)&31];rd=regs[(word>>11)&31]
            unsigned=word&65535;im=unsigned if unsigned<32768 else unsigned-65536
            text=f'.word 0x{word:08x} (undecoded)'
            if not word:text='nop'
            elif op in (2,3):
                target=((pc+4)&0xf0000000)|((word&0x3ffffff)<<2)
                text=f'{"jal" if op==3 else "j"} {reverse.get(target,hex(target))}'
            elif op==0:
                fn=word&63
                if fn in (0,2,3):text=f'{ {0:"sll",2:"srl",3:"sra"}[fn]} {rd}, {rt}, {(word>>6)&31}'
                elif fn in (8,9):text=f'{"jr" if fn==8 else "jalr"} {rs}'
                elif fn in (0x10,0x12):text=f'{"mfhi" if fn==0x10 else "mflo"} {rd}'
                elif fn in (0x18,0x19,0x1a,0x1b):
                    destination=f'{rd}, ' if fn in (0x18,0x19) and rd!='zero' else ''
                    text=f'{ {0x18:"mult",0x19:"multu",0x1a:"div",0x1b:"divu"}[fn]} {destination}{rs}, {rt}'
                elif fn in (0x3c,0x3e,0x3f):text=f'{ {0x3c:"dsll32",0x3e:"dsrl32",0x3f:"dsra32"}[fn]} {rd}, {rt}, {(word>>6)&31}'
                elif fn in (4,6,7):text=f'{ {4:"sllv",6:"srlv",7:"srav"}[fn]} {rd}, {rt}, {rs}'
                elif fn in (10,11,0x21,0x23,0x24,0x25,0x27,0x2a,0x2b,0x2d,0x2f):
                    text=f'{ {4:"sllv",6:"srlv",7:"srav",10:"movz",11:"movn",0x21:"addu",0x23:"subu",0x24:"and",0x25:"or",0x27:"nor",0x2a:"slt",0x2b:"sltu",0x2d:"daddu",0x2f:"dsubu"}[fn]} {rd}, {rs}, {rt}'
                elif fn in (0x11,0x13):text=f'{"mthi" if fn==0x11 else "mtlo"} {rs}'
            elif op==1 and (word>>16)&31 in (0,1,2,3):
                text=f'{ {0:"bltz",1:"bgez",2:"bltzl",3:"bgezl"}[(word>>16)&31]} {rs}, {pc+4+im*4:#x}'
            elif op in (0x14,0x15):text=f'{"beql" if op==0x14 else "bnel"} {rs}, {rt}, {pc+4+im*4:#x}'
            elif op in (4,5):text=f'{"beq" if op==4 else "bne"} {rs}, {rt}, {pc+4+im*4:#x}'
            elif op in (6,7):text=f'{"blez" if op==6 else "bgtz"} {rs}, {pc+4+im*4:#x}'
            elif op==0x1c and word&63==0x28 and (word>>6)&31==0x18:text=f'por {rd}, {rs}, {rt}'
            elif op in (8,9,10,11,12,13,15):
                text=f'{ {8:"addi",9:"addiu",10:"slti",11:"sltiu",12:"andi",13:"ori",15:"lui"}[op]} {rt}, {rs}, {unsigned if op in (12,13,15) else im:#x}'
            elif op in (0x31,0x39):text=f'{"lwc1" if op==0x31 else "swc1"} f{(word>>16)&31}, {im:#x}({rs})'
            elif op==0x11:
                fmt=(word>>21)&31;ft=(word>>16)&31;fs=(word>>11)&31;fd=(word>>6)&31;fn=word&63
                if fmt in (0,4):text=f'{"mfc1" if fmt==0 else "mtc1"} {rt}, f{fs}'
                elif fmt==8 and ft in (0,1,2,3):text=f'{ {0:"bc1f",1:"bc1t",2:"bc1fl",3:"bc1tl"}[ft]} {pc+4+im*4:#x}'
                elif fmt==20 and fn==0x20:text=f'cvt.s.w f{fd}, f{fs}'
                elif fmt==16:
                    if fn in (0,1,2,3):text=f'{ {0:"add.s",1:"sub.s",2:"mul.s",3:"div.s"}[fn]} f{fd}, f{fs}, f{ft}'
                    elif fn in (4,5,6,7,0x24):text=f'{ {4:"sqrt.s",5:"abs.s",6:"mov.s",7:"neg.s",0x24:"cvt.w.s"}[fn]} f{fd}, f{fs}'
                    elif fn in (0x18,0x19,0x1a):text=f'{ {0x18:"adda.s",0x19:"suba.s",0x1a:"mula.s"}[fn]} ACC, f{fs}, f{ft}'
                    elif fn in (0x1c,0x1d):text=f'{"madd.s" if fn==0x1c else "msub.s"} f{fd}, f{fs}, f{ft}'
                    elif fn in (0x32,0x34,0x36):text=f'{ {0x32:"c.eq.s",0x34:"c.lt.s",0x36:"c.le.s"}[fn]} f{fs}, f{ft}'
            elif op in (0x1e,0x1f,0x20,0x21,0x23,0x24,0x25,0x27,0x28,0x29,0x2b,0x37,0x3f):
                text=f'{ {0x1e:"lq",0x1f:"sq",0x20:"lb",0x21:"lh",0x23:"lw",0x24:"lbu",0x25:"lhu",0x27:"lwu",0x28:"sb",0x29:"sh",0x2b:"sw",0x37:"ld",0x3f:"sd"}[op]} {rt}, {im:#x}({rs})'
            output.append({'address':pc,'word':word,'instruction':text})
        return output

if __name__=='__main__':
    import argparse
    import json
    from pathlib import Path
    parser=argparse.ArgumentParser(description='Read-only static ELF symbol/MIPS evidence (no execution). Output may contain private game data.')
    parser.add_argument('executable',type=Path)
    parser.add_argument('symbols',nargs='*',help='Named functions to inspect; omit for handler evidence JSON')
    args=parser.parse_args()
    try:
        elf=Elf32(args.executable.read_bytes())
        if not args.symbols:print(json.dumps(elf.evidence(),indent=2))
        for name in args.symbols:
            print(name)
            for row in elf.disassemble_mips(name):print(f"{row['address']:08x}  {row['word']:08x}  {row['instruction']}")
    except (OSError,FormatError,KeyError) as error:
        parser.exit(2,f'{error}\n')
