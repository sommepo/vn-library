"""Original pixel fixtures; no commercial images."""
import struct
import unittest
from vnkit.disc import FormatError
from vnkit.psp_gim import decode


def block(kind, body):
    size = 16 + len(body)
    return struct.pack('<HHIII', kind, 0, size, 16 if kind in (2, 3) else size, 16) + body


def plane(fmt, width, height, pixels, *, order=0, kind=4, align=1, height_align=1):
    h = bytearray(64)
    bits = (16,16,16,32,4,8,16,32,4,8,8)[fmt]
    struct.pack_into('<9H', h, 0, 48,0,fmt,order,width,height,bits,align,height_align)
    struct.pack_into('<III', h, 24, 48,64,64+len(pixels))
    struct.pack_into('<4H', h, 40, 2 if kind==5 else 1,1,3,1)
    struct.pack_into('<I', h, 48, 64)
    return block(kind, h + pixels)


def gim(*pictures):
    return b'MIG.00.1PSP\0\0\0\0\0' + block(2, b''.join(block(3, p) for p in pictures))


class GimTests(unittest.TestCase):
    def test_direct_colour_and_multiple_pictures(self):
        data = gim(plane(3,1,1,b'\x10\x20\x30\xff'),plane(2,1,1,b'\x0f\xf0'))
        images = decode(data)
        self.assertEqual([p['rgba'] for p in images], [b'\x10\x20\x30\xff',b'\xff\0\0\xff'])

    def test_swizzled_indexed_image_and_nibble_order(self):
        pal = plane(3,2,1,b'\xff\0\0\xff\0\xff\0\xff',kind=5)
        # Two adjacent byte tiles: first 16 columns red, next 16 green.
        image = plane(5,32,8,bytes(128)+bytes([1])*128,order=1)
        rgba = decode(gim(image+pal))[0]['rgba']
        row = b'\xff\0\0\xff'*16+b'\0\xff\0\xff'*16
        self.assertEqual(rgba,row*8)
        self.assertEqual(decode(gim(plane(4,2,1,b'\x10')+pal))[0]['rgba'],row[:4]+row[64:68])

    def test_psp_dxt_colour_order_and_transparency(self):
        tile = struct.pack('<IHH',0xaaaaaaaa,0xf800,0x001f)
        self.assertEqual(decode(gim(plane(8,4,4,tile)))[0]['rgba'],bytes((170,0,85,255))*16)
        tile = struct.pack('<IHH',0xffffffff,0,0xffff)
        self.assertEqual(decode(gim(plane(8,4,4,tile)))[0]['rgba'],bytes(64))

    def test_psp_dxt5_alpha_word_order(self):
        indices=sum((p%8)<<(p*3) for p in range(16))
        tile=struct.pack('<IHHIHBB',0,0xf800,0,indices>>16,indices&65535,255,0)
        rgba=decode(gim(plane(10,4,4,tile)))[0]['rgba']
        self.assertEqual(list(rgba[3::4]),[255,0,218,182,145,109,72,36]*2)

    def test_dxt_partial_final_block_is_cropped_to_logical_height(self):
        tile=struct.pack('<IHH',0,0xf800,0)
        image=decode(gim(plane(8,4,2,tile,height_align=4)))[0]
        self.assertEqual((image['width'],image['height']),(4,2))
        self.assertEqual(image['rgba'],bytes((255,0,0,255))*8)

    def test_malformed_extents_formats_frames_and_indices_fail(self):
        data=gim(plane(3,1,1,b'\0'*4))
        variants=[data[:-1]]
        for at,value in [(20,0xffffff), (16+16+16+16+44,4)]:
            b=bytearray(data);struct.pack_into('<I',b,at,value);variants.append(b)
        variants.append(gim(plane(5,1,1,b'\1')+plane(3,1,1,b'\0'*4,kind=5)))
        for b in variants:
            with self.assertRaises(FormatError):decode(b)


if __name__ == '__main__':
    unittest.main()
