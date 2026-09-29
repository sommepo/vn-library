"""Original generated archives/streams only; no commercial game bytes."""
import struct
import unittest

from vnkit.disc import FormatError
from vnkit.adapters.chunsoft_ps1 import pac_index, unpack_ike
from vnkit.adapters.registry import gui_adapter
from vnkit.adapters.chunsoft_ps1_media import unpack_otogirisou, unpack_lzs, tim, font_glyphs
from vnkit.adapters.kamaitachi_script import parse
from vnkit.adapters.otogirisou_data import parse as parse_otogirisou
from vnkit.adapters.otogirisou_audio import music_bank as otogirisou_music_bank
from vnkit.adapters.kamaitachi_audio import music_bank as kamaitachi_music_bank
from vnkit.adapters.memoriesoff_music import inspect_seq
from vnkit.adapters.otogirisou_sound import banks as effect_banks, cue_midi
from vnkit.adapters.chunsoft_import import sound_variants


def ike(events, expected):
    stream = bytearray(2)
    control, bit = 0, 0
    for kind, value in events:
        if kind == 'byte':
            stream.append(value)
        else:
            stream[control + bit // 8] |= int(value) << (bit % 8)
            bit += 1
            if bit == 16:
                control, bit = len(stream), 0
                stream.extend(b'\0\0')
    header = bytearray(b'\x9d\x89ike' + bytes(8))
    header[5] = len(stream) >> 16
    header[10] = (expected >> 16) << 2
    struct.pack_into('<H', header, 6, len(stream) & 65535)
    struct.pack_into('<H', header, 11, expected & 65535)
    return bytes(header + stream)


def end():
    return [('bit',0),('bit',0),('byte',255),('bit',0),('bit',0)]


class ChunsoftTests(unittest.TestCase):
    def test_native_sound_selector_stride_and_resource_namespace(self):
        exe = bytearray(2048 + 0x5b04c + 512)
        exe[2048 + 0x5b04c + 5 * 2] = 1
        scripts = [{'commands': [
            {'op': 0x30, 'args': list((10041).to_bytes(2, 'little'))},
            {'op': 0x32, 'args': [0, 0, *list((10005).to_bytes(2, 'little'))]},
            {'op': 0x35, 'args': [3, *list((1041).to_bytes(2, 'little'))]},
            {'op': 0x36, 'args': [2, 255, 255]},
        ]}]
        self.assertEqual(sound_variants(exe, scripts), {'41': [3, 9]})

    def test_effect_banks_keep_paired_instruments_and_reject_truncated_samples(self):
        bank = bytearray(0xc30)
        bank[:8] = b'pBAV\x07\0\0\0'
        struct.pack_into('<I', bank, 12, len(bank))
        struct.pack_into('<3H', bank, 18, 1, 1, 1)
        bank[32] = 1
        bank[0x824] = 60
        struct.pack_into('<H', bank, 0x836, 1)
        struct.pack_into('<H', bank, 0xa22, 2)
        bank[0xc21] = 1
        self.assertEqual(len(effect_banks(bank + bank + bytes(17))), 2)
        self.assertAlmostEqual(effect_banks(bank)[0][1]['duration'], 28 / 44100)
        for bad in (bank[:8], bank[:-1], bank + bank + bank):
            with self.assertRaises(FormatError): effect_banks(bad)
        bank[0xc21] = 0
        with self.assertRaises(FormatError): effect_banks(bank)

    def test_effect_cue_midi_rejects_unbounded_or_invalid_events(self):
        for events, duration, end in [([], float('nan'), 60), ([], 1, -1),
                ([{'frame': -1, 'pitch': 60, 'volume': 127}], 1, 60),
                ([{'frame': 60, 'pitch': 60, 'volume': 127}], 1, 60)]:
            with self.assertRaises(FormatError): cue_midi(events, duration, end)

    def test_ps1_tempo_running_status_and_loop_replacement(self):
        header = b'pQES\0\0\0\1\0\x60\x07\xa1\x20\4\2'
        # Unlike MIDI, Sony SEQ permits FF itself as the running status.
        source = header + bytes.fromhex('00ff5107a120605103d090602f00')
        self.assertEqual(inspect_seq(source)['duration'], .75)
        for source in (header + b'\0\xff', header + b'\0\xff\x51\x01'):
            with self.assertRaises(FormatError):
                inspect_seq(source)
        source = header + bytes.fromhex('00b0631460631460631e00ff2f00')
        with self.assertRaisesRegex(FormatError, 'multiple'):
            inspect_seq(source)
        result = inspect_seq(source, replace_loop_start=True)
        self.assertEqual((result['loopStart'], result['loopEnd']), (.5, 1.))

    def test_source_vab_lengths_bind_otogirisou_and_kamaitachi_banks(self):
        vh = bytearray(0xc20)
        vh[:8] = b'pBAV\x07\0\0\0'
        struct.pack_into('<I', vh, 12, len(vh) + 16)
        struct.pack_into('<3H', vh, 18, 1, 1, 1)
        vh[32] = 1
        struct.pack_into('<H', vh, 0xa22, 2)  # One sixteen-byte sample.
        seq = b'pQES\0\0\0\1\0\x60\x07\xa1\x20\4\2\0\xff\x2f\0'
        vb = bytes(16)
        source = vb + seq + vh + bytes(17)
        bank, audit = otogirisou_music_bank(source)
        self.assertEqual(bank, vh + vb + seq)
        self.assertEqual(audit['duration'], 0)
        broken = bytearray(source)
        broken[16 + len(seq) + 0xa22] = 3
        with self.assertRaises(FormatError): otogirisou_music_bank(broken)
        with self.assertRaises(FormatError): otogirisou_music_bank(source + b'x')
        source = struct.pack('>3I', 28 + len(seq), 12, 28) + vb + seq + vh
        self.assertEqual(kamaitachi_music_bank(source)[0], bank)
        with self.assertRaises(FormatError): kamaitachi_music_bank(source[:-1])

    def test_otogirisou_glyph_controls_and_inline_choice_table_bounds(self):
        source = bytes([1, 240, 2, 0, 9, 0, 20, 2, 0, 0, 10, 0, 0, 0, 0, 0, 3])
        rows = parse_otogirisou(source, 0)['commands']
        self.assertEqual([r.get('glyph', r.get('op')) for r in rows], [1, 242, 9, 3])
        self.assertEqual(rows[2]['next'], 15)
        for source in (b'\xf0', b'\xff\xff', b'\0\x09\0\x01\0\0\0\0',
                       b'\0\x0e\x01\0', b'\0\x09\0\x01\x2e\0\0\1\0\0\0\0'):
            with self.assertRaises(FormatError): parse_otogirisou(source, 0)

    def test_pac_sparse_ids_and_empty_archive(self):
        header = bytearray(2048)
        struct.pack_into('<6H', header, 0, 4, 1, 90, 3, 65535, 4)
        rows = pac_index(header, 8192)
        self.assertEqual([(r.id,r.offset,r.size) for r in rows], [(4,2048,4096),(90,6144,2048)])
        self.assertEqual(pac_index(struct.pack('<HH',65535,1)+bytes(2044),2048),[])

    def test_pac_rejects_extent_table_and_duplicate_errors(self):
        for fields in [(1,1,1,2,65535,3), (1,1,2,1,65535,3),
                       (1,0,65535,3), (1,1,65535,4), (65535,3)]:
            header=struct.pack('<'+'H'*len(fields),*fields).ljust(2048,b'\0')
            with self.assertRaises(FormatError):pac_index(header,6144)
        header=bytearray(struct.pack('<HH',65535,1)+bytes(2044));header[8]=1
        with self.assertRaises(FormatError):pac_index(header,2048)

    def test_ike_eager_control_refill_and_overlap(self):
        # Literal 16 is stored AFTER the second control word, not before it.
        events=[v for i in range(20) for v in [('bit',1),('byte',65+i)]]
        source=ike(events+end(),20)
        self.assertEqual(unpack_ike(source+b'preserved sector padding'),(bytes(range(65,85)),len(source)))
        # Long distance -1, length 3 overlaps the literal just emitted.
        events=[('bit',1),('byte',65),('bit',0),('bit',1),('byte',255),('bit',1),('bit',1),('bit',1)]
        self.assertEqual(unpack_ike(ike(events+end(),4))[0],b'AAAA')

    def test_ike_continuation_short_copy_and_invalid_inputs(self):
        events=[('bit',1),('byte',65),('bit',1),('byte',66),
                ('bit',0),('bit',0),('byte',254),('bit',0),
                ('bit',0),('bit',0),('byte',255),('bit',0),('bit',1)]
        source=ike(events+end(),4)
        self.assertEqual(unpack_ike(source)[0],b'ABAB')
        for broken in [source[:14], source[:-1], ike(end(),1),
                       ike([('bit',0),('bit',0),('byte',250),('bit',0)]+end(),2)]:
            with self.assertRaises(FormatError):unpack_ike(broken)
        with self.assertRaises(FormatError):unpack_ike(source,limit=3)
        flagged=bytearray(source);flagged[10]=1
        with self.assertRaisesRegex(FormatError,'unverified'):unpack_ike(flagged)

    def test_ike_large_sizes_and_bounded_output(self):
        expected = bytes(i % 251 for i in range(70000))
        source = ike([v for b in expected for v in [('bit',1),('byte',b)]] + end(), len(expected))
        self.assertEqual(source[5], 1)
        self.assertEqual(source[10], 4)
        self.assertEqual(unpack_ike(source), (expected, len(source)))
        with self.assertRaisesRegex(FormatError, 'limit'):
            unpack_ike(source, limit=65535)
        wrong = bytearray(source);wrong[10] = 8
        with self.assertRaisesRegex(FormatError, 'mismatch'):
            unpack_ike(wrong)

    def test_recovery_is_not_gui_playable_support(self):
        self.assertIsNone(gui_adapter('otogirisou-ps1'))
        self.assertIsNone(gui_adapter('kamaitachi-ps1'))

    def test_otogirisou_msb_ring_overlap_and_bounds(self):
        bits = '1' + f'{65:08b}' + '0' + f'{1:012b}' + f'{2:05b}' + '0' + '0' * 12
        source = int(bits.ljust((len(bits)+7)//8*8,'0'),2).to_bytes((len(bits)+7)//8,'big')
        self.assertEqual(unpack_otogirisou(source), (b'A'*6,len(source)))
        with self.assertRaisesRegex(FormatError,'limit'):
            unpack_otogirisou(source,limit=5)
        with self.assertRaises(FormatError):unpack_otogirisou(source[:-1])
        with self.assertRaisesRegex(FormatError,'uninitialized'):
            unpack_otogirisou(bytes.fromhex('000800'))

    def test_lzs_initial_history_and_overlapping_copy(self):
        self.assertEqual(unpack_lzs(b'LZS\x01A\xee\xf2'),b'A'*6)
        self.assertEqual(unpack_lzs(b'LZS\x00\x00\x00'),b' '*3)
        with self.assertRaisesRegex(FormatError,'limit'):
            unpack_lzs(b'LZS\x01A\xee\xf2',limit=5)

    def test_tim_palette_and_transparency_are_source_bound(self):
        palette=struct.pack('<I4H3H',18,0,0,3,1,0,31,0x83e0)
        source=struct.pack('<2I',16,8)+palette+struct.pack('<I4H',14,0,0,1,1)+b'\x10\x12'
        decoded=tim(source)
        self.assertEqual((decoded['width'],decoded['height'],decoded['consumed']),(4,1,len(source)))
        self.assertEqual(decoded['rgba'],bytes([0,0,0,0,255,0,0,255,0,255,0,255,255,0,0,255]))
        self.assertEqual(decoded['stp'],bytes([0,0,1,0]))
        with self.assertRaisesRegex(FormatError,'palette entry'):
            tim(source[:-1]+b'\xf2')
        with self.assertRaises(FormatError):tim(source[:-1])

    def test_font_offsets_and_nibble_run_bounds(self):
        source=struct.pack('>2H',1,2)+bytes([2,2,0xfe,0])+bytes([1,1,0x70,0])
        g=font_glyphs(source)
        self.assertEqual(g[0]['pixels'],bytes([14]*4))
        self.assertEqual(g[1]['pixels'],bytes([7]))
        with self.assertRaisesRegex(FormatError,'rectangle'):
            font_glyphs(source[:7]+b'\x10'+source[8:])

    def test_script_local_branch_target_and_choice_extent(self):
        # Entry 0 branches across the return at 5 to the command at byte 6.
        source=struct.pack('<H',2)+bytes([0x1e,6,0,3,0x12])
        s=parse(source,1)
        self.assertEqual([i['offset'] for i in s['commands']],[2,5,6])
        self.assertEqual(s['commands'][0]['local_target'],6)
        with self.assertRaisesRegex(FormatError,'boundary'):
            parse(struct.pack('<H',2)+bytes([0x1e,3,0,3,0x12]),1)
        with self.assertRaisesRegex(FormatError,'truncated'):
            parse(struct.pack('<H',2)+bytes([0x57,8,0,1]),1)


if __name__=='__main__':unittest.main()
