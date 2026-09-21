"""Original silent PSS packet fixtures for bounded demux validation."""
import struct
import unittest
from vnkit.adapters.pia_movie import MovieError, demux_pss


def pes(kind,payload,pts=b'\x21\0\x01\0\x01'):
    body=b'\x80\x80\x05'+pts+payload
    return b'\0\0\1'+bytes([kind])+struct.pack('>H',len(body))+body


def movie():
    audio=b'SShd'+struct.pack('<7I',24,1,48000,2,512,0xffffffff,0xffffffff)+b'SSbd'+struct.pack('<I',1024)+bytes(1024)
    data=pes(0xe0,b'original test video marker')+pes(0xbd,b'\xff\xa0\0\0'+audio)+b'\0\0\1\xb9'
    return audio,data


class MovieTests(unittest.TestCase):
    def test_exact_private_pcm_and_matching_pts(self):
        audio,data=movie();actual,info=demux_pss(data)
        self.assertEqual(actual,audio)
        self.assertEqual(info['audio_body_bytes'],1024)
        self.assertEqual(info['duration_audio'],1024/192000)
        self.assertEqual(info['first_audio_video_pts'],0)

    def test_rejects_truncation_unknown_private_stream_and_extra_payload(self):
        _,data=movie()
        for value in (data[:-1],data.replace(b'\xff\xa0\0\0',b'\xff\xa1\0\0'),data+b'X',data.replace(b'SSbd',b'NOPE')):
            with self.assertRaises(MovieError):demux_pss(value)

    def test_mismatched_timestamps_are_not_silently_aligned(self):
        audio,_=movie()
        data=pes(0xe0,b'video')+pes(0xbd,b'\xff\xa0\0\0'+audio,b'\x21\0\x01\0\x03')+b'\0\0\1\xb9'
        with self.assertRaisesRegex(MovieError,'PTS differ'):demux_pss(data)


if __name__=='__main__':unittest.main()
