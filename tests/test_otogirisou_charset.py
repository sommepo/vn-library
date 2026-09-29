"""Synthetic source binding and legacy-override coverage; no game font bytes."""
import copy
import hashlib
import struct
import unittest
from unittest.mock import patch

from vnkit.adapters.otogirisou_charset import bundled_review
from vnkit.adapters.otogirisou_media import font
from vnkit.disc import FormatError


class OtogirisouCharsetTests(unittest.TestCase):
    def test_bundled_map_rejects_different_source_textures(self):
        with patch('vnkit.adapters.otogirisou_media.font_pages', return_value=[bytes(32768)] * 8):
            with self.assertRaisesRegex(FormatError, 'differs from source textures'):
                font(b'', b'', bundled_review())

    def test_source_bound_map_and_legacy_review_render_identically(self):
        pages = [bytes([i * 17]) * 32768 for i in range(8)]
        exe = bytearray(2048 + 0x4b9b4 + 2001 * 8)
        for index in range(1745):
            struct.pack_into('<4H', exe, 2048 + 0x4b9b4 + (index + 256) * 8,
                             12, 0x0101, 0, 0)
        review = {'format': 'vnkit.otogirisou-font-review', 'version': 2,
                  'texture_hashes': {f'{i:02}': hashlib.sha256(p).hexdigest()
                                     for i, p in enumerate(pages)},
                  'glyphs': {str(i): {'text': 'あ', 'method': 'source bitmap visual review'}
                             for i in range(1745)}}
        with patch('vnkit.adapters.otogirisou_media.font_pages', return_value=pages):
            current = font(exe, b'', review)
            legacy = copy.deepcopy(review)
            legacy['format'] = 'private.otogirisou-font-review'
            self.assertEqual(current, font(exe, b'', legacy))
            self.assertEqual(current['metrics']['1744']['text'], 'あ')
            review['glyphs']['1744']['method'] = 'unreviewed OCR candidate'
            with self.assertRaisesRegex(FormatError, 'lacks a reviewed correspondence'):
                font(exe, b'', review)


if __name__ == '__main__':
    unittest.main()
