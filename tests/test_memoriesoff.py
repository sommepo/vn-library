"""Original synthetic PS1 sector, bytecode and text fixtures; no game data."""
from pathlib import Path
import struct
import tempfile
import unittest
import zlib
from test_disc import iso_data
from vnkit.disc import FormatError
from vnkit.psx_disc import Mode2Image, SYNC
from vnkit.adapters.memoriesoff_ps1 import unpack, parse_script
from vnkit.adapters.memoriesoff_text import decode, verify_font
from vnkit.adapters.memoriesoff_music import inspect_seq
from vnkit.adapters.memoriesoff_media import tim


def raw_disc(cooked):
    raw = bytearray()
    for at in range(0, len(cooked), 2048):
        block = bytearray(2352)
        block[:12] = SYNC
        block[15] = 2
        block[16:24] = bytes([1, 0, 8, 0]) * 2
        block[24:2072] = cooked[at:at+2048]
        raw.extend(block)
    return raw


class MemoriesOffTests(unittest.TestCase):
    def test_mode2_form1_and_form2_separation(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t); cue = p/'disc.cue'; image = p/'disc.bin'
            cue.write_text('FILE "disc.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\n')
            raw = raw_disc(iso_data()); image.write_bytes(raw)
            d = Mode2Image(cue)
            self.assertEqual(d.read('LINE.TXT'), b'original')
            raw[21*2352+18] |= 32; raw[21*2352+22] |= 32; image.write_bytes(raw)
            with self.assertRaisesRegex(FormatError, 'Form 2'):
                d.read('LINE.TXT')
            self.assertEqual(len(next(d.raw_sectors(21,1))),2352)
            raw[21*2352+22] ^= 1; image.write_bytes(raw)
            with self.assertRaisesRegex(FormatError, 'subheaders'):
                next(d.raw_sectors(21,1))

    def test_cue_rejects_unsafe_or_ambiguous_track(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t)/'disc.cue'
            for name in ('../disc.bin', '/disc.bin', 'nested/disc.bin', 'C:disc.bin'):
                p.write_text(f'FILE "{name}" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\n')
                with self.assertRaises(FormatError): Mode2Image(p)
            p.write_text('FILE "disc.bin" BINARY\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n')
            with self.assertRaises(FormatError): Mode2Image(p)

    def test_lzss_overlap_bounds_and_padding(self):
        payload=b'\x01A\xee\xf2' # literal A, then overlapping five-byte ring copy
        self.assertEqual(unpack(struct.pack('<I',8)+payload+b'ignored sector padding'),b'AAAAAA')
        with self.assertRaises(FormatError): unpack(struct.pack('<I',8)+payload,5)
        with self.assertRaises(FormatError): unpack(struct.pack('<I',6)+b'\0\xee')
        with self.assertRaises(FormatError): unpack(struct.pack('<I',90)+payload)

    def test_bytecode_boundaries_continuation_and_unknowns(self):
        a=b'\x10\x23\x01'+b'example'+b'\x81\x66\x01\x16\x10\x23\x01next\x81\x66\0\x17\0'
        s=parse_script(a,3)
        self.assertEqual([i['code'] for i in s['instructions']],[16,22,16,23,0])
        self.assertEqual(s['instructions'][0]['continuation'],1)
        self.assertEqual(s['instructions'][0]['read_id'],0x123)
        self.assertEqual(parse_script(b'\x50\x03\0',4)['instructions'][0]['unresolved_target'],3)
        with self.assertRaises(FormatError): parse_script(b'\x44',0)
        with self.assertRaises(FormatError): parse_script(b'\x10\x01\0broken',0)

    def test_reviewed_text_and_ps1_seq(self):
        self.assertEqual(decode(b'\x83\xca\x81\x66'), '栞\n')
        with self.assertRaises(FormatError): decode(b'\x83\xa4')
        with self.assertRaises(FormatError): verify_font(b'not the reviewed font')
        # Original one-note 500ms sequence, with PS1's lengthless meta end.
        seq=b'pQES\0\0\0\1\0\x60\x07\xa1\x20\4\2'+b'\0\x90\x3c\x40\x60\x90\x3c\0\0\xff\x2f\0'
        self.assertEqual(inspect_seq(seq)['duration'],.5)
        with self.assertRaises(FormatError): inspect_seq(seq+b'\x01')

    def test_portrait_uses_native_last_palette_entry_for_transparency(self):
        source=bytearray(544+2*240)
        struct.pack_into('<2I',source,0,16,9)
        struct.pack_into('<I4H',source,8,524,0,0,256,1)
        struct.pack_into('<H',source,20,0x7c1f) # Palette zero is opaque magenta.
        struct.pack_into('<H',source,530,0x03e0) # Native upload clears this green entry.
        struct.pack_into('<I4H',source,532,492,0,0,1,240)
        source[544:]=bytes([0,255])*240
        _,png=tim(source,portrait=True)
        position=8;compressed=bytearray()
        while position<len(png):
            size=int.from_bytes(png[position:position+4],'big')
            if png[position+4:position+8]==b'IDAT':compressed.extend(png[position+8:position+8+size])
            position+=size+12
        row=zlib.decompress(compressed)[:9]
        self.assertEqual(row[1:5],bytes([255,0,255,255]))
        self.assertEqual(row[8],0)


if __name__=='__main__':unittest.main()
