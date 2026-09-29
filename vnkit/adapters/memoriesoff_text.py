"""Font-bound Unicode correspondence for the exact PS1 Memories Off font.

The 36 nonstandard CP932 slots were visually transcribed from source bitmaps.
No official mapping or independent human proofread is claimed. These are only
character correspondence facts; no source font pixels or dialogue are included.
"""
import hashlib
import unicodedata
from ..disc import FormatError
from .memoriesoff_ps1 import FONT_SHA256

CUSTOM = dict(zip(
    (0x839f,0x83a0,0x83a1,0x83a2,0x83a3,0x83a5,0x83a6,0x83a7,
     0x83a8,0x83a9,0x83ab,0x83ac,0x83ad,0x83ae,0x83af,0x83b0,
     0x83b1,0x83b2,0x83b3,0x83b4,0x83b5,0x83b6,0x83bf,0x83c0,
     0x83c1,0x83c3,0x83c4,0x83c5,0x83c6,0x83c7,0x83ca,0x83cb,
     0x83cc,0x83ce,0x83cf,0x83d0),
    '佇訝唸謳綺呟嘲絆愕憮璧咄嗟侘狡猾踵憑噪几嗅捏恍疼惧曰矣漱茫奢栞呻杞悸渾悄'))


def verify_font(font):
    if hashlib.sha256(font).hexdigest() != FONT_SHA256:
        raise FormatError('Memories Off Unicode mapping requires the exact reviewed font')


def decode(data):
    result, pos = [], 0
    while pos < len(data):
        byte = data[pos]
        length = 2 if 0x81 <= byte <= 0x9f or 0xe0 <= byte <= 0xfc else 1
        raw = data[pos:pos + length]
        if len(raw) != length:
            raise FormatError('truncated Memories Off text character')
        code = int.from_bytes(raw, 'big')
        if code == 0x8166:
            text = '\n'  # Native line separator, not a quotation mark.
        elif code in CUSTOM:
            text = CUSTOM[code]
        else:
            try:
                text = raw.decode('cp932', errors='strict')
            except UnicodeError as error:
                raise FormatError('unmapped Memories Off text character') from error
            if any(unicodedata.category(c).startswith('C') or 'GREEK' in unicodedata.name(c, '') for c in text):
                raise FormatError('unreviewed Memories Off text character')
        result.append(text)
        pos += length
    return ''.join(result)
