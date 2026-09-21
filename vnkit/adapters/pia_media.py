"""Bounded Alpha Unit/Pia Carrot 3 PS2 MLH and NBP decoding.

Format handling and LZSS adapted from punk7890/PS2-Visual-Novel-Tool,
commit e27f4f940af07f46ae1dbed7cdefd9e4be5cf667, alphaUnit.gd/comFuncs.gd.
Copyright (c) 2024 punk7890. MIT; see third_party/LICENSE-ps2-vn-tool.txt.
This module does not establish script-to-image associations or story order.
"""

import struct
import zlib

MAX_DECODED = 64 * 1024 * 1024
MAX_PIXELS = 4096 * 4096


class MediaError(ValueError):
    """Malformed or explicitly unsupported source media."""


def _range(data, offset, size, context):
    if offset < 0 or size < 0 or offset > len(data) - size:
        raise MediaError(f"{context}: range 0x{offset:x}+0x{size:x} exceeds {len(data)} bytes")
    return data[offset:offset + size]


def _u32(data, offset):
    return struct.unpack('<I', _range(data, offset, 4, 'u32'))[0]


def decompress_lzss(data: bytes, size: int) -> bytes:
    """4K zero-filled ring; initial write 0xFEE; LSB-first literal flags."""
    if not 0 <= size <= MAX_DECODED:
        raise MediaError(f'LZSS output size {size} exceeds configured limit')
    ring = bytearray(4096)
    output = bytearray()
    write = 0xFEE
    offset = 0
    mask = 0
    flags = 0
    while len(output) < size:
        if mask == 0:
            flags = _range(data, offset, 1, 'LZSS flag')[0]
            offset += 1
            mask = 1
        if flags & mask:
            value = _range(data, offset, 1, 'LZSS literal')[0]
            offset += 1
            output.append(value)
            ring[write] = value
            write = (write + 1) & 4095
        else:
            low, high = _range(data, offset, 2, 'LZSS reference')
            offset += 2
            start = low | ((high & 0xF0) << 4)
            length = (high & 15) + 3
            if length > size - len(output):
                raise MediaError('LZSS reference exceeds declared decoded size')
            for step in range(length):
                value = ring[(start + step) & 4095]
                output.append(value)
                ring[write] = value
                write = (write + 1) & 4095
        mask = (mask << 1) & 255
    if offset != len(data):
        raise MediaError(f'LZSS has {len(data) - offset} trailing compressed bytes')
    return bytes(output)


def read_mlh(data: bytes) -> list[dict]:
    """Decode every linked MLH member; preserve member offsets and source names.

    No files are written. Callers must apply their own output path policy.
    """
    if not data.startswith((b'MLH ENCODE 1.04 ', b'MLH ENCODE 1.02 ')):
        raise MediaError('Unsupported MLH signature/version')
    _range(data, 0, 0x30, 'MLH header')
    count = _u32(data, 0x24)
    position = _u32(data, 0x28)
    if count > 65536:
        raise MediaError('MLH member count exceeds limit')
    result, visited, names = [], set(), set()
    total_decoded = 0
    for index in range(count):
        if position < 0x30 or position in visited:
            raise MediaError(f'MLH member {index}: invalid/cyclic link 0x{position:x}')
        visited.add(position)
        header = _range(data, position, 32, 'MLH member')
        raw_name = header[:16].split(b'\0', 1)[0]
        try:
            name = raw_name.decode('ascii')
        except UnicodeDecodeError as exc:
            raise MediaError(f'MLH name at 0x{position:x} is not ASCII') from exc
        if not name or name in names or '/' in name or '\\' in name or name in ('.', '..'):
            raise MediaError(f'MLH unsafe or duplicate member name {name!r}')
        names.add(name)
        compressed_size, size, offset, next_position = struct.unpack_from('<IIII', header, 16)
        total_decoded += size
        if size > MAX_DECODED or total_decoded > MAX_DECODED * 4:
            raise MediaError('MLH decoded size exceeds configured limit')
        payload = _range(data, offset, compressed_size, f'MLH {name}')
        if compressed_size != size:
            if _u32(payload, 0) != size:
                raise MediaError(f'MLH {name}: LZSS size prefix disagrees with member header')
            payload = decompress_lzss(payload[4:], size)
        result.append(dict(name=name, offset=offset, header_offset=position,
                           compressed_size=compressed_size, size=size, data=payload))
        position = next_position
    if position != 0:
        raise MediaError('MLH last member link is not zero')
    return result


def nbp_info(data: bytes) -> dict:
    if not data.startswith(b'NBP '):
        raise MediaError('Not an NBP image')
    _range(data, 0, 0x40, 'NBP header')
    width, height = struct.unpack_from('<HH', data, 0x30)
    count = data[0x18]
    parts_offset = _u32(data, 0x34)
    direction = _u32(data, 0x20)
    bpp = data[0x38]
    if not width or not height or width * height > MAX_PIXELS or not count:
        raise MediaError('NBP dimensions/part count invalid or too large')
    if direction not in (1, 2):
        raise MediaError(f'Unsupported NBP tile direction {direction}')
    parts = []
    for index in range(count):
        entry = _range(data, parts_offset + 16 * index, 16, 'NBP part table')
        offset, size, reserved, part_width, part_height = struct.unpack('<IIIHH', entry)
        _range(data, offset, size, 'NBP part pixels')
        if not part_width or not part_height or part_width * part_height > MAX_PIXELS:
            raise MediaError('NBP part dimensions invalid or too large')
        parts.append(dict(offset=offset, size=size, width=part_width, height=part_height))
    return dict(width=width, height=height, bpp=bpp, direction=direction, parts=parts,
                palette_offset=_u32(data, 0x14))


def _png(width: int, height: int, channels: int, pixels: bytes) -> bytes:
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    color_type = {1: 0, 3: 2, 4: 6}[channels]
    stride = width * channels
    rows = b''.join(b'\0' + pixels[y * stride:(y + 1) * stride] for y in range(height))
    header = struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b'')


def convert_entry(data: bytes, name: str = '') -> bytes:
    """Repackage NBP RGB/RGBA or indexed RGB5A1 samples at native dimensions.

    PF effect masks carry bpp=24 but have one byte per pixel, as in upstream.
    The unverified 4-bit form is intentionally rejected.
    Alpha bytes are preserved; original PS2 blending semantics are unverified.
    """
    info = nbp_info(data)
    bpp = info['bpp']
    if bpp not in (8, 24, 32):
        raise MediaError(f'Unsupported NBP pixel format bpp={bpp} name={name!r}')
    is_mask = bpp == 24 and name.upper().startswith('PF')
    source_channels = 1 if is_mask else bpp // 8
    channels = 4 if bpp == 8 else source_channels
    palette = None
    if bpp == 8:
        offset = info['palette_offset']
        header = _range(data, offset, 16, 'NBP palette header')
        if header[2:4] != b'\x08\x02':
            raise MediaError(f'Unsupported NBP palette format {header[2:4].hex()}')
        packed = _range(data, offset + 16, 512, 'NBP palette')
        palette = [b''] * 256
        for index in range(256):
            value = struct.unpack_from('<H', packed, index * 2)[0]
            # PS2 CSM1 palette exchanges index bits 3 and 4.
            target = (index & 231) | ((index & 8) << 1) | ((index & 16) >> 1)
            red, green, blue = value & 31, (value >> 5) & 31, (value >> 10) & 31
            palette[target] = bytes(((red << 3) | (red >> 2), (green << 3) | (green >> 2),
                                     (blue << 3) | (blue >> 2), 255 if value & 0x8000 else 0))
    width, height = info['width'], info['height']
    pixels = bytearray(width * height * channels)
    x = y = 0
    for part in info['parts']:
        pw, ph = part['width'], part['height']
        expected = pw * ph * source_channels
        if part['size'] != expected and part['size'] != ((expected + 15) & ~15):
            raise MediaError(f'NBP part size {part["size"]} != expected {expected}')
        if x + pw > width or y + ph > height:
            raise MediaError('NBP tiles exceed declared image dimensions')
        if (info['direction'] == 1 and ph != height) or (info['direction'] == 2 and pw != width):
            raise MediaError('NBP nonrectangular tiling is unsupported')
        raw = _range(data, part['offset'], part['size'], 'NBP raw pixels')
        if any(raw[expected:]):
            raise MediaError('NBP nonzero alignment padding is unsupported')
        raw = raw[:expected]
        if palette is not None:
            raw = b''.join(palette[value] for value in raw)
        for row in range(ph):
            start = ((y + row) * width + x) * channels
            pixels[start:start + pw * channels] = raw[row * pw * channels:(row + 1) * pw * channels]
        if info['direction'] == 1:
            x += pw
        else:
            y += ph
    if (info['direction'] == 1 and x != width) or (info['direction'] == 2 and y != height):
        raise MediaError('NBP tiles do not fill the declared image dimensions')
    return _png(width, height, channels, bytes(pixels))
