"""Original synthetic structures only; no game data or source-derived text."""
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from vnkit.cri_cpk import CpkArchive, CpkMember, decompress_crilayla, utf_table
from vnkit.disc import DiscEntry, FormatError, write_bytes
from vnkit.adapters.registry import gui_adapter
from vnkit.adapters.shibuya428_psp import SNS_KEY, detect, import_game, parse_sns


def utf(name, columns, rows):
    strings = bytearray()
    def string(value):
        offset = len(strings)
        strings.extend(value.encode() + b'\0')
        return offset
    table_name = string(name)
    schema = bytearray()
    for key, kind in columns:
        schema.extend(struct.pack('>BI', 0x50 | kind, string(key)))
    values = bytearray()
    for row in rows:
        for key, kind in columns:
            value = string(row[key]) if kind == 10 else row[key]
            values.extend(struct.pack('>Q' if kind == 6 else '>I', value))
    width = sum(8 if kind == 6 else 4 for _, kind in columns)
    row_at = 32 + len(schema)
    string_at = row_at + len(values)
    end = string_at + len(strings)
    header = b'@UTF' + struct.pack('>IIIIIHHI', end - 8, row_at - 8,
                                   string_at - 8, end - 8, table_name,
                                   len(columns), width, len(rows))
    return header + schema + values + strings


class MemorySource:
    def __init__(self, data):
        self.data = data
        self.entries = {'test.cpk': DiscEntry('test.cpk', 0, len(data))}

    def read_at(self, name, offset, size):
        if offset < 0 or size < 0 or offset + size > len(self.data):
            raise FormatError('synthetic source bounds')
        return self.data[offset:offset + size]

    def chunks(self, name, offset, size):
        yield self.read_at(name, offset, size)


def cpk(*, trailing=False, duplicate_id=False, unsafe=False, outside=False):
    content, toc = (0x200, 0x800) if trailing else (0x800, 0x200)
    header = utf('CpkHeader', [(k, 6) for k in ('TocOffset', 'ContentOffset', 'ContentSize', 'Files')],
                 [{'TocOffset': toc, 'ContentOffset': content,
                   'ContentSize': 0 if trailing else 0x600, 'Files': 2}])
    rows = []
    for index in range(2):
        rows.append({'ID': 1 if duplicate_id else index,
                     'DirName': '../original/resource/folder',
                     'FileName': '../escape.bin' if unsafe else 'duplicate.bin',
                     'FileOffset': (0x2000 if outside else content - min(content, toc) + index * 4),
                     'FileSize': 4, 'ExtractSize': 4})
    table = utf('CpkTocInfo', [('ID', 4), ('DirName', 10), ('FileName', 10),
                              ('FileOffset', 6), ('FileSize', 4), ('ExtractSize', 4)], rows)
    out = bytearray(0x1000)
    for offset, magic, body in [(0, b'CPK ', header), (toc, b'TOC ', table)]:
        packet = magic + struct.pack('<IQ', 0xff, len(body)) + body
        out[offset:offset + len(packet)] = packet
    out[content:content + 8] = b'AAAABBBB'
    return bytes(out)


def sns(*, reference=b'entry', ruby=True):
    name = b'fixture.xml'
    label = b'entry'
    label_node = struct.pack('<HHI', 0, 0, 2 + 2 + 1 + len(label) + 1) + label + b'\0'
    label_node += bytes(-len(label_node) % 4)
    content = 0x434 + len(label_node)
    script = bytearray(content)
    script[:len(name)] = name
    struct.pack_into('<I', script, 0x30, 0x434)
    struct.pack_into('<I', script, 0x430, content)
    script[0x434:] = label_node
    def record(code, args=b''):
        return bytes((code, len(args))) + args
    tokens = record(0xab) + record(0x56, b'\0' + label + b'\0') + record(0x22, b'\0')
    if ruby:
        tokens += b'\x1c\x01' + 'かん'.encode('cp932') + b'\x02\x1d\x01' + '漢'.encode('cp932') + b'\x02'
    tokens += record(0x59, b'\0' + reference + b'\0') + record(0xac)
    script.extend(tokens)
    script.extend(bytes(-len(script) % 4))
    result = bytearray(0x10c)
    struct.pack_into('<I', result, 0x100, 1)
    struct.pack_into('<II', result, 0x104, len(result), len(script))
    result.extend(script)
    return bytes((v + SNS_KEY[i % 16]) & 255 for i, v in enumerate(result))


def change_sns(encoded, offset, value):
    raw = bytearray((v - SNS_KEY[i % 16]) & 255 for i, v in enumerate(encoded))
    raw[offset:offset + len(value)] = value
    return bytes((v + SNS_KEY[i % 16]) & 255 for i, v in enumerate(raw))


class CriTests(unittest.TestCase):
    def test_utf_uses_big_endian_values_and_bounded_strings(self):
        data = utf('example', [('name', 10), ('offset', 6)], [{'name': 'sample', 'offset': 0x123456789}])
        self.assertEqual(utf_table(data), ('example', [{'name': 'sample', 'offset': 0x123456789}]))
        broken = bytearray(data)
        struct.pack_into('>I', broken, 12, 0xffffffff)
        with self.assertRaises(FormatError):
            utf_table(broken)
        with self.assertRaises(FormatError):
            utf_table(data[:-1])

    def test_utf_rejects_schema_and_row_overreads(self):
        data = bytearray(utf('example', [('offset', 6)], [{'offset': 8}]))
        struct.pack_into('>H', data, 26, 4)
        with self.assertRaises(FormatError):
            utf_table(data)
        data = bytearray(utf('example', [('offset', 6)], [{'offset': 8}]))
        data[32] = 0x5f
        with self.assertRaises(FormatError):
            utf_table(data)

    def test_cpk_retains_duplicate_names_and_opaque_directory_metadata(self):
        for trailing in (False, True):
            archive = CpkArchive(MemorySource(cpk(trailing=trailing)), 'test.cpk')
            self.assertEqual([archive.read(m) for m in archive.members], [b'AAAA', b'BBBB'])
            self.assertEqual(archive.members[0].name, archive.members[1].name)
            self.assertNotEqual(archive.members[0].id, archive.members[1].id)
            self.assertTrue(archive.members[0].directory.startswith('../'))

    def test_cpk_rejects_ambiguous_ids_unsafe_names_and_extents(self):
        for option in ('duplicate_id', 'unsafe', 'outside'):
            with self.subTest(option=option), self.assertRaises(FormatError):
                CpkArchive(MemorySource(cpk(**{option: True})), 'test.cpk')
        with self.assertRaises(FormatError):
            CpkArchive(MemorySource(cpk()[:100]), 'test.cpk')

    def test_crilayla_literals_and_overlapping_backreference(self):
        # Reverse output first receives C, B, A, then repeats them by distance 3.
        bits = ''.join('0' + f'{n:08b}' for n in b'CBA') + '1' + f'{0:013b}' + '00'
        bits += '0' * (-len(bits) % 8)
        packed = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))[::-1]
        data = b'CRILAYLA' + struct.pack('<II', 6, len(packed)) + packed + bytes(256)
        self.assertEqual(decompress_crilayla(data, 262), bytes(256) + b'ABCABC')
        with self.assertRaises(FormatError):
            decompress_crilayla(data, 263)
        with self.assertRaises(FormatError):
            decompress_crilayla(data[:-1], 262)

    def test_crilayla_rejects_reference_to_unwritten_output(self):
        bits = '1' + '0' * 15
        packed = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))[::-1]
        data = b'CRILAYLA' + struct.pack('<II', 3, len(packed)) + packed + bytes(256)
        with self.assertRaises(FormatError):
            decompress_crilayla(data, 259)
        with self.assertRaises(FormatError):
            decompress_crilayla(b'raw', 4)


class SnsTests(unittest.TestCase):
    def test_recovery_preserves_ruby_fragments_labels_and_locations(self):
        raw, scripts, report = parse_sns(sns())
        tokens = scripts[0]['tokens']
        self.assertEqual([r['text'] for r in tokens if r['code'] == 1], ['かん', '漢'])
        self.assertEqual([r['code'] for r in tokens][3:7], [0x1c, 1, 0x1d, 1])
        self.assertEqual(scripts[0]['labels']['entry']['offset'], tokens[2]['offset'])
        self.assertEqual(report['missing_direct_labels'], [])
        self.assertFalse(report['runtime_implemented'])
        self.assertEqual(report['text_fragments'], 2)
        self.assertEqual(raw[:16], bytes(16))

    def test_missing_direct_target_stays_explicit(self):
        report = parse_sns(sns(reference=b'absent'))[2]
        self.assertEqual(report['missing_direct_labels'][0]['target']['label'], 'absent')

    def test_rejects_label_and_directory_corruption(self):
        encoded = sns()
        changes = [(0x104, struct.pack('<I', 0)),
                   (0x10c + 0x30, struct.pack('<I', 0x100000)),
                   (0x10c + 0x434 + 4, struct.pack('<I', 0xffffffff)),
                   (0x10c, b'../bad.xml\0')]
        for offset, value in changes:
            with self.subTest(offset=offset), self.assertRaises(FormatError):
                parse_sns(change_sns(encoded, offset, value))
        with self.assertRaises(FormatError):
            parse_sns(encoded[:-1])

    def test_rejects_bad_encoding_and_unknown_token_framing(self):
        encoded = sns()
        raw, scripts, _ = parse_sns(encoded)
        text_at = 0x10c + next(t['offset'] for t in scripts[0]['tokens'] if t['code'] == 1)
        with self.assertRaises(FormatError):
            parse_sns(change_sns(encoded, text_at + 1, b'\x81\x02'))
        with self.assertRaises(FormatError):
            parse_sns(change_sns(encoded, text_at, b'\xc1'))

    def test_exact_edition_and_gui_admission_remain_closed(self):
        self.assertIsNone(gui_adapter('428-psp'))
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(detect(Path(tmp))['supported'])
        payloads = {'to.sns': sns(), 'to.flo': b'synthetic flow placeholder'}
        members = [CpkMember(i, name, '', 0, len(data), len(data))
                   for i, (name, data) in enumerate(payloads.items())]
        archive = SimpleNamespace(name='PSP_GAME/USRDIR/scriptdatafilechunk.cpk',
                                  members=members, read=lambda m: payloads[m.name])
        source = SimpleNamespace(fingerprint=lambda: {'type': 'synthetic'})
        with tempfile.TemporaryDirectory() as tmp, \
                patch('vnkit.adapters.shibuya428_psp.identify', return_value=source), \
                patch('vnkit.adapters.shibuya428_psp.archives', return_value=[archive]):
            report = import_game('synthetic', tmp)
            self.assertEqual(report['status'], 'blocked')
            self.assertFalse(report['playable'])
            self.assertTrue((Path(tmp) / 'scripts/00.json').is_file())
            self.assertFalse((Path(tmp) / 'content.json').exists())
            self.assertEqual(import_game('synthetic', tmp), report)

    def test_recovered_files_never_clobber_or_follow_output_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_bytes(root, 'members/a/00000000.bin', b'original')
            self.assertEqual(write_bytes(root, 'members/a/00000000.bin', b'original')['status'], 'unchanged')
            with self.assertRaises(FileExistsError):
                write_bytes(root, 'members/a/00000000.bin', b'changed')
            (root / 'link').symlink_to(root / 'members', target_is_directory=True)
            with self.assertRaises(FormatError):
                write_bytes(root, 'link/escape.bin', b'changed')


if __name__ == '__main__':
    unittest.main()
