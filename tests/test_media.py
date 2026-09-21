"""Original synthetic bytes only; no commercial content in public tests."""
import struct
import unittest
import zlib

from vnkit.adapters.pia_media import MediaError, convert_entry, decompress_lzss, read_mlh


def mlh(name=b'test.dat', payload=b'hello'):
    data = bytearray(96)
    data[:16] = b'MLH ENCODE 1.04 '
    struct.pack_into('<II', data, 0x24, 1, 64)
    data[64:64 + len(name)] = name
    struct.pack_into('<IIII', data, 80, len(payload), len(payload), 96, 0)
    return bytes(data) + payload


def nbp(bpp=24):
    data = bytearray(96)
    data[:4] = b'NBP '
    data[0x18] = 2
    struct.pack_into('<I', data, 0x20, 1)
    struct.pack_into('<HHI', data, 0x30, 2, 1, 64)
    data[0x38] = bpp
    struct.pack_into('<IIIHH', data, 64, 96, 3, 0, 1, 1)
    struct.pack_into('<IIIHH', data, 80, 99, 3, 0, 1, 1)
    return bytes(data) + b'\xff\0\0\0\xff\0'


class MediaTests(unittest.TestCase):
    def test_lzss_literals_and_overlapping_ring_reference(self):
        self.assertEqual(decompress_lzss(b'\x07ABC\xee\xf3', 9), b'ABCABCABC')

    def test_lzss_rejects_truncation_and_declared_size_overflow(self):
        for payload, size in ((b'\x01', 1), (b'\0\xee', 3), (b'\0\xee\xf3', 2)):
            with self.assertRaises(MediaError):
                decompress_lzss(payload, size)

    def test_mlh_uncompressed_and_source_offset(self):
        entry, = read_mlh(mlh())
        self.assertEqual((entry['name'], entry['offset'], entry['data']), ('test.dat', 96, b'hello'))

    def test_mlh_rejects_unsafe_names_links_and_outside_payload(self):
        with self.assertRaises(MediaError):
            read_mlh(mlh(b'../private'))
        cyclic = bytearray(mlh())
        struct.pack_into('<I', cyclic, 0x24, 2)
        struct.pack_into('<I', cyclic, 92, 64)
        with self.assertRaises(MediaError):
            read_mlh(bytes(cyclic))
        with self.assertRaises(MediaError):
            read_mlh(mlh()[:-1])

    def test_png_preserves_horizontal_tile_samples_and_dimensions(self):
        png = convert_entry(nbp())
        self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
        chunks = {}
        offset = 8
        while offset < len(png):
            length, = struct.unpack_from('>I', png, offset)
            kind = png[offset + 4:offset + 8]
            body = png[offset + 8:offset + 8 + length]
            crc, = struct.unpack_from('>I', png, offset + 8 + length)
            self.assertEqual(crc, zlib.crc32(kind + body))
            chunks[kind] = body
            offset += length + 12
        self.assertEqual(struct.unpack('>IIBBBBB', chunks[b'IHDR']), (2, 1, 8, 2, 0, 0, 0))
        self.assertEqual(zlib.decompress(chunks[b'IDAT']), b'\0\xff\0\0\0\xff\0')

    def test_unknown_pixel_and_tile_formats_fail_explicitly(self):
        with self.assertRaisesRegex(MediaError, 'pixel format'):
            convert_entry(nbp(4))
        bad = bytearray(nbp())
        struct.pack_into('<I', bad, 0x20, 9)
        with self.assertRaisesRegex(MediaError, 'tile direction'):
            convert_entry(bytes(bad))

    def test_alignment_padding_must_be_zero(self):
        data = bytearray(nbp()[:96])
        struct.pack_into('<II', data, 64, 96, 16)
        struct.pack_into('<II', data, 80, 112, 16)
        data += b'\xff\0\0' + bytes(13) + b'\0\xff\0' + bytes(13)
        self.assertEqual(convert_entry(bytes(data)), convert_entry(nbp()))
        data[-1] = 1
        with self.assertRaisesRegex(MediaError, 'nonzero alignment padding'):
            convert_entry(bytes(data))

    def test_pf_masks_require_actual_single_byte_samples(self):
        data = bytearray(nbp()[:96])
        struct.pack_into('<II', data, 64, 96, 1)
        struct.pack_into('<II', data, 80, 97, 1)
        data += b'\0\xff'
        png = convert_entry(bytes(data), 'PF01.NBP')
        self.assertEqual(struct.unpack_from('>IIBBBBB', png, 16), (2, 1, 8, 0, 0, 0, 0))
        with self.assertRaises(MediaError):
            convert_entry(bytes(data), 'OTHER.NBP')


if __name__ == '__main__':
    unittest.main()
