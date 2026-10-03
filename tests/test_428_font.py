import struct
import unittest
from vnkit.adapters.shibuya428_font import decode, hash_key, outlined_rgba
from vnkit.disc import FormatError


def fixture(stream=b'\x12\x34'):
    gsf = bytearray(96)
    struct.pack_into('<I', gsf, 0, 1)
    struct.pack_into('<18h', gsf, 32, *([12, 12, 0, 0, 12, 12] * 3))
    struct.pack_into('>HH', gsf, 68, 2, 2)
    gsf[72:72+len(stream)] = stream
    has = bytearray(4102)
    struct.pack_into('>H', has, hash_key(12, 0x3042) * 2, 2048)
    struct.pack_into('>HHH', has, 4096, 0x800c, 0x3042, 0)
    return gsf, has


class FontTests(unittest.TestCase):
    def test_native_outline_uses_coverage_rgb_and_neighbour_alpha(self):
        rgba = outlined_rgba({'width': 3, 'height': 1, 'coverage': bytes([0, 3, 0])})
        self.assertEqual(rgba, bytes([0, 0, 0, 102, 51, 51, 51, 102, 0, 0, 0, 102]))
        self.assertEqual(outlined_rgba({'width': 1, 'height': 1, 'coverage': bytes([15])}), bytes([255] * 4))
        with self.assertRaises(FormatError):
            outlined_rgba({'width': 1, 'height': 1, 'coverage': bytes([16])})

    def test_original_key_metrics_and_nibble_order(self):
        g, h = fixture()
        f = decode(g, h)
        self.assertEqual(f['entries'], [{'style': 0, 'size': 12, 'codepoint': 0x3042, 'index': 0}])
        self.assertEqual(f['glyphs'][0]['coverage'], bytes([1, 2, 3, 4]))
        self.assertEqual(f['glyphs'][0]['metrics'][0], 12)

    def test_run_marker_and_boundary(self):
        g, h = fixture(b'\xff\x00')
        self.assertEqual(decode(g, h)['glyphs'][0]['coverage'], bytes([15] * 4))
        g[73] = 0x10
        with self.assertRaisesRegex(FormatError, 'run exceeds'):
            decode(g, h)

    def test_hash_chains_and_font_pointer_are_bounded(self):
        g, h = fixture()
        struct.pack_into('>H', h, 4098, 0x3044)
        with self.assertRaisesRegex(FormatError, 'hash key'):
            decode(g, h)
        g, h = fixture()
        struct.pack_into('<I', g, 0, 0)
        with self.assertRaisesRegex(FormatError, 'overlaps pointer'):
            decode(g, h)
        g, h = fixture()
        h[4096] = 0
        with self.assertRaisesRegex(FormatError, 'chain bounds'):
            decode(g, h)

    def test_missing_payload_does_not_read_the_next_record(self):
        g, h = fixture()
        with self.assertRaisesRegex(FormatError, 'truncated'):
            decode(g[:72], h)
