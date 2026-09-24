"""Bounded Cartagra SC3 structural recovery, not a claim of VM support.

SC3 header/expression structure is documented by the MAGES Engine Compendium.
Instruction widths below are checked against SLPM-66231's handler tables. This
older edition differs from impacto's MO6 opcode layout, especially group 01.
Unknown instructions stop their basic block; no byte scanning resynchronisation.
"""
from collections import Counter, deque
import hashlib
import struct
from ..disc import FormatError


class Cursor:
    def __init__(self, data, at=0, end=None):
        self.data, self.at = data, at
        self.end = len(data) if end is None else end

    def take(self, n):
        if n < 0 or not 0 <= self.at <= self.at+n <= self.end:
            raise FormatError(f'Truncated SC3 operand at {self.at:#x}')
        b = self.data[self.at:self.at+n]; self.at += n
        return b

    def u8(self): return self.take(1)[0]
    def u16(self): return int.from_bytes(self.take(2), 'little')
    def u32(self): return int.from_bytes(self.take(4), 'little')

    def expression(self):
        tokens = []
        for _ in range(256):
            at = self.at; t = self.u8()
            if t == 0:
                if not tokens: raise FormatError(f'Empty SC3 expression at {at:#x}')
                return tokens
            if t & 128:
                size = (2, 3, 4, 6)[(t >> 5) & 3]
                rest = self.take(size-1)
                if size == 6: value = int.from_bytes(rest[:4], 'little', signed=True)
                else:
                    value = ((t & 31) << (8*(size-2))) + int.from_bytes(rest[:-1], 'little')
                    if t & 16: value -= 1 << (5+8*(size-2))
                tokens.append({'value': value})
            elif t in (*range(1,18), *range(20,31), 32, 33, *range(40,52)):
                tokens.append({'op': t, 'precedence': self.u8()})
            else: raise FormatError(f'Unknown SC3 expression token {t:#x} at {at:#x}')
        raise FormatError('SC3 expression exceeds token bound')


# E = expression, b = byte, h = LE16, w = LE32. Native handlers 0x121c00+.
SYSTEM = {
    0x00:'', 0x01:'EEh', 0x02:'E', 0x03:'', 0x04:'bEE', 0x05:'E',
    0x06:'', 0x07:'h', 0x08:'Eh', 0x09:'h', 0x0a:'bEh', 0x0b:'h',
    0x0c:'Eh', 0x0d:'Eh', 0x0e:'', 0x0f:'hE', 0x10:'bEh', 0x11:'bE',
    0x12:'E', 0x13:'E', 0x14:'EE', 0x15:'bEEh', 0x16:'bEE',
    0x17:'bEEE', 0x18:'EE', 0x19:'EE', 0x1a:'', 0x1b:'Eh', 0x1c:'',
    0x1e:'b', 0x1f:'E', 0x20:'Eh', 0x21:'EE', 0x22:'', 0x23:'bEE',
    0x24:'b', 0x25:'EEE', 0x26:'E', 0x27:'', 0x33:'EE', 0x37:'E',
    0x38:'b', 0x39:'b', 0x3a:'', 0x3d:'EE', 0x3e:'b', 0x3f:'', 0x40:''}
# Alternate immediate handlers are admitted separately; never assume all widths.
FIXED_SYSTEM = {0x01:'bbh', 0x05:'h', 0x07:'h', 0x0b:'h', 0x0c:'bh',
                0x0d:'bh', 0x0e:'', 0x0f:'hh', 0x18:'bw'}
GRAPH = {0x00:'h', 0x01:'EE', 0x02:'EEEh', 0x03:'bEEEE', 0x04:'E', 0x05:'EEEEE',
         0x06:'EEh', 0x08:'EEEE', 0x09:'', 0x0a:'EE', 0x0b:'E',
         0x0c:'E', 0x0d:'E', 0x0e:'EE', 0x0f:'E', 0x11:'b',
         0x12:'', 0x13:'EE', 0x16:'EEE', 0x1b:'EEEh', 0x1c:'E', 0x1d:'EEEEh', 0x1e:'b', 0x1f:'b',
         0x20:'E', 0x21:'E', 0x25:'Eh'}
GAME = {0x00:'E',0x01:'EE',0x02:'EE',0x03:'EE',0x04:'EEE',0x05:'EE',
        0x06:'EE',0x07:'EE',0x08:'E',0x09:'EE',0x0a:'',0x0c:'b',0x0d:'b',
        0x0f:'b',0x16:'EE',0x17:'',0x1b:'',0x1c:'E',0x1d:'b',0x1e:'',0x1f:'b',
        0x22:'b',0x23:'E',0x24:'',0x25:'',0x26:'',0x27:'b',0x28:'E',0x29:'E',0x2a:'EEE'}


def instruction(data, at, end):
    c = Cursor(data, at, end); g = c.u8(); args = []
    if g == 0xfe:
        args = [c.expression()]; op = 0xfe
    else:
        n = c.u8(); op = g*256+n
        specs = {0:SYSTEM, 128:FIXED_SYSTEM, 1:GRAPH, 16:GAME}
        if g == 1 and n == 0x10:
            voice = c.u8(); args.append(voice)
            if voice: args.append(c.u16())
            args += [c.u8(), c.u16()]
        elif g == 1 and n == 0x14:
            mode = c.u8(); args.append(mode)
            if mode == 0: args.append(c.expression())
            elif mode in (1,2):
                args.append(c.u16())
                if mode == 2: args.append(c.expression())
            else: raise FormatError(f'Unknown selection-list mode {mode}')
        elif g == 1 and n == 0x15:
            mode = c.u8(); args.append(mode)
            if mode == 2: args.append(c.expression())
            elif mode not in (0,1): raise FormatError(f'Unknown select mode {mode}')
        elif g == 1 and n == 0x24:
            mode = c.u8(); args.append(mode)
            for _ in range(3 if mode == 0 else 2): args.append(c.u16())
        elif g == 1 and n == 0x17:
            mode = c.u8(); args += [mode,c.expression()]
            if mode: args.append(c.u16())
        elif g == 1 and n == 0x18:
            mode=c.u8();args.append(mode)
            count={0:3,1:0,2:1,3:1}.get(mode)
            if count is None:raise FormatError(f'Unknown auxiliary-menu mode {mode}')
            for _ in range(count):args.append(c.expression())
        else:
            spec = specs.get(g,{}).get(n)
            if spec is None: raise FormatError(f'Unverified Cartagra instruction {op:04x} at {at:#x}')
            for t in spec: args.append({'E':c.expression,'b':c.u8,'h':c.u16,'w':c.u32}[t]())
    return {'offset':at, 'op':op, 'args':args, 'next':c.at}


def container(data, name):
    if data[:4] != b'SC3\0' or len(data)<16: raise FormatError('Not an SC3 script')
    strings_at, returns_at, code_at = struct.unpack_from('<III',data,4)
    if not 16 <= code_at <= strings_at <= returns_at <= len(data) or any(x%4 for x in (code_at,strings_at,returns_at)):
        raise FormatError('Invalid SC3 table bounds')
    labels = list(struct.unpack('<%dI'%((code_at-12)//4),data[12:code_at]))
    strings = list(struct.unpack('<%dI'%((returns_at-strings_at)//4),data[strings_at:returns_at]))
    if any(not code_at <= p < strings_at for p in labels):
        # Empty scripts point just beyond their empty label table.
        if not (len(labels)==1 and code_at==strings_at==returns_at): raise FormatError('Label outside SC3 code/data region')
    if any(not returns_at <= p < len(data) for p in strings): raise FormatError('String outside SC3 data')
    return {'format':'vnkit.cartagra-sc3','version':1,'source':name,
            'sha256':hashlib.sha256(data).hexdigest(),'code_start':code_at,
            'code_end':strings_at,'labels':labels,'string_offsets':strings,
            'return_table_offset':returns_at}


def string_tokens(data, start, glyph_count=2880):
    """Recover native glyph IDs and formatting; never guess missing Unicode.

    Native SLPM-66231 0x110310: 04 has one byte; 0c has two BE bytes.
    01/02 delimit the speaker, 09/0a/0b delimit base/ruby, 00 is line break.
    """
    c=Cursor(data,start); out=[]
    for _ in range(8192):
        at=c.at; value=c.u8()
        if value==255:return out,c.at
        if value&128:
            glyph=((value&127)<<8)|c.u8()
            if glyph>=glyph_count:raise FormatError(f'Glyph {glyph} outside native font at {at:#x}')
            out.append({'glyph':glyph,'offset':at})
        elif value<=12:
            token={'control':value,'offset':at}
            if value==4:token['value']=c.u8()
            if value==12:token['value']=int.from_bytes(c.take(2),'big')
            out.append(token)
        else:raise FormatError(f'Unknown text control {value:#x} at {at:#x}')
    raise FormatError('Unterminated or excessive SC3 string')


def parse(data, name, entries=None, excluded_labels=()):
    r = container(data,name); labels = r['labels']; end = r['code_end']
    excluded={labels[n] for n in excluded_labels}
    pending = deque([labels[n] for n in (entries if entries is not None else [0]) if labels[n] not in excluded]); visited = {}; errors = []; data_labels = set(excluded_labels)
    def target(n):
        if not 0 <= n < len(labels): raise FormatError(f'Bad label {n}')
        pending.append(labels[n])
    while pending:
        at = pending.popleft()
        while at not in visited and at < end:
            try:
                i = instruction(data,at,end); i['id'] = f'{name}:{at:08x}'
                visited[at] = i; op=i['op'] & 0x7fff; a=i['args']
                if op in (7,11): target(a[0])
                if op in (10,16,21,32): target(a[-1])
                if op == 15: target(a[0])
                if op == 8:
                    n = a[-1]; start = labels[n]
                    stop = min([v for v in labels if v>start]+[end])
                    if (stop-start)%2: raise FormatError('Odd jump-table extent')
                    data_labels.add(n)
                    for p in range(start,stop,2): target(int.from_bytes(data[p:p+2],'little'))
                if op in (0x125,0x102,0x106,0x11b,0x11d):data_labels.add(a[-1])
                if op in (0,7,8,12,14,27): break
                at = i['next']
            except (FormatError,IndexError) as e:
                errors.append({'offset':at,'id':f'{name}:{at:08x}','error':str(e)})
                break
    r.update(instructions=visited, errors=errors, data_labels=sorted(data_labels))
    return r


def parse_all(data,name):
    """Audit label entries, excluding explicitly referenced data tables.

    This is structural coverage, not a reachability or runtime support claim.
    Repeat to discover tables in code that wasn't reached from label zero.
    """
    r=parse(data,name);excluded=set(r['data_labels'])
    for _ in range(8):
        r=parse(data,name,range(len(r['labels'])),excluded)
        extra=set(r['data_labels'])-excluded
        if not extra:return r
        excluded.update(extra)
    raise FormatError('SC3 code/data label classification did not converge')
