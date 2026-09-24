"""Original synthetic bytecode only; these are not game/route tests."""
import struct
import unittest
from vnkit.disc import FormatError
from vnkit.adapters.remember11_script import Script
from vnkit.adapters.ever17_script import Ever17Script
from vnkit.adapters.remember11_graphics import decode


class Ever17ComparisonTests(unittest.TestCase):
    def commands(self):
        commands=[{'handler':1,'name':'synthetic','size':2} for _ in range(135)]
        commands[3]['size']=4
        commands[115]['size']=10
        for op in (0x3b,0x3f,0x40,0x41,0x42,0x47):commands[op]['size']=4
        return commands

    def mapping(self):
        return {op:op if op<0x4c else op-1 for op in range(130) if op not in (0x4c,0x60)}

    def test_original_offsets_bytes_text_and_control_flow_survive_remap(self):
        text='これは独自のテスト。'.encode('cp932')+b'\0'
        raw=struct.pack('<BBH',3,0,4)+struct.pack('<BBHHHH',0x74,0,16,7,65535,0)+b'\1\0'+text
        parsed=Script(raw,'ORIGINAL',self.commands(),opcode_map=self.mapping()).discover()
        self.assertFalse(parsed['errors'])
        self.assertEqual(set(parsed['instructions']),{'0','4','14'})
        i=parsed['instructions']['4']
        self.assertEqual((i['sourceOp'],i['op'],i['words'][0]),(0x74,0x73,0x74))
        self.assertEqual((i['textOffset'],i['text']),(16,'これは独自のテスト。'))
        self.assertEqual(raw[4],0x74)

    def test_title_and_compact_sound_remain_explicit_unimplemented_operations(self):
        commands=self.commands()
        raw=struct.pack('<BBH',0x4c,0,42)+bytes([0x42,25,1,0])
        parsed=Ever17Script(raw,'TEST',commands,opcode_map=self.mapping()).discover()
        self.assertFalse(parsed['errors'])
        self.assertEqual(set(parsed['instructions']),{'0','4','6'})
        self.assertEqual(parsed['instructions']['0']['titleIndex'],42)
        self.assertEqual(parsed['instructions']['4']['sub'],25)
        self.assertTrue(parsed['instructions']['0']['runtimeUnsupported'])
        self.assertTrue(parsed['instructions']['4']['runtimeUnsupported'])
        self.assertEqual(commands[0x42]['size'],4)
        self.assertEqual(Script(bytes([0x42,25,0,0,1,0]),'R11',commands).instruction(0)['size'],4)

    def test_unknown_null_truncated_and_invalid_maps_fail_closed(self):
        for data in (bytes([0x60,0]),bytes([0xff,0]),bytes([0x4c,0,1])):
            parsed=Ever17Script(data,'BAD',self.commands(),opcode_map=self.mapping()).discover()
            self.assertTrue(parsed['errors'])
            self.assertIn('BAD:0000',parsed['errors'][0])
        for mapping in ({256:0},{0:999},{0:-1},{True:0}):
            with self.assertRaises(FormatError):Script(b'', 'BAD',self.commands(),opcode_map=mapping)

    def test_credits_return_to_source_but_end_returns_to_menu(self):
        raw=bytes([1,2,3,0,6,0,1,1,0xff,0xff])
        parsed=Ever17Script(raw,'CREDITS',self.commands(),opcode_map=self.mapping()).discover()
        self.assertFalse(parsed['errors'])
        self.assertEqual(set(parsed['instructions']),{'0','2','6'})
        self.assertEqual(parsed['instructions']['0']['targets'],[2])
        self.assertEqual(parsed['instructions']['6']['targets'],[])

    def test_only_evidenced_external_selectors_are_decoded(self):
        commands=self.commands();commands[9]['size']=6
        # Entry 0 -> 12, entry 1 -> 14; bytes at 10 belong to unrelated data.
        raw=struct.pack('<3H',0x0f09,6,0x6000)+struct.pack('<3H',12,14,0xfffe)+bytes([1,1,1,1])
        s=Ever17Script(raw,'ENTRIES',commands,opcode_map=self.mapping(),entry_indexes=(0,1)).discover()
        self.assertFalse(s['errors']);self.assertEqual(s['instructions']['0']['jumpTable'],{'0':12,'1':14})
        self.assertEqual(set(s['instructions']),{'0','12','14'})

    def test_ever17_tiles_keep_the_edges_that_remember11_crops(self):
        # One original synthetic atlas, two tiles across. The same bytes have
        # explicitly different geometry in the two engine revisions.
        directory = struct.pack('<HHIHHHHBBBB',1,0,0,32,16,2,0,0,0,2,1)
        pixels = bytes(channel for y in range(16) for x in range(512)
                       for channel in (x % 256,y,7,128))
        data = struct.pack('<6I',5,24,44,44,44,44+len(pixels))+directory+pixels
        w,h,ever = decode(data,tile_size=16,gutter=0)
        self.assertEqual((w,h),(32,16))
        for x in (0,14,15,16,30,31):
            self.assertEqual(ever[x*4:x*4+4],bytes((x,0,7,255)))
        _,_,r11 = decode(data)
        self.assertEqual(r11[:4],bytes((1,1,7,255)))
        self.assertEqual(r11[14*4:15*4],bytes((17,1,7,255)))


if __name__=='__main__':unittest.main()
