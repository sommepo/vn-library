"""Synthetic GS2 GBA structure tests. No game bytes, text or glyphs are used."""
import struct
import tempfile
import unittest
from pathlib import Path

from vnkit.adapters import gs2_gba as g
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


class LZ77Tests(unittest.TestCase):
    def test_literals_and_back_reference(self):
        # 'ABCD' as literals then copy 4 bytes from distance 4 => 'ABCDABCD'.
        blob = bytes([0x10, 8, 0, 0, 0b00001000]) + b'ABCD' + bytes([0x10, 0x03])
        self.assertEqual(g.lz77(blob, 0), (b'ABCDABCD', len(blob)))

    def test_rejects_reference_before_output(self):
        with self.assertRaises(FormatError):
            g.lz77(bytes([0x10, 4, 0, 0, 0x80, 0x00, 0x05]), 0)

    def test_rejects_wrong_type_and_truncation(self):
        with self.assertRaises(FormatError):
            g.lz77(bytes([0x11, 1, 0, 0, 0]), 0)
        with self.assertRaises(FormatError):
            g.lz77(bytes([0x10, 9, 0, 0, 0]) + b'AB', 0)


class ScriptTests(unittest.TestCase):
    def sample(self):
        first = words(0x0E, 0x0300, 0x80 + 5, 0x80 + 6, 0x01, 0x80 + 7, 0x02, 0x08, 0x81, 0x80, 0x0D)
        second = words(0x80 + 5, 0x35, 0x0100, 0x0008, 0x36, 0x0002, 0x15)
        return script([first, second], labels=[(2, 1)])

    def test_sections_labels_and_pages(self):
        data = self.sample()
        sections, labels = g.parse_script(data, 'synthetic', 0x80)
        self.assertEqual([s['section'] for s in sections], [0x80, 0x81])
        self.assertEqual(labels, [{'section': 1, 'offset': 2}])
        self.assertEqual(sections[0]['tokens'][0], {'offset': sections[0]['offset'], 'op': 0x0E,
                                                    'name': 'nametag', 'kind': 'text', 'args': [0x0300]})
        counts = g.audit_references(sections, labels, 'synthetic')
        self.assertEqual(counts, {'sections': 2, 'labels': 1, 'local': 1})
        charset = {5: 'a', 6: 'b', 7: 'c'}
        self.assertEqual(g.section_pages(sections[0]['tokens'], charset),
                         [{'speaker': 0x0300, 'text': 'ab\nc'}])
        with self.assertRaises(FormatError):
            g.section_pages(sections[0]['tokens'], {5: 'a'})

    def test_unknown_or_overlong_command_fails_closed(self):
        with self.assertRaises(FormatError):
            g.parse_script(script([words(0x72)]), 'synthetic', 0x80)
        with self.assertRaises(FormatError):
            g.parse_script(script([words(0x05, 1)]), 'synthetic', 0x80)

    def test_bad_references_fail_closed(self):
        cases = [
            script([words(0x08, 0x81, 0x80, 0x0D)]),       # choice to missing section
            script([words(0x36, 0x00, 0x15)]),              # label index names a section
            script([words(0x35, 0x0100, 0x0003, 0x15)]),    # local jump inside a token
        ]
        for data in cases:
            sections, labels = g.parse_script(data, 'synthetic', 0x80)
            with self.assertRaises(FormatError):
                g.audit_references(sections, labels, 'synthetic')

    def test_label_must_start_a_token(self):
        data = script([words(0x05, 1, 2, 0x15)], labels=[(2, 0)])
        with self.assertRaises(FormatError):
            g.parse_script(data, 'synthetic', 0x80)

    def test_malformed_header(self):
        with self.assertRaises(FormatError):
            g.section_table(struct.pack('<2I', 1, 3) + b'\0\0', 'synthetic')


class IdentityTests(unittest.TestCase):
    def test_detect_rejects_other_files_without_raising(self):
        with tempfile.TemporaryDirectory() as folder:
            wrong_size = Path(folder, 'game.gba')
            wrong_size.write_bytes(b'\0' * 16)
            self.assertFalse(g.detect(wrong_size)['supported'])
            same_size = Path(folder, 'other.gba')
            same_size.write_bytes(b'\0' * g.ROM_SIZE)
            self.assertFalse(g.detect(same_size)['supported'])
            self.assertFalse(g.detect(Path(folder, 'disc.iso'))['supported'])

    def test_registered_for_local_import_only(self):
        from vnkit.adapters.registry import adapter_spec
        spec = adapter_spec('gs2-gba')
        self.assertEqual(spec.importer_module, 'vnkit.adapters.gs2_import')
        self.assertFalse(spec.gui_playable)


if __name__ == '__main__':
    unittest.main()
