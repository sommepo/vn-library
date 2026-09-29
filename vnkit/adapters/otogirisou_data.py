"""Exact SLPS-01645 CDIMG resource tables and bounded source-bank parsing.

The loose SNB/GSF files on this disc belong to the bundled Machi demo.
This module follows the boot executable's tables instead of filename guesses.
"""
import hashlib
import struct

from ..disc import FormatError
from .otogirisou_ps1 import EXE_SHA256
from .chunsoft_ps1_media import unpack_otogirisou

CDIMG_SHA256 = 'c419140ef3ba0ecc18ce8ec421cac3b4cb43462d55ae67bdd6bf8519a2cf6bb5'
CDIMG_LBA = 0x43ad9
SIZES = {op: 0 for op in (1,2,3,4,15,16,17,18,19,20,21,22,28,39,40,46,47,51,52,53,54,55,56,255)}
SIZES.update({op: 1 for op in (5,7,11,23,25,31,32,35,38,41,42,43,44,50,57)})
SIZES.update({op: 2 for op in (6,8,12,24,26,29,30,33,36)})
SIZES.update({op: 3 for op in (27,34,37,48)})
SIZES.update({9: 2, 10: 2, 13: 7, 14: 4, 45: 6})


def checked_sources(exe, cdimg):
    if hashlib.sha256(exe).hexdigest() != EXE_SHA256 or hashlib.sha256(cdimg).hexdigest() != CDIMG_SHA256:
        raise FormatError('Otogirisou source identity mismatch')


def u32(exe, address):
    at = address - 0x80010000 + 2048
    if at < 2048 or at + 4 > len(exe):
        raise FormatError('Otogirisou native table outside executable')
    return struct.unpack_from('<I', exe, at)[0]


def resources(exe, cdimg):
    checked_sources(exe, cdimg)
    result = []
    for kind, base, counts, total in [('scene', 0x8006176c, 0x80061d30, 217),
                                      ('sound-bank', 0x80061ad0, 0x80061e0c, 152)]:
        for index in range(total):
            lba = u32(exe, base + index * 4)
            sectors = exe[counts + index - 0x80010000 + 2048]
            at, size = (lba - CDIMG_LBA) * 2048, sectors * 2048
            if not sectors or at < 0 or at + size > len(cdimg):
                raise FormatError(f'Otogirisou {kind}:{index}: extent outside CDIMG')
            result.append({'kind': kind, 'id': index, 'lba': lba, 'sectors': sectors,
                           'offset': at, 'bytes': cdimg[at:at + size]})
    return result


def parse(data, bank):
    if not isinstance(bank, int) or not 0 <= bank < 46 or not 2 <= len(data) <= 65536:
        raise FormatError('Invalid Otogirisou source bank identity/extent')
    commands, at = [], 0
    while at < len(data):
        start = at
        row = {'id': f'otogi:{bank}:{start:05x}', 'offset': start}
        if data[at] == 0:
            if not any(data[at:]):
                break
            if at + 2 > len(data) or data[at + 1] not in SIZES:
                raise FormatError(f'{row["id"]}: unknown/truncated command')
            op = data[at + 1]
            at += 2 + SIZES[op]
            if op in (9, 10):
                count = 0
                while True:
                    if at + 4 > len(data):
                        raise FormatError(f'{row["id"]}: truncated choice table')
                    if data[at:at + 4] == bytes(4):
                        at += 4
                        break
                    if count >= 10 or data[at] >= 46:
                        raise FormatError(f'{row["id"]}: invalid choice target/count')
                    at += 4
                    count += 1
                if not count:
                    raise FormatError(f'{row["id"]}: empty choice table')
            if at > len(data):
                raise FormatError(f'{row["id"]}: truncated operands')
            row.update(op=op, args=list(data[start + 2:at]))
        else:
            glyph = data[at]
            at += 1
            if glyph >= 240:
                if at >= len(data):
                    raise FormatError(f'{row["id"]}: truncated extended glyph')
                glyph = 240 + (glyph & 15) * 256 + data[at]
                at += 1
            if glyph >= 1745:
                raise FormatError(f'{row["id"]}: glyph outside native descriptor table')
            row.update(glyph=glyph, bytes=list(data[start:at]))
        row['next'] = at
        commands.append(row)
    return {'format': 'vnkit.otogirisou-script', 'version': 1, 'id': bank,
            'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'commands': commands}


def story_banks(exe, cdimg):
    checked_sources(exe, cdimg)
    story = cdimg[88 * 2048:390 * 2048]
    offsets = [u32(exe, 0x8006203c + i * 4) for i in range(46)]
    if offsets[0] != 0 or offsets[-2] >= len(story) or offsets[-1] <= len(story) or any(a >= b for a, b in zip(offsets, offsets[1:])):
        raise FormatError('Otogirisou native story bank table extent')
    # Slot 45 is populated on demand from auxiliary scene resources 205–209.
    # It is not part of this initial 302-sector load or a fabricated empty bank.
    return [parse(story[offsets[i]:min(offsets[i + 1], len(story))], i) for i in range(45)]


def font_pages(exe, cdimg):
    checked_sources(exe, cdimg)
    offsets = list(struct.unpack_from('<9I', cdimg))
    if offsets[0] != 0 or 128 + offsets[-1] > 88 * 2048 or any(a >= b for a, b in zip(offsets, offsets[1:])):
        raise FormatError('Otogirisou font texture table extent')
    pages = []
    for i in range(8):
        raw, consumed = unpack_otogirisou(cdimg[128 + offsets[i]:128 + offsets[i + 1]])
        if len(raw) != 32768:
            raise FormatError('Otogirisou font texture size')
        # Match the exact native VRAM upload, including the last partial page.
        raw = raw[:248 * 128] + bytes(8 * 128) if i < 7 else bytes(128 * 128) + raw[:112 * 128] + bytes(16 * 128)
        pages.append(raw)
    return pages
