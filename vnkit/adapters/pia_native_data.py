"""Edition-specific native lookup recovery from bounded static MIPS evaluation.

Only _NgrbChgName is evaluated, in an isolated byte dictionary with a strict
instruction/call allowlist. No executable is launched and no system calls exist.
The resulting private mappings retain the original game's text.
"""
import struct
from ..disc import FormatError


def _signed(n):
    n &= 0xffffffff
    return n if n < 0x80000000 else n - 0x100000000


class NameLookup:
    def __init__(self, elf):
        self.elf = elf
        self.symbol = elf.symbols['_NgrbChgName']
        self.start = self.symbol['address']
        self.end = self.start + self.symbol['size']
        self.calls = {v['address']: k for k, v in elf.symbols.items()}
        self.compared = set()

    def read(self, at, count):
        if 0x400000 <= at and at + count <= 0x420000:
            return bytes(self.mem.get(at+i, 0) for i in range(count))
        return self.elf.at(at, count)

    def write(self, at, data):
        if not 0x400000 <= at <= at+len(data) <= 0x420000:
            raise FormatError(f'name lookup attempted out-of-scratch write {at:#x}')
        self.mem.update({at+i: x for i, x in enumerate(data)})

    def string(self, at):
        out = bytearray()
        for i in range(1024):
            v = self.read(at+i, 1)[0]
            if v == 0: return bytes(out)
            out.append(v)
        raise FormatError('unterminated native name constant')

    def call(self, address):
        n = self.calls.get(address)
        r = self.reg
        if n == 'strcmp':
            a, b = self.string(r[4]), self.string(r[5])
            self.compared.add(b.decode('cp932'))
            r[2] = (a > b) - (a < b)
        elif n == 'strcpy':
            self.write(r[4], self.string(r[5]) + b'\0'); r[2] = r[4]
        elif n in ('_NgrbGetFirstName', '_NgrbGetFamilyName'):
            r[2] = 0x403000 if n == '_NgrbGetFirstName' else 0x403100
        elif n == '_NgrbSetNameWindowPutFlag':
            self.visible = bool(r[4])
        else: raise FormatError(f'unrecognised name lookup call {n} at {address:#x}')

    def step(self, pc, delay=False):
        if not self.start <= pc < self.end:
            raise FormatError(f'name lookup escaped function at {pc:#x}')
        word = struct.unpack('<I', self.elf.at(pc, 4))[0]
        op, rs, rt, rd, sa, fn = word>>26, (word>>21)&31, (word>>16)&31, (word>>11)&31, (word>>6)&31, word&63
        im = word&65535; im = im if im<32768 else im-65536
        r = self.reg
        target = None
        if word == 0: pass
        elif op == 0x1c and fn == 0x28 and sa == 0x18: r[rd] = r[rs] | r[rt] # POR / move
        elif op == 0:
            if fn == 8: target = r[rs]
            elif fn == 0x21: r[rd] = _signed(r[rs]+r[rt])
            elif fn == 0x23: r[rd] = _signed(r[rs]-r[rt])
            elif fn == 0: r[rd] = _signed(r[rt]<<sa)
            elif fn == 2: r[rd] = (r[rt]&0xffffffff)>>sa
            elif fn == 0x3c: r[rd] = (r[rt]&0xffffffff) << (sa+32)
            elif fn == 0x3f:
                v=r[rt]&0xffffffffffffffff
                if v>=1<<63:v-=1<<64
                r[rd]=v>>(sa+32)
            else: raise FormatError(f'unrecognised native word {word:08x} at {pc:#x}')
        elif op == 9: r[rt] = _signed(r[rs]+im)
        elif op == 15: r[rt] = (word&65535)<<16
        elif op == 12: r[rt] = r[rs]&(word&65535)
        elif op in (4,5):
            yes = (r[rs] == r[rt]) if op==4 else (r[rs] != r[rt])
            target = pc+4+im*4 if yes else pc+8
        elif op == 3:
            if delay:raise FormatError('call in branch delay')
            self.step(pc+4, True)
            r[31] = pc+8
            self.call(((pc+4)&0xf0000000)|((word&0x3ffffff)<<2))
            return pc+8
        elif op in (0x23,0x37,0x1e):
            sz={0x23:4,0x37:8,0x1e:16}[op]
            r[rt]=int.from_bytes(self.read((r[rs]+im)&0xffffffff,sz),'little',signed=sz==4)
        elif op in (0x2b,0x3f,0x1f):
            sz={0x2b:4,0x3f:8,0x1f:16}[op]
            self.write((r[rs]+im)&0xffffffff,(r[rt]&((1<<(sz*8))-1)).to_bytes(sz,'little'))
        else: raise FormatError(f'unrecognised native word {word:08x} at {pc:#x}')
        r[0]=0
        if target is not None:
            if delay:raise FormatError('branch in branch delay')
            self.step(pc+4, True)
            return target
        return pc+4

    def evaluate(self, name):
        self.reg=[0]*32;self.mem={};self.visible=True
        self.reg[4:7]=[0x400000,0x401000,0x402000]
        self.reg[29]=0x41f000
        self.write(0x401000,name.encode('cp932')+b'\0')
        self.write(0x403000,b'{firstName}\0');self.write(0x403100,b'{familyName}\0')
        pc=self.start
        for _ in range(10000):
            pc=self.step(pc)
            if pc==0:
                return {'text':self.string(0x400000).decode('cp932'),
                        'characterId':int.from_bytes(self.read(0x402000,4),'little',signed=True),
                        'visible':self.visible}
        raise FormatError('native name lookup instruction limit')


def extract_native_data(elf):
    lookup=NameLookup(elf)
    default=lookup.evaluate('') # Visits every string-comparison branch.
    names={}
    pending=set(lookup.compared)
    while pending:
        name=min(pending);pending.remove(name)
        if name in names:continue
        names[name]=lookup.evaluate(name)
        pending.update(lookup.compared-set(names))
    def string(a):return elf.at(a,256).split(b'\0')[0].decode('cp932')
    def strings(a,n):return [string(v) for v in struct.unpack('<'+'I'*n,elf.at(a,n*4))]
    return {'format':'vnkit.pia-native-data','version':1,
            'evidence':{'nameFunction':hex(lookup.start),'nameFunctionSize':lookup.symbol['size']},
            'names':names,'unknownName':default,
            'uniformCG':strings(0x1ec1c0,24),'uniformCGReorder':strings(0x1ec220,14),
            'uniformSprites':strings(0x1ec260,25),
            'uniformSuffixes':{str(i+1):string(0x1f58e0+i*8) for i in range(3)}}
