"""Original synthetic Shin-format data; no commercial strings/assets/tables."""
import contextlib
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

from vnkit.disc import FormatError
from vnkit.adapters import higurashi_ps2 as adapter
from vnkit.adapters.higurashi_script import Cursor, compact_table, decode_text, parse_all
from vnkit.adapters.registry import gui_adapter
from vnkit.adapters.shin_ps2 import Rom, crypt, index_rom
from vnkit.adapters.shin_ps2_graphics import decompress, palette, picture, portrait_planes, voice_ads


def directory(entries):
    index = bytearray(2048)
    index[:8] = b'ROM \x04\0\x01\0'
    struct.pack_into('<I', index, 8, 1)
    rows = [('.', True, 1, 2048-16), *entries]
    struct.pack_into('<I', index, 16, len(rows))
    text_at = 20+12*len(rows)
    for number, (name, is_dir, units, size) in enumerate(rows):
        raw = name.encode('cp932') + b'\0'
        struct.pack_into('<III', index, 20+12*number,
                         (text_at-16) | (0x80000000 if is_dir else 0), units, size)
        index[text_at:text_at+len(raw)] = raw
        text_at += len(raw)
    struct.pack_into('<I', index, 12, zlib.crc32(index[16:]))
    return bytes(index)


def encrypted_disc(index, payload, base=2048):
    seed = struct.unpack_from('<I', index, 12)[0]
    encrypted = bytearray(payload)
    for at in range(0, len(payload), 2048):
        key = ((seed+1+at//2048)*0x343fd+0x269ec3)&0xffffffff
        encrypted[at:at+16] = crypt(payload[at:at+16], key)
    return bytes(base) + index[:16]+crypt(index[16:], seed) + encrypted


def script(code, entry=48):
    data = bytearray(48) + code
    data[:4] = b'SNR '
    struct.pack_into('<I', data, 4, len(data))
    struct.pack_into('<II', data, 32, len(data), entry)
    return bytes(data)


def string(raw, width=2):
    return len(raw).to_bytes(width, 'little') + raw


class ShinArchiveTests(unittest.TestCase):
    def test_two_sectors_short_tail_and_no_clobber_resume(self):
        payload = bytes(range(256))*9 + b'end'
        index = directory([('sample.snr', False, 1, len(payload))])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            disc = root/'original.iso'
            raw = encrypted_disc(index, payload)
            disc.write_bytes(raw)
            rom = Rom(disc, 2048)
            self.assertEqual(rom.read('sample.snr'), payload)
            self.assertEqual(rom.extract(root/'out'), rom.extract(root/'out'))
            self.assertEqual((root/'out/sample.snr').read_bytes(), payload)
            (root/'out/sample.snr').write_bytes(b'keep this')
            with self.assertRaises(FileExistsError): rom.extract(root/'out')
            self.assertEqual((root/'out/sample.snr').read_bytes(), b'keep this')
            self.assertEqual(disc.read_bytes(), raw)
            with self.assertRaises(FormatError): rom.read('sample.snr', limit=4)

    def test_corrupt_encrypted_directory_is_detected(self):
        index = directory([('sample', False, 1, 4)])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'disc'
            raw = bytearray(encrypted_disc(index, b'abcd'))
            raw[2048+128] ^= 1
            path.write_bytes(raw)
            with self.assertRaisesRegex(FormatError, 'CRC'): Rom(path, 2048)

    def test_path_traversal_alias_and_extent_rejections(self):
        for name in ('../bad', '/bad', 'a/b', 'a\\b', 'C:bad', 'CON', 'nul.bin', 'bad.', 'bad '):
            with self.subTest(name=name), self.assertRaises(FormatError):
                index_rom(directory([(name, False, 1, 4)]), 2048, 10000)
        for entries in (
            [('loop', True, 1, 2032)],
            [('same', False, 1, 4), ('SAME', False, 2, 4)],
            [('a', False, 1, 3000), ('b', False, 2, 4)],
            [('a', False, 0, 4)], [('a', False, 4, 8000)],
        ):
            with self.subTest(entries=entries), self.assertRaises(FormatError):
                index_rom(directory(entries), 2048, 10000)


class ShinScriptTests(unittest.TestCase):
    def test_source_ids_and_condition_choice_boundaries(self):
        text = '同じ文。'.encode('cp932') + b'\0'
        message = b'\x86' + struct.pack('<I', 1) + string(text)
        branch = b'\x46\x00' + struct.pack('<HHI', 0x8000, 1, 58)
        options = b'left\0right\0\0'
        choice = b'\x8c' + struct.pack('<4H', 1, 1, 0x8000, 0) + string(b'\0', 1) + string(options, 1)
        parsed = parse_all(script(branch + message + message + choice))
        self.assertFalse(parsed['errors'])
        self.assertFalse(parsed['unresolved_targets'])
        self.assertNotEqual(parsed['instructions'][1]['id'], parsed['instructions'][2]['id'])
        self.assertEqual(parsed['instructions'][1]['strings'][0]['bytes'], parsed['instructions'][2]['strings'][0]['bytes'])
        self.assertEqual(bytes.fromhex(parsed['instructions'][3]['strings'][1]['bytes']), options)
        self.assertFalse(parsed['playable'])

    def test_unknown_truncation_bad_strings_and_mid_instruction_jumps(self):
        for code in (b'\x01', b'\x86\0', b'\x86'+bytes(4)+string(b'bad'), b'\x90\x80', b'\x46\x07'+bytes(8)):
            with self.subTest(code=code): self.assertTrue(parse_all(script(code))['errors'])
        parsed = parse_all(script(b'\x47'+struct.pack('<I', 49)))
        self.assertEqual(parsed['unresolved_targets'], [{'source':'main.snr:00000030', 'target':49}])
        parsed = parse_all(script(b'\x47'+struct.pack('<I', 48), entry=49))
        self.assertEqual(parsed['unresolved_targets'], [{'source':'main.snr:header', 'target':49}])
        with self.assertRaises(FormatError): Cursor(b'abc', end=4)

    def test_compact_kana_is_not_applied_to_sjis_trail_bytes(self):
        # An original artificial mapping, not the game's extracted 64-character table.
        table = [str(i) for i in range(64)]
        self.assertEqual(decode_text(b'\xa0\x82\xa0\xdf', table), '0あ63')
        self.assertEqual(decode_text(b'\xb1', table, compact=False), 'ｱ')
        with self.assertRaises(FormatError): decode_text(b'\x82', table)
        with self.assertRaises(FormatError): compact_table(b'unrecognised executable')


class ShinMediaTests(unittest.TestCase):
    def test_lz_overlap_and_truncation(self):
        self.assertEqual(decompress(b'\x02A\x02\x00', 6), b'AAAAAA')
        for data, size in ((b'\x01\x00\x00', 3), (b'\x01\x00', 3), (b'\x00', 1),
                           (b'\x00AB', 1), (b'\x00A', 2)):
            with self.subTest(data=data), self.assertRaises(FormatError): decompress(data, size)

    def test_palette_and_native_png_pixel(self):
        pal = bytearray(1024)
        pal[16*4:16*4+4] = bytes((12,34,56,128))
        self.assertEqual(palette(pal, 0)[8], bytes((12,34,56,255)))
        data = bytearray(48)+pal+b'\x00\x08'
        data[:8] = b'PIC2PS2 '
        struct.pack_into('<I4HIII', data, 8, len(data), 0, 0, 1, 1, 0, 48, 1)
        struct.pack_into('<4HII', data, 32, 0, 0, 1, 1, 1072, 2)
        meta, png = picture(data)
        self.assertEqual((meta['width'], meta['height']), (1,1))
        at, compressed = 8, bytearray()
        while at < len(png):
            size = int.from_bytes(png[at:at+4], 'big')
            if png[at+4:at+8] == b'IDAT': compressed.extend(png[at+8:at+8+size])
            at += size+12
        self.assertEqual(zlib.decompress(compressed), b'\0\x0c\x22\x38\xff')
        struct.pack_into('<H', data, 32, 1)
        with self.assertRaises(FormatError): picture(data)

    def test_portrait_padding_exception_does_not_allow_missing_payload(self):
        data = bytearray(40)+bytes(1024)+b'\x00\x00'
        data[:8] = b'BUP2PS2 '
        struct.pack_into('<II4H4I', data, 8, (len(data)+15)&~15, 1, 0, 0, 1, 1, 40, 1064, 2, 0)
        meta, images = portrait_planes(data)
        self.assertFalse(meta['composition_verified'])
        self.assertEqual(len(images), 1)
        with self.assertRaises(FormatError): portrait_planes(data[:-1])

    def test_voice_wrapper_preserves_audio(self):
        ads = b'SShd'+bytes(28)+b'SSbd'+bytes(4)+bytes(16)
        wrapped = b'VDS '+struct.pack('<I', 4)+b'test'+ads
        audio, metadata = voice_ads(wrapped)
        self.assertEqual(audio, ads)
        self.assertEqual(metadata['audio_offset'], 12)
        with self.assertRaises(FormatError): voice_ads(b'VDS '+struct.pack('<I', 100)+b'abcd')


class HigurashiAdmissionTests(unittest.TestCase):
    def test_exact_edition_registry_and_cli_delegation(self):
        spec=gui_adapter(adapter.ADAPTER_ID)
        self.assertEqual(spec.gui_game_id,'higurashi-slpm66913-1.01')
        self.assertEqual(spec.max_unsupported_sites,0)
        self.assertEqual(spec.preflight_profile,'clannad')
        from vnkit.__main__ import main
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'library'
            with patch('vnkit.__main__.detected_adapter',return_value=(adapter,{'supported':True})), \
                 patch('vnkit.adapters.higurashi_import.import_game',return_value={'status':'incomplete-runtime'}) as convert, \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['import','synthetic.iso','--out',str(out)]),3)
                self.assertEqual(Path(convert.call_args.args[1]),out)

class HigurashiTextTests(unittest.TestCase):
    def test_parts_ruby_escapes_and_voice_group(self):
        from vnkit.adapters.higurashi_text import parse_message
        parts=parse_message('話者rv01/a|02/b.bせかい.<世界>！kまた。!A!1!r')
        self.assertEqual(parts[0]['speaker'],'話者')
        self.assertEqual(parts[0]['voice'],'01/a|02/b')
        self.assertEqual(parts[0]['text'][0],{'base':'世界','reading':'せかい'})
        self.assertEqual(parts[1]['text'],['また。A1r'])
        self.assertEqual(parts[1]['displayText'],parts[0]['text']+parts[1]['text'])
        with self.assertRaises(FormatError):parse_message('r<未完')



if __name__ == '__main__':
    unittest.main()
