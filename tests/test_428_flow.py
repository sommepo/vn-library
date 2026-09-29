"""Original miniature timeline; no source game labels or records."""
import struct
import unittest
from vnkit.disc import FormatError
from vnkit.adapters.shibuya428_flow import parse_flow, label_bucket


def fixture():
    buckets = 54
    index = bytearray(1024)
    for n, label in enumerate((b'first', b'second'), 1):
        struct.pack_into('<I', index, label_bucket(label.decode()) * 4, len(index))
        index += struct.pack('<I', 1) + label.ljust(34, b'\0') + struct.pack('<I', n)
    body = buckets + len(index)
    index += bytes(-body % 4)
    body = buckets + len(index)
    rows = bytearray(460 * 3)
    for n in range(3):
        rows[n * 460 + 458:n * 460 + 460] = b'\x99\x99'
    for n, label in enumerate((b'first', b'second'), 1):
        at = n * 460
        rows[at:at + 34] = '場面'.encode('cp932').ljust(34, b'\0')
        rows[at + 34:at + 68] = label.ljust(34, b'\0')
        struct.pack_into('<3H', rows, at + 0x1a0, 0, n, n)
    struct.pack_into('<H', rows, 460 + 0x1a6, 2)
    rows[460 + 68:460 + 102] = b'second'.ljust(34, b'\0')
    return struct.pack('<IHHIII', 4, 1, 0, buckets, 2, body) + b'image'.ljust(34, b'\0') + index + rows


class FlowTests(unittest.TestCase):
    def test_index_source_targets_cross_script_links_and_sentinel(self):
        scripts = [{'index': 1, 'labels': {'first': {'offset': 10}}},
                   {'index': 2, 'labels': {'second': {'offset': 20}}}]
        result = parse_flow(fixture(), scripts)
        self.assertFalse(result['playable'])
        self.assertEqual(result['audit'], {'resolved_labels': 3, 'declared_script_differences': []})
        self.assertEqual(result['nodes'][0]['links'][0], 2)
        self.assertEqual(result['nodes'][1]['target'], {'script': 2, 'offset': 20})
        self.assertEqual(result['nodes'][0]['title'], '場面')

    def test_bad_extents_duplicate_indices_and_links_fail(self):
        data = fixture()
        body = struct.unpack_from('<I', data, 16)[0]
        changes = [(16, '<I', body + 1), (54 + 12, '<I', 1),
                   (54 + 1024 + 42 + 4 + 34, '<I', 1),
                   (body + 460 + 0x1a6, '<H', 3), (body + 460 + 0x1a0, '<H', 1)]
        for at, fmt, value in changes:
            b = bytearray(data); struct.pack_into(fmt, b, at, value)
            with self.assertRaises(FormatError):
                parse_flow(b)
        with self.assertRaises(FormatError):
            parse_flow(data[:-1])

    def test_missing_or_ambiguous_labels_do_not_produce_targets(self):
        with self.assertRaisesRegex(FormatError, 'script label'):
            parse_flow(fixture(), [])
        scripts = [{'index': n, 'labels': {'first': {'offset': 1}, 'second': {'offset': 2}}} for n in (1, 2)]
        with self.assertRaisesRegex(FormatError, 'ambiguous'):
            parse_flow(fixture(), scripts)


if __name__ == '__main__':
    unittest.main()
