"""Bounded GSF/HAS glyph recovery for the investigated 428 PSP edition.

The native consumer hashes (font, size, Unicode), then expands high-first
nibbles: 0xf introduces a value and a repeat count plus four. Source metrics
and bitmap sizes are distinct; neither is a guessed Unicode/font mapping.
"""
import struct
from ..disc import FormatError


def _need(ok, message):
    if not ok:
        raise FormatError('428 GSF: ' + message)


def hash_key(size, codepoint):
    return (((codepoint & 0xff00) >> 4) + (codepoint & 255) +
            ((size >> 4) << 8) + (size & 15)) & 2047


def outlined_rgba(glyph):
    """Native palette: coverage in RGB, doubled 3x3 coverage sum in alpha."""
    width, height, coverage = glyph['width'], glyph['height'], glyph['coverage']
    _need(0 < width <= 1024 and 0 < height <= 1024 and len(coverage) == width * height,
          'outline dimensions')
    _need(all(0 <= value <= 15 for value in coverage), 'outline coverage')
    rgba = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            total = sum(coverage[yy * width + xx]
                        for yy in range(max(0, y - 1), min(height, y + 2))
                        for xx in range(max(0, x - 1), min(width, x + 2)))
            at = (y * width + x) * 4
            value = coverage[y * width + x] * 17
            rgba[at:at + 4] = bytes([value, value, value, min(15, total * 2) * 17])
    return bytes(rgba)


def decode(gsf, has):
    _need(40 <= len(gsf) <= 32 * 1024**2, 'data size')
    _need(4096 <= len(has) <= 1024**2 and (len(has) - 4096) % 6 == 0, 'hash table size')
    entries, offsets, seen, occupied = [], {}, set(), set()
    for bucket in range(2048):
        at = struct.unpack_from('>H', has, bucket * 2)[0] * 2
        if not at:
            continue
        for _ in range(1024):
            _need(at >= 4096 and (at - 4096) % 6 == 0 and at + 6 <= len(has), 'hash chain bounds')
            _need(at not in occupied, 'overlapping hash chain')
            occupied.add(at)
            attrs, codepoint, index = struct.unpack_from('>HHH', has, at)
            style, size = (attrs >> 11) & 15, attrs & 2047
            key = style, size, codepoint
            _need(size > 0 and not 0xd800 <= codepoint <= 0xdfff and key not in seen, 'duplicate/invalid glyph key')
            _need(hash_key(size, codepoint) == bucket, 'hash key mismatch')
            seen.add(key)
            _need(index * 4 + 4 <= len(gsf), 'glyph index bounds')
            offset = int.from_bytes(gsf[index * 4:index * 4 + 3], 'little') * 32
            _need(gsf[index * 4 + 3] == 0 and offset + 40 <= len(gsf), 'glyph pointer')
            _need(index not in offsets or offsets[index] == offset, 'inconsistent glyph index')
            offsets[index] = offset
            entries.append({'style': style, 'size': size, 'codepoint': codepoint, 'index': index})
            at += 6
            if attrs & 0x8000:
                break
        else:
            raise FormatError('428 GSF: hash chain budget')
    _need(len(occupied) == (len(has) - 4096) // 6 and entries, 'unindexed hash records')
    _need(min(offsets.values()) >= (max(offsets) + 1) * 4, 'glyph overlaps pointer table')
    ordered = sorted(set(offsets.values()))
    ends = dict(zip(ordered, ordered[1:] + [len(gsf)]))
    glyphs, pixel_budget = {}, 0
    for index, offset in sorted(offsets.items()):
        end = ends[offset]
        _need(offset + 40 <= end, 'overlapping glyph records')
        metrics = list(struct.unpack_from('<18h', gsf, offset))
        width, height = struct.unpack_from('>HH', gsf, offset + 36)
        _need(0 < width <= 1024 and 0 < height <= 1024, 'bitmap dimensions')
        count = width * height
        pixel_budget += count
        _need(pixel_budget <= 32 * 1024**2, 'pixel budget')
        nibbles = 0
        def read():
            nonlocal nibbles
            at = offset + 40 + nibbles // 2
            _need(at < end, 'truncated nibble stream')
            value = gsf[at] >> (0 if nibbles & 1 else 4) & 15
            nibbles += 1
            return value
        pixels = bytearray()
        while len(pixels) < count:
            value, repeat = read(), 1
            if value == 15:
                value, repeat = read(), read() + 4
            _need(len(pixels) + repeat <= count, 'pixel run exceeds bitmap')
            pixels.extend([value] * repeat)
        glyphs[index] = {'offset': offset, 'metrics': metrics, 'width': width,
                         'height': height, 'coverage': bytes(pixels), 'nibbles': nibbles}
    return {'entries': entries, 'glyphs': glyphs}
