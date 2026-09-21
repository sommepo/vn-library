"""Original synthetic bytes only. These tests are not commercial game coverage."""
import struct
import unittest
import tempfile
from pathlib import Path
from vnkit.disc import FormatError
from vnkit.adapters.hunex import decompress_mzx,mrg_sections
from vnkit.adapters.clannad_media import decode_image
from vnkit.adapters.clannad_script import parse_script,expression
from vnkit.adapters.clannad_effects import acx_entries,sound_names
from vnkit.source import Source


def mzx_literal(data):
    size=len(data);data+=b'\0'*(size%2);out=b'MZX0'+struct.pack('<I',size)
    for n in range(0,len(data),128):
        chunk=data[n:n+128];out+=bytes([((len(chunk)//2-1)<<2)|3])+chunk
    return out


def mrg(parts):
    table=b'';data=b''
    for part in parts:
        offset=len(data);table+=struct.pack('<4H',offset//2048,offset%2048,(len(part)+2047)//2048,len(part)&65535);data+=part
    return b'mrgd00'+struct.pack('<H',len(parts))+table+data


class ClannadFormats(unittest.TestCase):
    def test_sound_name_precedence_and_acx_bounds(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder);clip=b'\x80\0'+b'\0'*38
            (p/'SE.ACX').write_bytes(struct.pack('>4I',0,1,16,len(clip))+clip)
            (p/'VSE.AFS').write_bytes(b'AFS\0'+struct.pack('<3I',1,16,len(clip))+clip)
            row=b'WAVE'.ljust(28,b'\0')+b'wa\r\n'+b'\0'*32
            (p/'SE_NAM.MRG').write_bytes(mrg([b'\0'*32,b'\0'*32,row,row]))
            source=Source(p);self.assertEqual(acx_entries(source)[0]['effect_id'],10000)
            self.assertEqual(sound_names(source)['names']['WAVE']['asset'],'sound:10000')
            (p/'SE.ACX').write_bytes(struct.pack('>4I',0,1,0,len(clip))+clip)
            with self.assertRaisesRegex(FormatError,'unsafe extent'):acx_entries(Source(p))

    def test_mzx_literals_and_overlap(self):
        raw=b'ABCDEF'*3000
        self.assertEqual(decompress_mzx(mzx_literal(raw),invert=False)[0],raw)
        encoded=b'MZX0'+struct.pack('<I',8)+b'\x03AB\x09\x00'
        self.assertEqual(decompress_mzx(encoded,invert=False)[0],b'ABABABAB')
        self.assertEqual(decompress_mzx(mzx_literal(b'abc'),invert=True)[0],bytes(x^255 for x in b'abc'))

    def test_bounds(self):
        for data in [b'MZX0',b'MZX0'+struct.pack('<I',8)+b'\x01\xff',b'MZX0'+struct.pack('<I',2)+b'\x03A']:
            with self.assertRaises(FormatError):decompress_mzx(data)
        with self.assertRaises(FormatError):mrg_sections(b'mrgd00\x01\0'+struct.pack('<4H',400,0,1,100))

    def test_full_colour_planes(self):
        # An original two-pixel fixture; every low colour bit matters.
        rgb=[(239,133,97),(13,66,211)];high=bytearray();fine=bytearray()
        for r,g,b in rgb:
            high+=struct.pack('<H',((r>>3)<<11)|((g>>2)<<5)|(b>>3))
            fine.append(((r&7)<<5)|((g&3)<<3)|(b&7))
        head=struct.pack('<8H',2,1,2,1,1,1,9,19)+b'\x02'
        residual_head=struct.pack('<8H',2,1,2,1,1,1,16,19)+b'\x02'
        image=mrg([head,mzx_literal(bytes(high))]);residual=mrg([residual_head,mzx_literal(bytes(fine))])
        with self.assertRaisesRegex(FormatError,'paired original MZU'):decode_image(image)
        decoded=decode_image(image,residual)
        self.assertEqual(decoded['pixels'],b''.join(bytes((*p,255)) for p in rgb))
        packed=mrg([struct.pack('<8H',2,1,2,1,1,1,8,19)+b'\x01',mzx_literal(bytes(high+fine))])
        self.assertEqual(decode_image(packed)['pixels'],decoded['pixels'])

    def test_source_locations_choices_and_unknown_expression(self):
        raw='_ZZ00001(Z00);_CALC F[001]=SEL(海,山);_IF__(F[001]==0);_IFJP *L;_ZM00102(夏です。);_WTKY;_ZY00103(L);_END_;'.encode('cp932')
        p=parse_script(raw,'SEEN0000.MZX')
        self.assertEqual(p['diagnostics'],[])
        self.assertEqual(p['instructions'][1]['selection']['options'],['海','山'])
        self.assertEqual(p['instructions'][4]['offset'],raw.index(b'_ZM'))
        self.assertEqual(p['labels']['L'],6)
        self.assertIn('operator',expression('(F[1]==1)&&(G[2]>0)'))
        with self.assertRaises(FormatError):expression('__import__(123)')
        with self.assertRaises(FormatError):parse_script(b'_WTKY','SEEN0000.MZX')


if __name__=='__main__':unittest.main()
