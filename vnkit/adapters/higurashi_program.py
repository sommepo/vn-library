"""Compile the owner's SNR without changing source control flow."""
import hashlib
import struct
from ..elf import Elf32
from .higurashi_script import parse_all, compact_table, decode_text
from .higurashi_text import parse_message
from ..disc import FormatError


def compile_program(data, executable):
    audit = parse_all(data)
    if audit['errors'] or audit['unresolved_targets']:
        raise FormatError('SNR parsing failed; inspect the structural audit')
    table = compact_table(executable)
    rows = []
    for i in audit['instructions']:
        texts = [decode_text(bytes.fromhex(s['bytes']), table) for s in i['strings']]
        messages = parse_message(texts[0], i['id']) if i['opcode'] == 0x86 else None
        rows.append([i['offset'], i['next'], i['opcode'], i['args'], texts, messages])
    return {'format': 'vnkit.higurashi-program', 'version': 1,
            'sha256': hashlib.sha256(data).hexdigest(), 'entry': audit['entry'],
            'instructions': rows, 'opcodes': audit['opcodes'],
            'selectorCounts': list(struct.unpack('<2I', Elf32(executable).at(0x25afa8, 8)))}
