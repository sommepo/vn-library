"""Small lossless PNG writer for native-resolution source pixel data."""
import struct
import zlib


def encode(width, height, pixels, channels=4):
    if channels not in (1, 3, 4) or not 0 < width <= 16384 or not 0 < height <= 16384 or len(pixels) != width * height * channels:
        raise ValueError('Invalid PNG dimensions/pixel length')
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    stride = width * channels
    rows = b''.join(b'\0' + pixels[y*stride:(y+1)*stride] for y in range(height))
    header = struct.pack('>IIBBBBB', width, height, 8, {1:0, 3:2, 4:6}[channels], 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b'')
