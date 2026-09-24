"""Audit the separate mend ending-presentation VM; it is not oscr story code.

Widths are the PC increments in SLPS-25256's mendScrCommand/handlers. There
are no story-variable, choice or scenario-transfer operations in this set.
Animation execution is deliberately not implemented by this structural parser.
"""
import struct
from ..disc import FormatError

WIDTHS = {0x0d:2, 0x19:3, 0x22:1, 0x2e:1, 0x36:2, 0x42:2,
          0x58:2, 0x67:2, 0x6d:4, 0x6e:3, 0x9a:5, 0x9b:5,
          0x9c:1, 0x9d:2, 0x9e:1, 0xa0:5, 0xa1:1, 0xa2:1,
          0xa3:5, 0xa5:2, 0xa6:5, 0xa7:5, 0xa8:5}


def programs(elf, tables):
    """Recover literal program selections from the audited mendInit switch.

    Only recognize beq v0,v1 cases with literal selectors and the exact
    lui/addiu/sw sequence assigning the mend program pointer. Refuse drift.
    """
    sym = elf.symbols['mendInit']
    words = struct.unpack('<%dI' % (sym['size']//4), elf.at(sym['address'], sym['size']))
    refs = {t['address']:t['symbol'] for t in tables if t['section'] == 24}
    result = {}
    for pc, word in enumerate(words):
        if word >> 16 != 0x1043 or pc == 0 or words[pc-1] >> 16 != 0x2403:
            continue
        selector = words[pc-1] & 65535
        target = pc + 1 + ((word & 65535) ^ 32768) - 32768
        found = []
        for cursor in range(target+2, min(target+16, len(words))):
            if words[cursor] != 0xaf828d9c:continue  # sw v0,-0x7264(gp)
            hi, lo = words[cursor-2:cursor]
            if hi >> 16 != 0x3c02 or lo >> 16 != 0x2442:
                raise FormatError('Unrecognised mend program pointer')
            address = ((hi & 65535) << 16) + ((lo & 65535) ^ 32768) - 32768
            if address not in refs:raise FormatError('Unresolved mend program')
            found.append(refs[address])
            break
        if len(found) != 1:raise FormatError('Unrecognised mend program selection')
        result[str(selector)] = found[0]
    if len(result) != 39:raise FormatError('Untested mend program switch')
    return result
