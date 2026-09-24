"""Original synthetic format tests; never evidence of commercial route coverage."""
import struct
import hashlib
import tempfile
import unittest
from pathlib import Path
from vnkit.disc import FormatError
from vnkit.adapters.cartagra_ps2 import index_dat
from vnkit.adapters.cartagra_graphics import decode, decompress, KEYS
from vnkit.adapters.cartagra_script import Cursor, instruction, string_tokens, parse_all
from vnkit.adapters.cartagra_media import adx_loop
from vnkit.adapters.cartagra_text import FONT_SIZE, reviewed_map, require_glyphs


class CartagraTests(unittest.TestCase):
    def test_ocr_never_becomes_reader_text_implicitly(self):
        font = bytes(FONT_SIZE)
        review = {'format': 'vnkit.cartagra-font-review', 'version': 1,
                  'font_sha256': hashlib.sha256(font).hexdigest(),
                  'glyphs': [{'glyph': 1, 'character': '日', 'verified': True},
                             {'glyph': 2, 'character': '本', 'verified': False}]}
        self.assertEqual(reviewed_map(font, review), {1: '日'})
        with self.assertRaises(FormatError): require_glyphs(reviewed_map(font, review), [1, 2])
        with self.assertRaises(FormatError): reviewed_map(font, {**review, 'format': 'vnkit.unverified-font-candidates'})
        with self.assertRaises(FormatError): reviewed_map(font, {**review, 'font_sha256': '0' * 64})
        review['glyphs'].append(review['glyphs'][0])
        with self.assertRaises(FormatError): reviewed_map(font, review)

    def test_adx_loops_preserve_samples_and_reject_invalid_ranges(self):
        data = bytearray(64)
        struct.pack_into('>HH', data, 0, 0x8000, 60)
        struct.pack_into('>II', data, 8, 44100, 88200)
        data[18] = 3
        self.assertEqual(adx_loop(data), {})
        struct.pack_into('>I', data, 24, 1)
        struct.pack_into('>I', data, 28, 44100)
        struct.pack_into('>I', data, 36, 88200)
        self.assertEqual(adx_loop(data)['loopStart'], 1)
        self.assertEqual(adx_loop(data)['loopEnd'], 2)
        struct.pack_into('>I', data, 36, 90000)
        with self.assertRaises(FormatError): adx_loop(data)

    def test_archive_units_and_extent_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'SYNTH.DAT';blob=bytearray(0x9000)
            struct.pack_into('<IIII',blob,0,0,2,1,2);p.write_bytes(blob)
            rows=index_dat(d,'SYNTH.DAT')
            self.assertEqual([(x['offset'],x['size']) for x in rows],[(0x8000,2048),(0x8800,2048)])
            struct.pack_into('<I',blob,8,0);p.write_bytes(blob)
            with self.assertRaises(FormatError):index_dat(d,'SYNTH.DAT')

    def test_expression_immediates_and_unknown_tokens(self):
        for blob,value in [(b'\x8f\x00\x00',15),(b'\x90\x00\x00',-16),
                           (b'\xa1\x23\x00\x00',291),(b'\xbf\xff\x00\x00',-1),
                           (b'\xc1\x34\x12\x00\x00',0x11234),
                           (b'\xe0\xff\xff\xff\x7f\x00\x00',0x7fffffff)]:
            self.assertEqual(Cursor(blob).expression(),[{'value':value}])
        with self.assertRaises(FormatError):Cursor(b'\x52\0\0').expression()
        with self.assertRaises(FormatError):Cursor(b'\xe0\x01').expression()

    def test_glyphs_ruby_colour_and_scale(self):
        raw=bytes.fromhex('01 8001 02 09 8100 0a 8002 0b 04 07 0c 07d0 ff')
        tokens,end=string_tokens(raw,0)
        self.assertEqual(end,len(raw))
        self.assertEqual([x['glyph'] for x in tokens if 'glyph'in x],[1,256,2])
        self.assertEqual(tokens[-1]['value'],2000)
        self.assertEqual(tokens[-2]['value'],7)
        for bad in (b'\x8b\x40\xff',b'\x80',b'\x0c\x00',b'\x1f\xff'):
            with self.assertRaises(FormatError):string_tokens(bad,0)

    def test_choice_condition_and_unknown_stop(self):
        raw=bytes.fromhex('01 14 02 0500 8100 00')
        i=instruction(raw,0,len(raw))
        self.assertEqual(i['args'],[2,5,[{'value':1}]])
        with self.assertRaises(FormatError):instruction(b'\x01\xff\x00\x00',0,4)
        # Header and one label, unknown instruction followed by a valid END.
        data=struct.pack('<4sIII',b'SC3\0',20,20,16)+b'\x01\xff\x00\x00'
        r=parse_all(data,'synthetic.scr')
        self.assertEqual(r['instructions'],{})
        self.assertEqual(r['errors'][0]['offset'],16)

    def test_bundled_charset_is_exact_font_bound(self):
        from vnkit.adapters.cartagra_charset import bundled_review
        from vnkit.adapters.cartagra_text import FONT_SIZE, reviewed_map
        review = bundled_review()
        self.assertEqual(len(review['glyphs']), 2446)
        self.assertEqual(len({r['glyph'] for r in review['glyphs']}), 2446)
        self.assertTrue(all(r['verified'] is True for r in review['glyphs']))
        with self.assertRaisesRegex(FormatError, 'another font'):
            reviewed_map(bytes(FONT_SIZE), review)
        # Callers must not mutate a shared map between import jobs.
        review['glyphs'].clear()
        self.assertEqual(len(bundled_review()['glyphs']), 2446)

    def test_cps_literal_alpha_and_truncation(self):
        size=52;data=bytearray(size)
        struct.pack_into('<4sIII',data,0,b'CPS\0',size,0,4)
        struct.pack_into('<HHI',data,32,1,1,24)
        data[40:45]=bytes([3,12,34,56,128])
        seed_off=28;seed=(seed_off+0x3786425)&0xffffffff
        for i in range(8,size//4):
            struct.pack_into('<I',data,4*i,(struct.unpack_from('<I',data,4*i)[0]+KEYS[i%8]+seed+size)&0xffffffff)
            seed=(seed*0x41c64e6d+0x9b06)&0xffffffff
        struct.pack_into('<I',data,size-4,seed_off+0x7534682)
        self.assertEqual(decode(bytes(data)),(1,1,bytes([12,34,56,255])))
        with self.assertRaises(FormatError):decompress(bytes(data[:-1]))


if __name__=='__main__':unittest.main()
