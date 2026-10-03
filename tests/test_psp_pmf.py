"""Synthetic MPEG packet/frame fixtures, containing no game or codec data."""
import unittest

from vnkit.psp_pmf import recover_pmf_audio


def timestamp(value):
    return bytes((0x21 | ((value >> 29) & 14), (value >> 22) & 255,
                  ((value >> 14) & 254) | 1, (value >> 7) & 255,
                  ((value << 1) & 254) | 1))


def packet(kind, payload, pts=None):
    header = bytes((0x80, 0x80 if pts is not None else 0, 5 if pts is not None else 0))
    body = header + (timestamp(pts) if pts is not None else b'') + payload
    return b'\0\0\1' + bytes((kind,)) + len(body).to_bytes(2, 'big') + body


def movie(packets, audio=True):
    header = bytearray(2048)
    header[:8] = b'PSMF0015'
    header[8:12] = (2048).to_bytes(4, 'big')
    header[12:16] = len(packets).to_bytes(4, 'big')
    header[128:130] = (2 if audio else 1).to_bytes(2, 'big')
    header[130] = 0xe0
    if audio:
        header[146] = 0xbd
    return bytes(header) + packets


FRAME = b'\x0f\xd0\x28\x01' + bytes(4) + bytes(range(16))
VIDEO = packet(0xe0, b'video', 90000)


class PmfTests(unittest.TestCase):
    def test_split_frames_retain_original_payload_and_clock(self):
        raw = FRAME * 3
        packets = VIDEO + packet(0xbd, bytes(4) + raw[:30], 85069)
        packets += packet(0xbd, b'\0\0\0\x12' + raw[30:], 93428)
        recovered = recover_pmf_audio(movie(packets))
        self.assertEqual((recovered.frames, recovered.sample_rate, recovered.channels), (3, 44100, 2))
        self.assertEqual((recovered.audio_pts, recovered.video_pts, recovered.packets), (85069, 90000, 2))
        self.assertEqual(recovered.oma[:8], b'EA3\1\0\x60\xff\xff')
        self.assertEqual(recovered.oma[32:36], b'\1\0\x28\1')
        self.assertEqual(recovered.oma[96:], bytes(range(16)) * 3)

    def test_explicit_video_only_and_missing_audio_differ(self):
        self.assertIsNone(recover_pmf_audio(movie(VIDEO, audio=False)))
        with self.assertRaisesRegex(ValueError, 'Missing'):
            recover_pmf_audio(movie(VIDEO))
        with self.assertRaisesRegex(ValueError, 'channel'):
            recover_pmf_audio(movie(VIDEO + packet(0xbd, bytes(4) + FRAME, 85069), audio=False))

    def test_invalid_frame_channel_and_timing_fail(self):
        variants = [
            packet(0xbd, bytes(4) + FRAME[:-1], 85069),
            packet(0xbd, bytes(4) + FRAME + b'badframe' + FRAME[8:], 85069),
            packet(0xbd, b'\1\0\0\0' + FRAME, 85069),
            packet(0xbd, bytes(4) + FRAME, 85069) + packet(0xbd, bytes(4) + FRAME, 95000),
            packet(0xbd, bytes(4) + FRAME, 85069) + packet(0xbd, b'\0\0\0\1' + FRAME, 89249),
        ]
        for payload in variants:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                recover_pmf_audio(movie(VIDEO + payload))

    def test_truncation_extent_and_timestamp_markers_fail(self):
        source = movie(VIDEO + packet(0xbd, bytes(4) + FRAME, 85069))
        variants = [source[:-1], source + b'\0', source[:2048], movie(b'\0\0\1\xbd\0\xff')]
        broken = bytearray(source)
        broken[2048 + 9] &= 0xfe
        variants.append(bytes(broken))
        for payload in variants:
            with self.subTest(size=len(payload)), self.assertRaises(ValueError):
                recover_pmf_audio(payload)


if __name__ == '__main__':
    unittest.main()
