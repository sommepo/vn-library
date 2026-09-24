"""Exact-edition MAC metadata recovered from Ever17's own executable.

The normalized IDs share the measured Remember11 command family. No second
game disc is needed to import Ever17. None is an unestablished width, not a no-op.
"""
import hashlib
import struct
from ..disc import FormatError
from ..elf import Elf32
from .ever17_ps2 import EXE_SHA256

# Native handler widths, indexed by ORIGINAL Ever17 opcode. Variable forms
# (conditions, graphic lists and choices) are decoded by Ever17Script.
SIZES = (
    2,2,10,4,4,2,2,2,2,6,2,4,4,4,4,4,
    2,2,2,2,6,6,2,6,4,2,2,2,2,2,2,8,
    4,6,2,4,2,0,4,2,4,2,4,4,6,8,4,4,
    4,4,4,0,4,2,2,2,2,2,2,2,2,2,2,2,
    2,2,2,2,2,2,2,2,2,2,2,4,4,4,4,4,
    2,3,2,4,2,4,2,2,4,10,0,6,4,4,4,2,
    None,2,12,2,16,2,38,4,6,6,8,2,8,4,2,2,
    4,2,2,None,10,None,8,None,None,None,8,None,None,4,4,4,
    2,4,
)


def native_metadata(executable):
    if hashlib.sha256(executable).hexdigest() != EXE_SHA256:
        raise FormatError('Ever17: untested executable')
    elf = Elf32(executable)
    commands = [{'handler':0, 'name':'unsupported', 'size':None} for _ in range(0x87)]
    mapping = {}
    original = []
    for op, size in enumerate(SIZES):
        handler, name, reserved = struct.unpack('<III', elf.at(0x1e1338+12*op,12))
        if reserved:
            raise FormatError('Ever17: changed command directory')
        label = elf.at(name,64).split(b'\0')[0].decode('ascii','strict')
        row = {'sourceOp':op, 'handler':handler, 'name':label, 'size':size}
        original.append(row)
        if not handler or op == 0x4c:
            continue
        canonical = op if op < 0x4c else op-1
        mapping[op] = canonical
        commands[canonical] = {**row, 'op':canonical}
    movies = []
    for index in range(6):
        row = struct.unpack('<7I',elf.at(0x1dd6f0+index*28,28))
        name = elf.at(row[0],64).split(b'\0')[0].decode('ascii','strict')
        movies.append({'index':index, 'name':name, 'cg':row[3]})
    return {'commands':commands, 'opcode_map':mapping, 'original_commands':original,
            'movies':movies, 'executable_sha256':EXE_SHA256,
            'evidence':{'commands':0x1e1338, 'movie_table':0x1dd6f0,
                        'operand_read':0x119b90, 'operand_write':0x119c58,
                        'conditions':0x11b9a0, 'dialogue':0x11d4b0, 'choice':0x11dba8}}
