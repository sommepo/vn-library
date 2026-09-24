"""SLPS-25256 Append menu, recovered from append_dat_t and its ELF consumer.

Titles and script addresses come from the user's executable, never public data.
appendStrExe tests persistent flag 21 for row zero and 70 for rows 1..33;
selection passes row offsets 0x24/0x28 to oscrSetScript after oscrInit.
"""
import struct
from ..disc import FormatError


def append_entries(elf, scripts):
    table = elf.symbols['append_dat_t']
    if table['size'] != 34 * 44:
        raise FormatError('Untested Never7 Append menu layout')
    result = []
    for row in range(34):
        address = table['address'] + row * 44
        words = struct.unpack('<11I', elf.at(address, 44))
        matches = [name for name, ref in scripts.items()
                   if ref['overlay'] == words[9] & 255 and ref['address'] == words[10]]
        if len(matches) != 1:
            raise FormatError(f'Unresolved Append entry at {address:#x}')
        # Menu strings are short, null-terminated CP932 in the ELF data segment.
        def string(pointer):
            raw = bytearray()
            for n in range(512):
                byte = elf.at(pointer+n, 1)
                if byte == b'\0':return raw.decode('cp932', 'strict')
                raw.extend(byte)
            raise FormatError('Unterminated Append menu string')
        result.append({'id':f'append-{row}', 'label':string(words[1]),
                       'author':string(words[2]), 'script':matches[0],
                       'requires':[21 if row == 0 else 70],
                       'group':'Append stories' if row else None,
                       'source':{'symbol':'append_dat_t', 'address':address, 'row':row}})
    return result
