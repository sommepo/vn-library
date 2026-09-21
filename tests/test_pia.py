"""Original synthetic bytecode; contains no game content."""
import struct
import tempfile
import unittest
from pathlib import Path
from vnkit.disc import FormatError
from vnkit.adapters.pia_ps2 import Source, nfp_entries, parse_script


def spc(code,relocations=b''):
    payload=struct.pack('<HHH',1024,0,0)+code
    return b'SCRP'+struct.pack('<I',len(payload)+16)+b'CODE'+struct.pack('<I',len(payload))+payload+relocations+b'TERM'+b'\0'*8


class PiaTests(unittest.TestCase):
    def test_strings_are_data_not_false_opcodes_and_repeats_keep_identity(self):
        raw='同じ文章。'.encode('cp932')+b'\0'
        chunk=b'\x10'+struct.pack('<H',len(raw))+raw
        result=parse_script(spc(chunk+chunk+b'\x8f'),'TEST.SPC')
        self.assertEqual(len(result['instructions']),3)
        self.assertEqual([s['text'] for s in result['strings']],['同じ文章。']*2)
        self.assertNotEqual(result['strings'][0]['id'],result['strings'][1]['id'])
        self.assertFalse(result['execution_implemented'])
        self.assertEqual(result['failures'],[])

    def test_unknown_opcode_stops_with_source(self):
        result=parse_script(spc(b'\x01\x8f'),'TEST.SPC')
        self.assertEqual(result['failures'][0]['offset'],22)
        self.assertEqual(result['instructions'],[])

    def test_control_targets_and_native_relocations(self):
        # First branch targets final EXIT; one correctly located native relocation.
        code=b'\x11'+struct.pack('<I',10)+b'\x80'+b'\0'*4+b'\x8f'
        payload=b'Mess\0'+struct.pack('<II',6,0)+b'\0'
        rel=b'FUNC'+struct.pack('<I',len(payload))+payload
        result=parse_script(spc(code,rel),'TEST.SPC')
        self.assertEqual(result['instructions'][1]['native'],'Mess')
        self.assertEqual(result['failures'],[])
        bad=b'\x11'+struct.pack('<I',8)+b'\x8f'
        self.assertIn('not a decoded instruction boundary',parse_script(spc(bad),'BAD.SPC')['failures'][0]['reason'])

    def test_truncation_rejected(self):
        with self.assertRaises(FormatError):parse_script(spc(b'\x10\xff\xff'),'BAD.SPC')
        with self.assertRaises(FormatError):parse_script(b'SCRP','BAD.SPC')

    def test_nfp_no_path_traversal_or_out_of_bounds(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);p=root/'T.NFP';data=bytearray(4096)
            data[:24]=b'NFP2.0 (c)NOBORI 1997-02';struct.pack_into('<III',data,0x34,1,0x800,0xc00)
            data[0x800:0x808]=b'A.SPC\0\0\0';struct.pack_into('<II',data,0x818,0xc00,1024);p.write_bytes(data)
            self.assertEqual(nfp_entries(Source(root),'T.NFP')[0].size,1024)
            data[0x800:0x808]=b'../A\0\0\0\0';p.write_bytes(data)
            with self.assertRaises(FormatError):nfp_entries(Source(root),'T.NFP')
            data[0x800:0x808]=b'A.SPC\0\0\0';struct.pack_into('<II',data,0x818,0xfff,1024);p.write_bytes(data)
            with self.assertRaises(FormatError):nfp_entries(Source(root),'T.NFP')

if __name__=='__main__':unittest.main()
