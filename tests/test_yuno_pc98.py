"""Original synthetic containers only; no commercial scripts or archive bytes."""
import hashlib
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
from vnkit.adapters.yuno_pc98_archive import entries, expand_mes
from vnkit.cd_media import CueMedia, cue_tracks, SYNC, SECTOR
from vnkit.disc import FormatError


def volume(files):
    table = bytearray()
    payload = bytearray()
    for name, data in files:
        table += name.encode().ljust(14, b'\0') + struct.pack('<IH', len(payload), len(data))
        payload += data
    encrypted = bytearray()
    for i, value in enumerate(table):
        value ^= (0x55 + i) & 255
        encrypted.append(((value << 1) | (value >> 7)) & 255)
    return struct.pack('<HBB', len(files), 1, 0x55) + encrypted + payload


def bits(value):
    return int(value.ljust((len(value) + 7) // 8 * 8, '0'), 2).to_bytes((len(value) + 7) // 8, 'big')


class RecoveryTests(unittest.TestCase):
    def test_encrypted_directory_and_extents(self):
        raw = volume([('TEST.MES', b'one'), ('IMAGE.GP4', b'two')])
        found = entries(raw)
        self.assertEqual([(e.name, raw[e.offset:e.offset + e.size]) for e in found], [('TEST.MES', b'one'), ('IMAGE.GP4', b'two')])
        for bad in (raw[:-1], raw + b'extra', volume([('../A.MES', b'a')]), volume([('A.MES', b'a'), ('A.MES', b'b')])):
            with self.assertRaises((FormatError, UnicodeError)):
                entries(bad)

    def test_literals_overlapping_ring_and_stop(self):
        data = bits('1' + f'{65:08b}' + '0' + f'{1:012b}' + f'{3:04b}' + '0' + '0' * 12)
        self.assertEqual(expand_mes(data), b'A' * 6)
        for bad in (b'', b'\x80', bits('0' + f'{9:012b}' + '0000'), data + b'\1'):
            with self.assertRaises(FormatError):
                expand_mes(bad)

    def test_cue_paths_indices_and_normalization(self):
        cue = 'FILE "data.bin" BINARY\n TRACK 01 MODE1/2352\n INDEX 01 00:00:00\nFILE "audio.bin" BINARY\n TRACK 02 AUDIO\n INDEX 00 00:00:00\n INDEX 01 00:00:01\n'
        data = SYNC + b'\0\0\0\1' + b'A' * 2048 + bytes(SECTOR - 2064)
        audio = b'P' * SECTOR + b'M' * SECTOR
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with zipfile.ZipFile(folder / 'media.zip', 'w') as archive:
                archive.writestr('disc.cue', cue)
                archive.writestr('data.bin', data)
                archive.writestr('audio.bin', audio)
            with CueMedia(folder / 'media.zip') as source:
                first = source.normalize(folder / 'out')
            self.assertEqual((folder / 'out/data.iso').read_bytes(), b'A' * 2048)
            self.assertEqual((folder / 'out/cdda/track-02.wav').read_bytes()[44:], b'M' * SECTOR)
            self.assertEqual(first['tracks'][1]['sha256'], hashlib.sha256(audio).hexdigest())
            with CueMedia(folder / 'media.zip') as source:
                self.assertEqual(source.normalize(folder / 'out'), first)
            (folder / 'out/data.iso').write_bytes(b'user data')
            with CueMedia(folder / 'media.zip') as source, self.assertRaises((ValueError, FileExistsError)):
                source.normalize(folder / 'out')
        for bad in (cue.replace('data.bin','../data.bin'), cue.replace('00:00:01','00:60:00'), cue.replace('TRACK 02','TRACK 03')):
            with self.assertRaises(FormatError):
                cue_tracks(bad, {'data.bin':SECTOR,'audio.bin':2*SECTOR})

    def test_unsafe_zip_fails_before_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'bad.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('../escape.cue', b'')
            with self.assertRaises(FormatError):
                CueMedia(path)

    def test_exepack_literal_fill_and_rejection(self):
        spec = importlib.util.spec_from_file_location('exepack', Path(__file__).resolve().parents[1] / 'scripts/inspect-dos-exepack.py')
        module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        header = bytearray(32);header[:2] = b'MZ';struct.pack_into('<H', header, 8, 2);struct.pack_into('<HH', header, 20, 16, 1)
        # 12 unchanged bytes followed by a backward fill of 20 bytes.
        packed = b'HELLO WORLD!' + b'Z' + struct.pack('<H',20) + b'\xb1'
        stub = bytearray(0x132);struct.pack_into('<H', stub, 12, 2);stub[14:16] = b'RB'
        data, report = module.expand(bytes(header) + packed + stub)
        self.assertEqual(data, b'HELLO WORLD!' + b'Z' * 20)
        self.assertEqual(report['unchanged_prefix'],12)
        with self.assertRaises(FormatError):
            module.expand(bytes(header) + packed[:15] + b'\x33' + stub)
