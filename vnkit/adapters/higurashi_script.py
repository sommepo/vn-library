"""Source-located SNR structural audit for SLPM-66913 v1.01.

Operand readers are verified against its ELF dispatch at 0x20ca38 and handlers
0x15fe48..0x1633d0. This is a parser, not yet a story interpreter. The later
Shin engine research is a comparison reference, not an interchangeable schema.
"""
import struct
import hashlib
from collections import Counter
from ..disc import FormatError
from .higurashi_ps2 import EXE_SHA256

FIXED_NUMBERS = {
    0x80:1, 0x81:2, 0x82:2, 0x83:1, 0x84:1, 0x85:2, 0x87:1,
    0x88:0, 0x89:0, 0x8e:0, 0x8f:0, 0x93:1, 0x94:7, 0x95:5,
    0x96:9, 0x97:5, 0x98:4, 0x99:4, 0x9a:4, 0x9b:2, 0x9c:4,
    0x9d:1, 0x9e:2, 0x9f:1, 0xa0:5, 0xa1:2, 0xa2:1, 0xa3:3,
    0xa4:2, 0xa5:3, 0xa6:9, 0xa7:5, 0xa8:7, 0xa9:6, 0xaa:9,
    0xab:9, 0xac:1, 0xad:1, 0xae:3, 0xaf:0, 0xb1:1, 0xb2:1,
    0xb3:1, 0xb4:0, 0xb5:1, 0xb6:0, 0xb7:5, 0xb8:2, 0xba:1,
    0xbc:1, 0xbf:1, 0xc0:0,
}
NAMES = {0x40:'unary', 0x41:'binary', 0x42:'expression', 0x43:'assign_many',
         0x44:'table_get', 0x45:'table_set', 0x46:'condition', 0x47:'jump',
         0x48:'call', 0x49:'return', 0x4a:'jump_table', 0x4b:'call_table',
         0x4c:'random', 0x4d:'push', 0x4e:'pop', 0x80:'EXIT', 0x81:'SGET',
         0x82:'SSET', 0x83:'WAIT', 0x84:'KEYWAIT', 0x85:'MSGINIT',
         0x86:'MSGSET', 0x87:'MSGWAIT', 0x88:'MSGSIGNAL', 0x89:'MSGCLOSE',
         0x8a:'MSGCHECK', 0x8b:'LOGSET', 0x8c:'SELECT', 0x8d:'WIPE',
         0x8e:'WIPEWAIT', 0x8f:'GRPINIT', 0x90:'PICLOAD', 0x91:'BUPLOAD',
         0x92:'ANMLOAD', 0x93:'GRPCLEAR', 0x9c:'BGMPLAY', 0x9d:'BGMSTOP',
         0xa0:'SEPLAY', 0xb0:'SAVEINFO', 0xb1:'MOVIE', 0xb9:'VOICEPLAY'}


class Cursor:
    def __init__(self, data, pos=0, end=None):
        self.data, self.pos, self.end = data, pos, len(data) if end is None else end
        if not 0 <= self.pos <= self.end <= len(data):
            raise FormatError('Invalid SNR cursor bounds')

    def take(self, size):
        if size < 0 or self.pos < 0 or self.pos + size > self.end:
            raise FormatError(f'SNR operand outside code at {self.pos:#x}')
        result = self.data[self.pos:self.pos+size]
        self.pos += size
        return result

    def u8(self): return self.take(1)[0]
    def u16(self): return struct.unpack('<H', self.take(2))[0]
    def u32(self): return struct.unpack('<I', self.take(4))[0]

    def words(self, count):
        if count > 32767:
            raise FormatError('SNR operand array exceeds native signed range')
        return [self.u16() for _ in range(count)]

    def string(self, width):
        size = self.u8() if width == 1 else self.u16()
        raw = self.take(size)
        if not raw or raw[-1] != 0:
            raise FormatError(f'SNR string is not terminated at {self.pos-size:#x}')
        return {'offset': self.pos-size, 'bytes': raw.hex()}


def instruction(data, offset, end):
    c = Cursor(data, offset, end)
    op = c.u8()
    strings, targets = [], []
    if op in FIXED_NUMBERS:
        args = c.words(FIXED_NUMBERS[op])
    elif op in (0x40, 0x41):
        mode = c.u8()
        if mode & 0x7f > (3 if op == 0x40 else 11):
            raise FormatError('Unknown SNR arithmetic operation')
        args = [mode, *c.words((1 if op == 0x40 else 2) + bool(mode & 0x80))]
    elif op == 0x42:
        args = [c.u16()]
        for _ in range(1024):
            token = c.u8()
            args.append(token)
            if token == 255: break
            if token > 23: raise FormatError(f'Unknown SNR expression token {token:#x}')
            if token == 0: args.append(c.u16())
        else: raise FormatError('SNR expression exceeds limit')
    elif op in (0x43, 0x44, 0x45):
        args = c.words(1 if op == 0x43 else 2)
        count = c.u8()
        if count > 127: raise FormatError('Negative SNR array length')
        args.extend([count, *c.words(count)])
    elif op == 0x46:
        args = [c.u8(), *c.words(2), c.u32()]
        if args[0] & 127 > 6:
            raise FormatError('Unknown SNR comparison mode')
        targets = [args[-1]]
    elif op in (0x47, 0x48):
        args = [c.u32()]; targets = args[:]
    elif op == 0x49: args = []
    elif op in (0x4a, 0x4b):
        args = [c.u16(), c.u16()]
        if args[1] > 32767: raise FormatError('Negative SNR jump-table length')
        targets = [c.u32() for _ in range(args[1])]
        args.extend(targets)
    elif op == 0x4c: args = c.words(3)
    elif op in (0x4d, 0x4e, 0xbb, 0xbd):
        count = c.u8()
        if count > 127: raise FormatError('Negative SNR list length')
        args = [count, *c.words(count)]
    elif op == 0x86:
        args = [c.u32()]; strings = [c.string(2)]
    elif op == 0x8a: args = [c.u32()]
    elif op == 0x8b: args = []; strings = [c.string(2)]
    elif op == 0x8c:
        args = c.words(4); strings = [c.string(1), c.string(1)]
    elif op == 0x8d:
        mask = c.u8()
        if mask & ~0x8f: raise FormatError('Unknown SNR wipe flag')
        args = [mask, *c.words((mask & 15).bit_count())]
    elif op in (0x90, 0x91, 0x92):
        mask = c.u8()
        if mask & ~31: raise FormatError('Unknown SNR graphic-load flag')
        count = 3 + sum(n for bit,n in ((1,2),(2,4),(4,2),(8,1),(16,1)) if mask & bit)
        args = [mask, *c.words(count)]
    elif op == 0xb0: args = c.words(1); strings = [c.string(1)]
    elif op in (0xb9, 0xf0): args = []; strings = [c.string(1)]
    elif op == 0xbe: args = [c.u16(), c.u8(), *c.words(2)]
    elif op == 0xf1: strings = [c.string(1)]; args = c.words(1)
    else: raise FormatError(f'Unknown SNR opcode {op:#x} at main.snr:{offset:08x}')
    return {'id': f'main.snr:{offset:08x}', 'offset': offset, 'next': c.pos,
            'opcode': op, 'name': NAMES.get(op, f'NATIVE_{op:02X}'),
            'args': args, 'strings': strings, 'targets': targets}


def compact_table(executable):
    if hashlib.sha256(executable).hexdigest() != EXE_SHA256:
        raise FormatError('Untested Higurashi text-table executable')
    # Native 64-entry CP932 word table. No game glyph image transcription.
    return [w.to_bytes(2, 'big').decode('cp932', 'strict')
            for w in struct.unpack_from('<64H', executable, 0x145618)]


def decode_text(raw, table, compact=True):
    """Decode bytes only; retain inline script markup for a separate text parser."""
    out, at = [], 0
    while at < len(raw):
        byte = raw[at]
        if compact and 0xa0 <= byte <= 0xdf:
            out.append(table[byte - 0xa0]); at += 1
        else:
            width = 2 if 0x81 <= byte <= 0x9f or 0xe0 <= byte <= 0xfc else 1
            if at + width > len(raw): raise FormatError('Truncated CP932 text')
            out.append(raw[at:at+width].decode('cp932', 'strict')); at += width
    return ''.join(out)


def parse_all(data):
    if len(data) < 48 or data[:4] != b'SNR ' or struct.unpack_from('<I', data, 4)[0] != len(data):
        raise FormatError('Invalid Higurashi SNR header/length')
    end, entry = struct.unpack_from('<II', data, 32)
    if not 48 <= entry < end <= len(data): raise FormatError('Invalid Higurashi SNR code bounds')
    instructions, errors, at = [], [], 48
    while at < end:
        try: row = instruction(data, at, end)
        except (FormatError, UnicodeError) as error:
            errors.append({'offset': at, 'error': str(error)}); break
        instructions.append(row); at = row['next']
    boundaries = {row['offset'] for row in instructions}
    unresolved = [{'source': row['id'], 'target': target} for row in instructions
                  for target in row['targets'] if target not in boundaries]
    if entry not in boundaries:
        unresolved.append({'source': 'main.snr:header', 'target': entry})
    return {'format':'vnkit.higurashi-snr-audit', 'version':1, 'entry':entry,
            'code_end':end, 'parsed_end':at, 'instructions':instructions,
            'errors':errors, 'unresolved_targets':unresolved,
            'opcodes':dict(Counter(f"{r['opcode']:02x}" for r in instructions)),
            'playable':False}
