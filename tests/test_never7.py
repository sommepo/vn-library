"""Original synthetic format tests, not Never7 gameplay coverage."""
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

from vnkit.adapters.never7_ps2 import cps, overlay, ogdt_png, probe_sq, recover_images, detect, portable_path, recovered_overlay
from vnkit.disc import FormatError
from vnkit.adapters.never7_script import parse_table
from vnkit.adapters.never7_music import selected_sequence
from vnkit.adapters.cri_afs import index_afs
from vnkit.source import Source


def packed(data):
    return len(data).to_bytes(3, 'big')+b''.join(bytes([len(data[i:i+128])-1])+data[i:i+128]
                                              for i in range(0, len(data), 128))


def image_data():
    # Two source tiles, two rows each. Reconstructed rows must interleave tiles.
    header = b'ogdt'+struct.pack('<IHHHH', 1, 1, 2, 2, 1)+bytes(16)
    return header+bytes([1,2,3,4,5,6,7,8,9,10,11,12])


def pixels(png):
    cursor=8; parts=[]
    while cursor < len(png):
        size=struct.unpack_from('>I',png,cursor)[0]
        if png[cursor+4:cursor+8]==b'IDAT': parts.append(png[cursor+8:cursor+8+size])
        cursor+=12+size
    return zlib.decompress(b''.join(parts))


class Never7Formats(unittest.TestCase):
    def test_script_source_order_labels_and_original_text(self):
        strings={(6,0x100000):'案内「独自の試験。」\\k\\p',(6,0x100020):'右へ'}
        words=[0xf000000d,7,0x100000,0,0,0,0xf0000000,1,0x100020,0,0,0xf000000d,7]
        r=parse_table({'words':words,'section':6,'symbol':'test','address':0x200000},strings)
        self.assertEqual(r['errors'],[]);self.assertEqual(r['labels'][7],[2,13])
        self.assertEqual(r['instructions'][2]['text'],strings[6,0x100000])
        self.assertEqual(r['instructions'][6]['text'],'右へ')
        self.assertEqual(r['instructions'][6]['id'],'test:00000018')

    def test_script_does_not_scan_past_unknown_or_truncated_words(self):
        for words in ([0xf00000ff,0x100000,0,0,0],[0xf0000000],[0xf0000017,0x200000],[0x100040,0,0,0]):
            r=parse_table({'words':words,'section':6,'symbol':'test','address':0x200000},{})
            self.assertEqual(len(r['errors']),1);self.assertEqual(list(r['instructions']),[0])

    def test_credits_use_their_own_widths_and_never_accept_story_operations(self):
        table={'words':[0xf000000d,0,0xf0000042,60,0xf0000022,0,0],
               'section':24,'symbol':'original_test_credits','address':0x200000}
        r=parse_table(table,{},credits=True)
        self.assertEqual(r['errors'],[]);self.assertEqual(r['kind'],'mend-credits')
        self.assertEqual(list(r['instructions']),[0,2,4]);self.assertEqual(r['padding_words'],2)
        for words in ([0xf000000f,0x80150001,0],[0xf0000022,1],[0xf00000a5]):
            self.assertEqual(len(parse_table({**table,'words':words},{},credits=True)['errors']),1)

    def test_afs_stale_size_opt_in_retains_bounds_and_names(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'TEST.AFS';data=bytearray(4144);data[:8]=b'AFS\0'+struct.pack('<I',1)
            struct.pack_into('<II',data,8,2048,3);data[2048:2051]=b'abc';data[4096:4103]=b'one.adx';struct.pack_into('<I',data,4140,100)
            p.write_bytes(data)
            with self.assertRaises(FormatError):index_afs(Source(folder),'TEST.AFS')
            row=index_afs(Source(folder),'TEST.AFS',allow_stale_name_sizes=True)[0]
            self.assertEqual((row['size'],row['name_record_size']),(3,100))
            for offset,length,name in [(0,3,b'one.adx'),(2048,99999,b'one.adx'),(2048,3,b'../bad!')]:
                struct.pack_into('<II',data,8,offset,length);data[4096:4103]=name;p.write_bytes(data)
                with self.assertRaises(FormatError):index_afs(Source(folder),'TEST.AFS',allow_stale_name_sizes=True)
    def test_cps_overlap_and_extent(self):
        data=b'\0\0\x09\x02abc\x8c\x02TRAILER'
        decoded,used=cps(data)
        self.assertEqual(decoded,b'abcabcabc');self.assertEqual(data[used:],b'TRAILER')
        self.assertEqual(cps(packed(image_data()))[0],image_data())

    def test_cps_refuses_bad_input(self):
        for data in (b'',b'\0\0\0',b'\xff\xff\xff',b'\0\0\x03\x80\0',
                     b'\0\0\x03\x02a',b'\0\0\x02\x02abc',b'\0\0\x03\x80'):
            with self.subTest(data=data),self.assertRaises(FormatError):cps(data)
        with self.assertRaises(FormatError):cps(packed(b'ab'),limit=1)

    def test_ogdt_tiles_and_rejected_variant(self):
        w,h,png=ogdt_png(image_data())
        self.assertEqual((w,h),(2,2))
        self.assertEqual(pixels(png),bytes([0,1,2,3,255,7,8,9,255,0,4,5,6,255,10,11,12,255]))
        with self.assertRaises(FormatError):ogdt_png(image_data()[:-1])

    def test_overlay_header_and_padding(self):
        data=bytearray(2048);data[:4]=b'MWo3'
        struct.pack_into('<7I',data,4,1,0x5dd000,0xc0,16,0,0x5dd110,0x5dd110)
        self.assertEqual(overlay(data,0)['size'],272)
        data[272]=1
        with self.assertRaises(FormatError):overlay(data,0)
        with self.assertRaises(FormatError):overlay(bytes(64),0)

    def test_two_sq_streams_are_not_discarded(self):
        stream=struct.pack('<IH',6,96)+b'\x00\xff\x2f\0'
        song_at=72+2*len(stream)
        data=bytearray(song_at+48)
        for at,magic in ((0,b'IECSsreV'),(16,b'IECSuqeS'),(48,b'IECSidiM'),(song_at,b'IECSgnoS')):
            data[at:at+8]=magic
        struct.pack_into('<I',data,32,song_at)
        struct.pack_into('<2I',data,64,24,24+len(stream))
        struct.pack_into('<I',data,song_at+8,48)
        data[72:song_at]=stream*2
        result=probe_sq(data)
        self.assertFalse(result['unchanged_parser']);self.assertEqual(len(result['streams']),2)
        self.assertEqual(result['streams'][1]['offset'],82)
        data[song_at+24:song_at+40]=bytes.fromhex('a00000a07f7f0000a00001a07f7f0000')
        both,selected=selected_sequence(data)
        self.assertEqual(selected,both['streams'][0]['sequence']);self.assertEqual(len(both['streams']),2)
        data[song_at+26]=1
        with self.assertRaises(FormatError):selected_sequence(data)
        data[82:86]=b'BAD!'
        with self.assertRaises(ValueError):probe_sq(data)

    def test_sector_members_and_nonzero_padding(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);src=root/'disc';src.mkdir();raw=packed(image_data())
            (src/'IMAGE').write_bytes(raw+bytes(2048-len(raw))+raw)
            report={'source':{},'archives':{'disc_resources':[{'path':'IMAGE','size':2048+len(raw),'format':'CPS image(s)'}]}}
            with patch('vnkit.adapters.never7_ps2.inspect',return_value=report):
                result=recover_images(src,root/'out')
                self.assertEqual((result['members'],result['pngs'],result['failures']),(2,2,[]))
                self.assertEqual(recover_images(src,root/'out'),result)
                (src/'IMAGE').write_bytes(raw+b'x'+bytes(2047-len(raw))+raw)
                failed=recover_images(src,root/'bad')
                self.assertIn('Nonzero',failed['failures'][0]['error'])

    def test_trailing_dot_extraction_is_portable_and_keeps_source_identity(self):
        self.assertEqual(portable_path('A020/A025.'),'A020/A025%2E')
        self.assertNotEqual(portable_path('A020/A025%2E'),portable_path('A020/A025.'))
        for bad in ('../O0.', '/O0.', 'OLM/../O0.', 'OLM\\O0.'):
            with self.assertRaises(FormatError):portable_path(bad)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);src=root/'disc';(src/'A020').mkdir(parents=True)
            raw=packed(image_data());(src/'A020/A025.').write_bytes(raw)
            report={'source':{},'archives':{'disc_resources':[{'path':'A020/A025.','size':len(raw),'format':'CPS image(s)'}]}}
            with patch('vnkit.adapters.never7_ps2.inspect',return_value=report):
                first=recover_images(src,root/'out')
                self.assertEqual(first,recover_images(src,root/'out'))
                import json
                manifest=json.loads((root/'out/image-manifest.json').read_text(encoding='utf-8'))
                member=manifest['members'][0]
                self.assertEqual(member['source'],'A020/A025.')
                self.assertTrue((root/'out'/member['image']).is_file())
                self.assertTrue(all(not part.endswith('.') for part in Path(member['image']).parts))
            old=root/'raw/OLM/O0.';old.parent.mkdir(parents=True);old.write_bytes(b'legacy')
            self.assertEqual(recovered_overlay(root,0),old)
            new=old.with_name('O0%2E');new.write_bytes(b'portable')
            self.assertEqual(recovered_overlay(root,0),new)

    def test_no_false_edition_detection(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);(p/'SYSTEM.CNF').write_text('SLPS_252.56\nVER = 1.01\n')
            (p/'SLPS_252.56').write_bytes(b'not the tested executable')
            self.assertFalse(detect(p)['supported'])


if __name__=='__main__':unittest.main()
