"""Bounded PSP GIM decoding, with original code and no SDK dependency.

Format references are recorded in docs/428-psp-investigation.md. Returns all
pictures rather than silently treating a multi-picture container as one image.
"""
import struct
from .disc import FormatError


def _need(ok, message):
    if not ok:
        raise FormatError('GIM: ' + message)


def _colour(value, fmt):
    def expand(n, bits):
        return (n << (8 - bits)) | (n >> (2 * bits - 8)) if bits >= 4 else n * 255
    if fmt == 3:
        return tuple(value.to_bytes(4, 'little'))
    if fmt == 0:
        return expand(value & 31, 5), expand(value >> 5 & 63, 6), expand(value >> 11 & 31, 5), 255
    if fmt == 1:
        return *(expand(value >> shift & 31, 5) for shift in (0, 5, 10)), (value >> 15) * 255
    if fmt == 2:
        return tuple((value >> shift & 15) * 17 for shift in (0, 4, 8, 12))
    raise FormatError('GIM: unsupported palette format')


def _dxt(data, width, height, fmt):
    _need(width % 4 == 0 and height % 4 == 0, 'unaligned DXT dimensions')
    block_size = 8 if fmt == 8 else 16
    _need(len(data) == width * height // 16 * block_size, 'DXT payload size')
    out = bytearray(width * height * 4)
    for n in range(0, len(data), block_size):
        block = data[n:n + block_size]
        selectors, a, b = struct.unpack_from('<IHH', block)
        def rgb565(v):
            r, g, blue = v >> 11, v >> 5 & 63, v & 31
            return ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (blue << 3) | (blue >> 2), 255)
        colours = [rgb565(a), rgb565(b)]
        if a > b or fmt != 8:
            colours += [tuple((colours[0][c] * (3 - k) + colours[1][c] * k) // 3 for c in range(4)) for k in (1, 2)]
        else:
            colours += [tuple((colours[0][c] + colours[1][c]) // 2 for c in range(4)), (0, 0, 0, 0)]
        alpha, alpha_bits = None, 0
        if fmt == 10:
            x, y = block[14:16]
            alpha = [x, y]
            if x > y:
                alpha += [((7 - k) * x + k * y) // 7 for k in range(1, 7)]
            else:
                alpha += [((5 - k) * x + k * y) // 5 for k in range(1, 5)] + [0, 255]
            alpha_bits = int.from_bytes(block[12:14], 'little') | int.from_bytes(block[8:12], 'little') << 16
        tile = n // block_size
        x0, y0 = (tile % (width // 4)) * 4, (tile // (width // 4)) * 4
        for p in range(16):
            colour = colours[selectors >> (p * 2) & 3]
            if fmt == 9:
                colour = (*colour[:3], (int.from_bytes(block[8:16], 'little') >> (p * 4) & 15) * 17)
            elif alpha is not None:
                colour = (*colour[:3], alpha[alpha_bits >> (p * 3) & 7])
            at = ((y0 + p // 4) * width + x0 + p % 4) * 4
            out[at:at + 4] = bytes(colour)
    return bytes(out)


def decode(data):
    """Return [{width, height, rgba, format}], rejecting unsupported variants."""
    _need(32 <= len(data) <= 64 * 1024**2 and data[:16] == b'MIG.00.1PSP\0\0\0\0\0', 'signature or size')
    pictures, blocks = [], 0
    def chunk(at, limit, depth=0):
        nonlocal blocks
        blocks += 1
        _need(depth <= 3 and blocks <= 1024 and at + 16 <= limit, 'block bounds')
        kind, reserved, size, nxt, payload = struct.unpack_from('<HHIII', data, at)
        _need(reserved == 0 and 16 <= size <= limit - at and 16 <= payload <= size and 16 <= nxt <= size, 'block extent')
        if kind in (2, 3):
            children, pos = [], at + payload
            while pos < at + size:
                child, used = chunk(pos, at + size, depth + 1)
                children.append(child); pos += used
            _need(pos == at + size, 'child extent')
            if kind == 3:
                images = [c for c in children if c[0] == 4]
                palettes = [c for c in children if c[0] == 5]
                _need(len(images) == 1 and len(palettes) <= 1, 'ambiguous picture planes')
                pictures.append((images[0][1], palettes[0][1] if palettes else None))
            return (kind, children), size
        if kind not in (4, 5):
            _need(kind == 255, 'unknown block type')
            return (kind, None), size
        base = at + payload
        _need(base + 48 <= at + size, 'plane header')
        header, _, fmt, order, width, height, bpp, pitch_align, height_align = struct.unpack_from('<9H', data, base)
        index, first, end = struct.unpack_from('<III', data, base + 24)
        level_type, levels, frame_type, frames = struct.unpack_from('<4H', data, base + 40)
        _need(header >= 48 and header <= index and index + 4 <= first <= end <= at + size - base, 'plane offsets')
        _need(level_type in (1, 2) and levels == 1 and frame_type == 3 and frames == 1, 'multiple levels/frames')
        _need(struct.unpack_from('<I', data, base + index)[0] == first, 'frame index')
        _need(0 < width <= 4096 and 0 < height <= 4096 and width * height <= 8 * 1024**2, 'dimensions')
        _need(order in (0, 1) and fmt in range(11), 'pixel format/order')
        bits = (16, 16, 16, 32, 4, 8, 16, 32, 4, 8, 8)[fmt]
        _need(bpp == bits and pitch_align in (1, 2, 4, 8, 16) and height_align in (1, 2, 4, 8), 'pixel alignment')
        row_bytes = (width * bits + 7) // 8
        stride = row_bytes if fmt >= 8 else (row_bytes + pitch_align - 1) // pitch_align * pitch_align
        rows = (height + height_align - 1) // height_align * height_align
        raw = data[base + first:base + end]
        _need(len(raw) == stride * rows, 'pixel extent')
        return (kind, (fmt, order, width, height, stride, rows, raw)), size
    root, used = chunk(16, len(data))
    _need(root[0] == 2 and used + 16 == len(data) and pictures, 'root extent/pictures')
    _need(len(pictures) <= 256 and sum(p[0][2] * p[0][3] for p in pictures) <= 16 * 1024**2,
          'decoded picture budget')
    result = []
    def raster(plane, palette=None):
        fmt, order, width, height, stride, rows, raw = plane
        if fmt >= 8:
            _need(order == 0 and stride * 8 == width * (4 if fmt == 8 else 8), 'unsupported DXT padding/order')
            # DXT stores complete 4x4 blocks. GIM's logical height may exclude
            # the final block rows (e.g. a 270-line raster stored as 272).
            return _dxt(raw, width, rows, fmt)[:width * height * 4]
        if order == 1:
            _need(stride % 16 == 0 and rows % 8 == 0, 'swizzle alignment')
            linear = bytearray(len(raw))
            for y in range(rows):
                for x in range(0, stride, 16):
                    src = ((y // 8) * (stride // 16) + x // 16) * 128 + (y % 8) * 16
                    linear[y * stride + x:y * stride + x + 16] = raw[src:src + 16]
            raw = linear
        bits = (16, 16, 16, 32, 4, 8, 16, 32)[fmt]
        _need(fmt < 4 or palette is not None, 'missing palette')
        out = bytearray()
        for y in range(height):
            for x in range(width):
                offset = y * stride + x * bits // 8
                value = (raw[offset] >> (x % 2 * 4) & 15) if bits == 4 else int.from_bytes(raw[offset:offset + bits // 8], 'little')
                if fmt >= 4:
                    _need(value < len(palette), 'palette index')
                    out.extend(palette[value])
                else:
                    out.extend(_colour(value, fmt))
        return bytes(out)
    for plane, pal in pictures:
        palette = None
        if pal:
            _need(pal[0] <= 3 and pal[2] * pal[3] <= 256, 'palette dimensions/format')
            colours = raster(pal)
            palette = [colours[i:i + 4] for i in range(0, len(colours), 4)]
        result.append({'width': plane[2], 'height': plane[3], 'rgba': raster(plane, palette), 'format': plane[0]})
    return result
