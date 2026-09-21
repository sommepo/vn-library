"""Original synthetic format tests; no commercial text, bytecode or assets."""
import struct
import tempfile
import unittest
from pathlib import Path
from vnkit.source import Source
from vnkit.disc import FormatError, write_bytes
from vnkit.adapters.cri_afs import index_afs, unpack_lzss
from vnkit.adapters.remember11_ps2 import text_candidates, thumbnail_png


def literal_pack(data):
    return struct.pack('<I', len(data)) + b''.join(bytes([(1 << len(data[i:i+8]))-1]) + data[i:i+8] for i in range(0, len(data), 8))


class Remember11Tests(unittest.TestCase):
    def test_lzss_literals_overlap_and_rejection(self):
        raw = b'original test payload'
        self.assertEqual(unpack_lzss(literal_pack(raw)), raw)
        self.assertEqual(unpack_lzss(struct.pack('<I', 6)+b'\x01A\xee\xf2'), b'A'*6)
        for data in [b'', struct.pack('<I', 100), literal_pack(raw)[:-1], literal_pack(raw)+b'X', struct.pack('<I', 2)+b'\0\0\0']:
            with self.assertRaises(FormatError):
                unpack_lzss(data)
        with self.assertRaises(FormatError):
            unpack_lzss(literal_pack(raw), limit=2)

    def afs(self, name=b'ORIGINAL.BIN', length=3, offset=2048):
        data=bytearray(4144);data[:8]=b'AFS\0'+struct.pack('<I',1)
        struct.pack_into('<II',data,8,offset,length);data[2048:2051]=b'abc'
        data[4096:4096+len(name)]=name;struct.pack_into('<I',data,4140,3)
        return data

    def test_afs_valid_extent_and_corrupt_names_bounds(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'TEST.AFS'
            p.write_bytes(self.afs());e=index_afs(Source(d),'TEST.AFS')[0]
            self.assertEqual((e['name'],e['offset'],e['size']),('ORIGINAL.BIN',2048,3))
            for data in [self.afs(b'../BAD'),self.afs(length=99999),self.afs(offset=0),self.afs(b'BAD\\FILE'),self.afs(b'A/B')]:
                p.write_bytes(data)
                with self.assertRaises(FormatError):
                    index_afs(Source(d),'TEST.AFS')

    def test_original_japanese_candidates_retain_controls_and_offsets(self):
        text='これは独自のテストです。%K%P'
        raw=b'\0\1\2'+text.encode('cp932')+b'\0'
        result=text_candidates(raw,'synthetic')[0]
        self.assertEqual(result['text'],text);self.assertEqual(result['offset'],3)
        self.assertEqual(bytes.fromhex(result['raw_hex']),text.encode('cp932'))
        self.assertIn('NOT executed',result['classification'])

    def test_thumbnail_bounded_layout(self):
        data=bytearray(68);data[:8]=b'TIM2\x04\0\1\0';struct.pack_into('<IIIH',data,16,52,0,4,48);data[35]=3
        struct.pack_into('<HH',data,36,1,1);data[64:]=b'\x01\x02\x03\x80'
        self.assertTrue(thumbnail_png(data).startswith(b'\x89PNG'))
        with self.assertRaises(FormatError):thumbnail_png(data[:-1])

    def test_full_bip_native_gutters_and_portrait_bounds(self):
        from vnkit.adapters.remember11_graphics import decode
        for count in (5,10):
            pixels=256;data=bytearray(pixels+512*16*4)
            struct.pack_into('<I',data,0,count)
            offsets=[128,148]+([148]*5 if count==10 else [])+[pixels,pixels,len(data)]
            struct.pack_into('<'+'I'*count,data,4,*offsets)
            struct.pack_into('<HHIHH',data,128,1,0,0,14,14)
            struct.pack_into('<HHBBBB',data,140,2,0,0,0,1,1)
            for y in range(1,15):
                for x in range(1,15):data[pixels+(y*512+x)*4:pixels+(y*512+x)*4+4]=bytes([x,y,7,128])
            w,h,rgba=decode(data);self.assertEqual((w,h),(14,14));self.assertEqual(rgba[:4],bytes([1,1,7,255]));self.assertEqual(rgba[-4:],bytes([14,14,7,255]))
            struct.pack_into('<H',data,142,9999)
            with self.assertRaises(FormatError):decode(data)

    def test_script_control_flow_and_strict_original_japanese(self):
        from vnkit.adapters.remember11_script import Script
        commands=[{'handler':1,'name':'synthetic','size':2} for _ in range(116)]
        commands[3]['size']=4;commands[115]['size']=10
        text='独自の検証。%K%P'.encode('cp932')+b'\0'
        raw=struct.pack('<BBH',3,0,4)+struct.pack('<BBHHHH',115,0,16,7,65535,0)+bytes([1,1])+text
        s=Script(raw,'TEST.BIP',commands).discover()
        self.assertFalse(s['errors']);self.assertEqual(set(s['instructions']),{'0','4','14'})
        self.assertEqual(s['instructions']['4']['text'],'独自の検証。%K%P')
        self.assertEqual(s['instructions']['4']['voice'],65535)
        self.assertTrue(Script(bytes([255,0]),'BAD',commands).discover()['errors'])

    def test_safe_resume_and_changed_output_refused(self):
        with tempfile.TemporaryDirectory() as d:
            write_bytes(Path(d),'original.bin',b'original');write_bytes(Path(d),'original.bin',b'original')
            with self.assertRaises(FileExistsError):write_bytes(Path(d),'original.bin',b'changed')
            self.assertEqual((Path(d)/'original.bin').read_bytes(),b'original')

if __name__=='__main__':unittest.main()
