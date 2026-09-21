"""Original PS-ADPCM vectors: no game audio is included in public tests."""

import io
import struct
import unittest
import wave

from vnkit.adapters.pia_audio import AudioError, decode_vas, inspect_vas, resolve_voice


def mono(frames):
    source = bytearray(b'\x0c\0' + bytes(14)) * 128
    for index, frame in enumerate(frames):
        source[index * 16:(index + 1) * 16] = frame
    source[(len(frames) - 1) * 16 + 1] = 1
    source[len(frames) * 16 + 1] = 7
    return bytes(source)


def pcm(wav):
    with wave.open(io.BytesIO(wav)) as reader:
        return reader.getparams(), struct.unpack('<' + 'h' * (reader.getnframes() * reader.getnchannels()), reader.readframes(reader.getnframes()))


class PiaAudioTests(unittest.TestCase):
    def test_signed_low_nibble_first_and_terminal(self):
        wav, info = decode_vas(mono([b'\x0c\0' + b'\xf1' * 14]), 'NVAM.NFP')
        params, samples = pcm(wav)
        self.assertEqual(samples, (1, -1) * 14)
        self.assertEqual(params.nframes, 28)
        self.assertEqual(params.framerate, 44098)
        self.assertEqual(info['spu2_pitch'], 3763)
        self.assertEqual(info['native_sample_rate'], 44097.65625)

    def test_predictor_carries_history_between_frames(self):
        wav, _ = decode_vas(mono([b'\0\0' + b'\x77' * 14, b'\x1c\0' + bytes(14)]), 'NVAM.NFP')
        _, samples = pcm(wav)
        self.assertEqual(samples[:28], (28672,) * 28)
        self.assertEqual(samples[28:31], (26880, 25200, 23625))

    def test_stereo_sector_interleave_and_native_right_first_panning(self):
        source = bytearray()
        # First source sector is right; its partner is left.
        source.extend((b'\x0c\0' + b'\x11' * 14) * 128)
        source.extend((b'\x0c\0' + b'\x22' * 14) * 128)
        source.extend(mono([b'\x0c\0' + b'\x33' * 14]))
        source.extend(mono([b'\x0c\0' + b'\x44' * 14]))
        wav, _ = decode_vas(bytes(source), 'NVAS.NFP')
        params, samples = pcm(wav)
        self.assertEqual(params.nchannels, 2)
        self.assertEqual(samples[:4], (2, 1, 2, 1))
        self.assertEqual(samples[128 * 28 * 2:][:4], (4, 3, 4, 3))

    def test_rejects_unknown_configuration_and_malformed_frames(self):
        data = mono([b'\x0c\0' + bytes(14)])
        with self.assertRaisesRegex(AudioError, 'configuration'):
            inspect_vas(data, 'ANOTHER.NFP')
        for offset, value, message in [(0, 0x5C, 'header'), (1, 3, 'flags'), (17, 0, 'terminal'), (34, 1, 'after terminal')]:
            corrupt = bytearray(data)
            corrupt[offset] = value
            with self.subTest(offset=offset), self.assertRaisesRegex(AudioError, message):
                inspect_vas(bytes(corrupt), 'NVAM.NFP')
        with self.assertRaisesRegex(AudioError, 'sectors'):
            inspect_vas(data[:-1], 'NVAM.NFP')

    def test_voice_resolution_is_safe_and_preserves_source_alias(self):
        self.assertEqual(resolve_voice('09601'), '09601.VAS')
        self.assertEqual(resolve_voice('09598'), 'PIA3_1.VAS')
        with self.assertRaises(AudioError):
            resolve_voice('../09601')


if __name__ == '__main__':
    unittest.main()
