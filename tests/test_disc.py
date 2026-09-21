import hashlib
from pathlib import Path
import struct
import tempfile
import unittest

from vnkit.disc import IsoImage, FormatError, safe_name, write_bytes


def d32(n):return struct.pack('<I',n)+struct.pack('>I',n)

def record(name,lba,size,flags=0):
    length=33+len(name)+(0 if len(name)%2 else 1)
    b=bytearray(length);b[0]=length;b[2:10]=d32(lba);b[10:18]=d32(size);b[25]=flags
    b[28:32]=b'\1\0\0\1';b[32]=len(name);b[33:33+len(name)]=name
    return bytes(b)


def iso_data(filename=b'LINE.TXT;1',payload=b'original'):
    b=bytearray(24*2048);p=bytearray(2048)
    p[:7]=b'\1CD001\1';p[8:40]=b'TEST'.ljust(32,b' ');p[40:72]=b'FIXTURE'.ljust(32,b' ')
    p[80:88]=d32(24);p[128:132]=b'\0\10\10\0';p[156:190]=record(b'\0',20,2048,2)
    b[16*2048:17*2048]=p;b[17*2048:17*2048+7]=b'\xffCD001\1'
    records=record(b'\0',20,2048,2)+record(b'\1',20,2048,2)+record(filename,21,len(payload))
    b[20*2048:20*2048+len(records)]=records;b[21*2048:21*2048+len(payload)]=payload
    return b

class DiscTests(unittest.TestCase):
    def test_read_extract_resume_preserve(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);iso=root/'fixture.iso';iso.write_bytes(iso_data())
            original=iso.read_bytes();reader=IsoImage(iso)
            self.assertEqual(reader.read('line.txt'),b'original')
            self.assertEqual(reader.extract(root/'out')['files'][0]['status'],'created')
            self.assertEqual(reader.extract(root/'out')['files'][0]['status'],'unchanged')
            (root/'out/LINE.TXT').write_bytes(b'user work')
            with self.assertRaises(FileExistsError):reader.extract(root/'out')
            self.assertEqual((root/'out/LINE.TXT').read_bytes(),b'user work')
            self.assertEqual(iso.read_bytes(),original)

    def test_paths_and_symlinks(self):
        for path in ('../a','/a','x/../a','C:a','a\\b','a//b','a/./b','a\x00b'):
            with self.assertRaises(FormatError):safe_name(path)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'out').mkdir();(root/'elsewhere').mkdir();(root/'out/link').symlink_to(root/'elsewhere',target_is_directory=True)
            with self.assertRaises(FormatError):write_bytes(root/'out','link/a',b'bad')
            self.assertFalse((root/'elsewhere/a').exists())

    def test_malformed_disc_bounds(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'fixture.iso';b=iso_data();b[16*2048+84]^=1;p.write_bytes(b)
            with self.assertRaises(FormatError):IsoImage(p)
            p.write_bytes(iso_data(b'../BAD;1'))
            with self.assertRaises(FormatError):IsoImage(p)
            p.write_bytes(iso_data()[:21*2048])
            with self.assertRaises(FormatError):IsoImage(p)

if __name__=='__main__':unittest.main()
