"""Synthetic tests for the shared Gyakuten Saiban edition logic. No game bytes, text or glyphs."""
import struct
import tempfile
import unittest
from pathlib import Path

from vnkit.adapters import gs1_gba, gs3_gba
from vnkit.adapters import gyakuten_series as series
from vnkit.disc import FormatError


def words(*values):
    return struct.pack(f'<{len(values)}H', *values)


def script(sections, labels=()):
    """Header: count, section byte offsets, then packed (offset, section) labels."""
    count = len(sections) + len(labels)
    header = 4 * (count + 1)
    offsets, body = [], b''
    for section in sections:
        offsets.append(header + len(body))
        body += section
    packed = [offset | (section << 16) for offset, section in labels]
    return struct.pack(f'<{count + 1}I', count, *offsets, *packed) + body


class EditionCommandTests(unittest.TestCase):
    def test_edition_lengths_override_the_series_table(self):
        # 0x06 takes two arguments in GS3 and one in GS1; the glyph after it must stay a glyph.
        body = words(0x06, 0x0001, 0x0002, 0x80 + 9, 0x15)
        gs3 = series.tokenize(gs3_gba.EDITION, body, 0, len(body), 'synthetic')
        self.assertEqual([t.get('op', t.get('glyph')) for t in gs3], [0x06, 9, 0x15])
        self.assertEqual(gs3[0]['args'], [1, 2])
        # GS1 uses the series length: the second argument word is then a page wait (0x02).
        gs1 = series.tokenize(gs1_gba.EDITION, body, 0, len(body), 'synthetic')
        self.assertEqual([t.get('op', t.get('glyph')) for t in gs1], [0x06, 0x02, 9, 0x15])
        self.assertEqual(gs1[0]['args'], [1])

    def test_labels_must_land_on_command_starts(self):
        first = words(0x06, 0x0001, 0x0002, 0x15)
        good = script([first], labels=[(6, 0)])
        sections, labels = series.parse_script(gs3_gba.EDITION, good, 'synthetic', 0x80)
        self.assertEqual(labels, [{'section': 0, 'offset': 6}])
        bad = script([first], labels=[(4, 0)])  # inside the 0x06 command in GS3
        with self.assertRaises(FormatError):
            series.parse_script(gs3_gba.EDITION, bad, 'synthetic', 0x80)

    def test_unknown_command_fails_closed(self):
        body = words(0x7F)
        with self.assertRaises(FormatError):
            series.tokenize(gs3_gba.EDITION, body, 0, len(body), 'synthetic')


class EditionIdentityTests(unittest.TestCase):
    def test_other_files_are_not_supported(self):
        with tempfile.TemporaryDirectory() as tmp:
            for edition in (gs1_gba.EDITION, gs3_gba.EDITION):
                path = Path(tmp) / 'other.gba'
                path.write_bytes(bytes(series.ROM_SIZE))
                result = series.detect(edition, path)
                self.assertFalse(result['supported'])
                with self.assertRaises(FormatError):
                    series.identify(edition, path)

    def test_derived_names_follow_the_edition_key(self):
        edition = gs3_gba.EDITION
        self.assertEqual((edition.runtime_id, edition.case_format, edition.charset_format),
                         ('gs3-gba-native', 'vnkit.gs3-case', 'gs3-gba-charset-review-v1'))
        self.assertEqual(len(edition.episode_starts), 5)
        self.assertTrue(all(0 <= s < len(edition.scenarios) for s in edition.episode_starts))

    def test_bundled_maps_are_complete_single_characters(self):
        from vnkit.adapters import gs2_charset, gs2_gba
        for edition, glyphs in ((gs1_gba.EDITION, None), (gs3_gba.EDITION, None), (None, gs2_gba.FONT_USED_GLYPHS)):
            if edition:
                charset, names = series.bundled_reviews(edition)
                self.assertEqual((charset['format'], names['format']), (edition.charset_format, edition.names_format))
                self.assertEqual((charset['font_sha256'], names['rom_sha1']), (edition.font_sha256, edition.rom_sha1))
                glyphs = edition.glyphs
            else:
                charset, names = gs2_charset.charset_review(), gs2_charset.names_review()
                self.assertEqual((charset['font_sha256'], names['rom_sha1']), (gs2_gba.FONT_SHA256, gs2_gba.ROM_SHA1))
            self.assertEqual(sorted(map(int, charset['map'])), list(range(glyphs)))
            self.assertTrue(all(len(c) == 1 for c in charset['map'].values()))
            self.assertTrue(all(len(name) <= 6 for name in names['nametags'].values()))

    def test_a_selected_review_file_that_is_missing_is_reported(self):
        with self.assertRaisesRegex(FormatError, 'review map not found'):
            series.read_review(gs1_gba.EDITION, '/nonexistent/review.json')


if __name__ == '__main__':
    unittest.main()
