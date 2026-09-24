"""Bounded static decoder for SLPM-65550's bytecode, derived from its ELF.

Not a text scanner. Every instruction has an original byte offset. Data tables
are followed only from actual instruction operands. Unknown forms fail closed.
"""
import hashlib
import struct
from ..disc import FormatError
from ..elf import Elf32
from .remember11_ps2 import EXE_SHA256


def native_metadata(executable):
    if hashlib.sha256(executable).hexdigest() != EXE_SHA256:
        raise FormatError('Remember11: untested executable')
    elf = Elf32(executable)
    commands = []
    for op in range(0x87):
        handler, name, _ = struct.unpack('<III', elf.at(0x1e1c48 + op*12, 12))
        name = elf.at(name, 64).split(b'\0')[0].decode('ascii')
        size = struct.unpack('<I', elf.at(0x1e22a0+op*4, 4))[0] if op < 0x70 else None
        commands.append(dict(op=op, name=name, handler=handler, size=size))
    # Newer handlers do not use the old skip-length table.
    for op, size in {0x61:12,0x63:16,0x64:2,0x65:38,0x66:4,0x67:6,0x68:6,0x6d:2,
                     0x6f:4,0x70:2,0x71:2,0x73:10,0x75:8,0x7f:2,0x80:4,
                     0x81:16,0x82:4,0x83:2,0x84:6,0x85:2,0x86:2}.items():
        commands[op]['size'] = size
    movies=[]
    for index in range(16):
        row=struct.unpack('<8I',elf.at(0x1e0c70+index*32,32))
        movies.append({'index':index,'name':elf.at(row[0],64).split(b'\0')[0].decode('ascii'),'cg':row[3]})
    return {'commands':commands, 'movies':movies,'executable_sha256':EXE_SHA256,
            'evidence':{'dispatch':0x121ea8,'handlers':0x1e1c48,
                        'operand_read':0x11f530,'operand_write':0x11f5f8,
                        'conditions':0x122250,'choice':0x124498,'dialogue':0x123840}}


class Script:
    def __init__(self, data, name, commands, *, opcode_map=None):
        self.data, self.name, self.commands = data, name, commands
        # An explicit edition map translates command IDs only. It does not
        # establish operand or runtime compatibility. None preserves R11 output.
        if opcode_map is not None and any(type(k) is not int or type(v) is not int
                or not 0 <= k <= 255 or not 0 <= v < len(commands)
                for k, v in opcode_map.items()):
            raise FormatError('Invalid edition opcode map')
        self.opcode_map = None if opcode_map is None else dict(opcode_map)
        self.strings = {}

    def read(self, at, size):
        if at < 0 or size < 0 or at + size > len(self.data):
            raise FormatError(f'{self.name}:{at:04x}: source range outside scenario')
        return self.data[at:at+size]

    def u16(self, at): return struct.unpack('<H', self.read(at, 2))[0]

    def string(self, at):
        self.read(at, 1)
        end = self.data.find(b'\0', at)
        if end < 0: raise FormatError(f'{self.name}:{at:04x}: unterminated text')
        try: value = self.data[at:end].decode('cp932', 'strict')
        except UnicodeDecodeError as e: raise FormatError(f'{self.name}:{at:04x}: CP932: {e}') from e
        self.strings[str(at)] = value
        return value

    def conditional_target(self, at, mode, table, case):
        # 0x1223a4..0x122454: compiler's nesting table, not bytecode.
        if mode not in (0xfe,0xff): return table
        depth = self.read(table+1, 1)[0] if mode == 0xff else case
        start = table+4 if mode == 0xff else table
        for p in range(start, min(len(self.data)-3, start+65536), 4):
            kind, nesting, target = struct.unpack('<BBH', self.read(p,4))
            if nesting == depth and (mode == 0xff or kind == 3): return target
        raise FormatError(f'{self.name}:{at:04x}: unterminated conditional table')

    def instruction(self, at):
        op, sub = self.read(at, 2)
        source_op = op
        if self.opcode_map is not None:
            if op not in self.opcode_map:
                raise FormatError(f'{self.name}:{at:04x}: unmapped edition opcode {op:#x}')
            op = self.opcode_map[op]
        if op >= len(self.commands): raise FormatError(f'{self.name}:{at:04x}: unknown opcode {op:#x}')
        command = self.commands[op]; size = command['size']; targets = []
        i = {'id':f'{self.name}:{at:04x}', 'offset':at, 'op':op, 'name':command['name'], 'sub':sub}
        if self.opcode_map is not None:i['sourceOp'] = source_op
        if not command['handler']: raise FormatError(f'{i["id"]}: null command handler')
        if op == 2:
            p = at+4; conditions=[]
            for _ in range(256):
                a,b,compare,join = struct.unpack('<HHBB', self.read(p,6))
                if compare > 7 or join not in (0,6,7): raise FormatError(f'{i["id"]}: unknown condition form')
                conditions.append([a,b,compare,join]);p+=6
                if not join: break
            else: raise FormatError(f'{i["id"]}: condition chain too long')
            size=p-at;i['conditions']=conditions
            target=self.conditional_target(at, sub, self.u16(at+2), conditions[-1][0])
            i['target']=target;targets.append(target)
        elif op in (0x25,0x74):
            header=4 if op==0x25 else 6; size=header+sub*8; options=[]
            if not 0<sub<=32: raise FormatError(f'{i["id"]}: choice count outside bound')
            for p in range(at+header,at+size,8):
                text,target,condition,read_id=struct.unpack('<4H',self.read(p,8))
                options.append(dict(text=self.string(text),textOffset=text,target=target,condition=condition,readId=read_id))
                if target!=65535:targets.append(target)
            i.update(options=options,destination=self.u16(at+2))
        elif op in (0x33,0x69,0x72):
            stride=20 if op==0x69 else 12;size=2+sub*stride
            i['graphics']=[list(self.read(p,stride)) for p in range(at+2,at+size,stride)]
        elif op in (0x18,0x1f,0x73,0x20,0x6f):
            ptr=self.u16(at+2);i.update(text=self.string(ptr),textOffset=ptr)
            if op in (0x1f,0x73):
                i.update(readId=self.u16(at+4),voice=self.u16(at+6))
                # %S/%D consume additional operands after the fixed header.
                size += 2*(i['text'].count('%S')+i['text'].count('%D'))
        elif op in (3,4,0x50):
            i['target']=self.u16(at+2);targets.append(i['target'])
        elif op==9 and sub==15:
            table=self.u16(at+2); first=self.u16(table)
            if first<=table or (first-table)%2:raise FormatError(f'{i["id"]}: invalid entry table')
            # There is no table length in this instruction. Following all words
            # up to the first destination would misinterpret intervening data.
            # Index zero is the native fresh-entry path; others need evidence.
            targets=[first]
            i['jumpTable']=targets
        if not size: raise FormatError(f'{i["id"]}: unestablished instruction length')
        raw=self.read(at,size)
        i.update(size=size,next=at+size,words=list(struct.unpack('<'+'H'*(size//2),raw)),targets=targets)
        return i

    def discover(self):
        pending=[0];instructions={};errors=[];occupied={}
        while pending:
            at=pending.pop()
            if at in instructions:continue
            try:
                i=self.instruction(at)
                if at%2:raise FormatError(f'{i["id"]}: unaligned command')
                for p in range(at,at+i['size']):
                    if p in occupied and occupied[p]!=at:raise FormatError(f'{i["id"]}: overlapping instruction at {occupied[p]:04x}')
                    occupied[p]=at
                instructions[at]=i
                pending.extend(i['targets'])
                if i['op'] not in (1,3,5,6,8) and not (i['op']==9 and i['sub'] in (14,15)):
                    pending.append(i['next'])
            except FormatError as e:errors.append(str(e));instructions[at]={'id':f'{self.name}:{at:04x}','offset':at,'unsupported':str(e)}
        return {'format':'vnkit.remember11-script','version':1,'source':self.name,
                'sha256':hashlib.sha256(self.data).hexdigest(),'bytes':len(self.data),
                'instructions':{str(k):v for k,v in sorted(instructions.items())},
                'strings':self.strings,'errors':errors}
