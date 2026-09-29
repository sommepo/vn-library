"""Bounded source image/font codecs used by the inspected Chunsoft PS1 discs.

The two LZ variants are distinct. Otogirisou's MSB bitstream comes from its
0x800145ac routine; Kamaitachi's LZS ring is its 0x800366bc resource loader.
These helpers do not infer scene order, palettes or story semantics.
"""
import struct

from ..disc import FormatError


def unpack_otogirisou(data, limit=1024**2):
    bit = 0
    ring, initialized = bytearray(4096), bytearray(4096)
    position, output = 1, bytearray()

    def take(n):
        nonlocal bit
        if bit + n > len(data) * 8:
            raise FormatError('Truncated Otogirisou bitstream')
        value = 0
        for _ in range(n):
            value = (value << 1) | ((data[bit // 8] >> (7 - bit % 8)) & 1)
            bit += 1
        return value

    def emit(value):
        nonlocal position
        if len(output) >= limit:
            raise FormatError('Otogirisou decoded size exceeds limit')
        output.append(value)
        ring[position], initialized[position] = value, 1
        position = (position + 1) & 4095

    while True:
        if take(1):
            emit(take(8))
        else:
            start = take(12)
            if start == 0:
                return bytes(output), (bit + 7) // 8
            for n in range(take(5) + 3):
                at = (start + n) & 4095
                if not initialized[at]:
                    raise FormatError('Otogirisou reference reads uninitialized history')
                emit(ring[at])


def unpack_lzs(data, limit=1024**2):
    """Kamaitachi LZS, including its native sector-padded input extent.

    No decoded length is stored here. The nested resource owns its exact extent.
    A final incomplete reference is ignored by the native loader too.
    """
    if not data.startswith(b'LZS'):
        raise FormatError('LZS signature missing')
    ring = bytearray(b' ' * 4078 + bytes(18))
    position, at, output = 4078, 3, bytearray()
    while at < len(data):
        flags = data[at]
        at += 1
        for bit in range(8):
            if at >= len(data):
                return bytes(output)
            if flags & (1 << bit):
                values = [data[at]]
                at += 1
                start = None
            else:
                if at + 2 > len(data):
                    return bytes(output)
                low, high = data[at:at + 2]
                at += 2
                start = low | ((high & 240) << 4)
                values = range((high & 15) + 3)
            for value in values:
                if start is not None:
                    value = ring[start]
                    start = (start + 1) & 4095
                if len(output) >= limit:
                    raise FormatError('LZS decoded size exceeds limit')
                output.append(value)
                ring[position] = value
                position = (position + 1) & 4095
    return bytes(output)


def tim(data):
    """Decode an indexed PS1 TIM without guessing missing CLUT entries.

    Returns native dimensions, RGBA, raw STP bits and consumed length. STP is
    separate: source draw mode determines whether/how semitransparency applies.
    """
    if len(data) < 32 or data[:4] != b'\x10\0\0\0':
        raise FormatError('TIM header missing')
    mode, = struct.unpack_from('<I', data, 4)
    if mode not in (8, 9):
        raise FormatError('Unverified TIM pixel mode')
    size, cx, cy, cw, ch = struct.unpack_from('<I4H', data, 8)
    if not 1 <= cw <= (16 if mode == 8 else 256) or ch != 1 or size != 12 + cw * 2:
        raise FormatError('TIM palette shape is not supported')
    at = 8 + size
    if at + 12 > len(data):
        raise FormatError('Truncated TIM palette')
    palette = struct.unpack_from('<' + 'H' * cw, data, 20)
    size, x, y, words, height = struct.unpack_from('<I4H', data, at)
    width = words * (4 if mode == 8 else 2)
    if not 0 < width <= 1024 or not 0 < height <= 512 or size != 12 + words * height * 2 or at + size > len(data):
        raise FormatError('Invalid TIM image extent')
    packed = data[at + 12:at + size]
    indices = packed if mode == 9 else bytes(v for b in packed for v in (b & 15, b >> 4))
    rgba, stp = bytearray(), bytearray()
    for index in indices:
        if index >= len(palette):
            raise FormatError('TIM pixel references an absent palette entry')
        value = palette[index]
        rgba.extend(((value & 31) * 255 // 31, ((value >> 5) & 31) * 255 // 31,
                     ((value >> 10) & 31) * 255 // 31, 0 if value == 0 else 255))
        stp.append(value >> 15)
    return {'width': width, 'height': height, 'x': x, 'y': y, 'clut_x': cx, 'clut_y': cy,
            'rgba': bytes(rgba), 'indices':bytes(indices), 'palette':palette,
            'stp': bytes(stp), 'consumed': at + size}


def font_glyphs(data):
    """Kamaitachi BIN font: BE16 offsets in four-byte units, nibble RLE."""
    if len(data) < 4:
        raise FormatError('Truncated PS1 font')
    count = int.from_bytes(data[:2], 'big') * 2
    if not 0 < count <= 4096 or count * 2 > len(data):
        raise FormatError('Invalid PS1 font table')
    offsets = [int.from_bytes(data[i * 2:i * 2 + 2], 'big') * 4 for i in range(count)]
    if offsets[0] != count * 2 or any(a > b for a, b in zip(offsets, offsets[1:])) or offsets[-1] > len(data):
        raise FormatError('Invalid PS1 font offsets')
    glyphs = []
    for index, start in enumerate(offsets):
        end = offsets[index + 1] if index + 1 < count else len(data)
        if start == end:
            glyphs.append(None)
            continue
        if end - start < 2:
            raise FormatError('Truncated PS1 glyph')
        width, height = data[start] & 63, data[start + 1] & 63
        if not width or not height:
            raise FormatError('Empty PS1 glyph geometry')
        nibbles = [v for b in data[start + 2:end] for v in (b >> 4, b & 15)]
        pixels, at = bytearray(), 0
        while len(pixels) < width * height:
            if at >= len(nibbles):
                raise FormatError('Truncated PS1 glyph pixels')
            value = nibbles[at]
            at += 1
            repeat = 1
            if value == 15:
                if at + 2 > len(nibbles):
                    raise FormatError('Truncated PS1 glyph run')
                value, repeat = nibbles[at], nibbles[at + 1] + 4
                at += 2
            if len(pixels) + repeat > width * height:
                raise FormatError('PS1 glyph run exceeds its rectangle')
            pixels.extend([value] * repeat)
        glyphs.append({'width': width, 'height': height, 'pixels': bytes(pixels)})
    return glyphs
