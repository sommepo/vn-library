"""Original tiny Sony-sequence fixtures; no game music or instrument samples."""
import struct
import unittest
from vnkit.adapters.pia_music import MusicError, inspect_sq, midi_events


def sequence(body):
    data=bytearray(74)
    for p,s in ((0,b'IECSsreV'),(16,b'IECSuqeS'),(48,b'IECSidiM')):data[p:p+8]=s
    struct.pack_into('<I',data,64,20);struct.pack_into('<IH',data,68,6,480)
    return bytes(data)+body


class MusicTests(unittest.TestCase):
    def test_compressed_controller_timing_and_sustain(self):
        # High data bit omits the following delta, not part of its value.
        source=sequence(bytes.fromhex('00ff510307a12000b06380060000b0407f8360630100060000260000ff2f0000'))
        info=inspect_sq(source)
        self.assertEqual(info['ppqn'],480)
        self.assertEqual(info['loop_start'],0)
        self.assertEqual(info['loop_end'],0.5)
        self.assertEqual(info['controller_counts'][64],1)
        self.assertEqual([e['value'] for e in info['source_events'] if e['controller']==64],[127])

    def test_unknown_controller_and_bad_tail_fail(self):
        body=bytes.fromhex('00b0630000060000b0630100060000260000ff2f00')
        for value in (sequence(body)+b'x',sequence(body.replace(bytes.fromhex('b063'),bytes.fromhex('b065'),1)),sequence(body[:-3])):
            with self.assertRaises(MusicError):inspect_sq(value)

    def test_running_midi_status_and_tempo(self):
        track=bytes.fromhex('00ff510307a12000903c6483603c0000ff2f00')
        midi=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track
        ppqn,events=midi_events(midi)
        self.assertEqual(ppqn,480)
        self.assertEqual(events[-1][0],480)
        self.assertEqual(events[-1][2:],(0x90,[60,0]))
        with self.assertRaises(MusicError):midi_events(midi[:-1])


if __name__=='__main__':unittest.main()
