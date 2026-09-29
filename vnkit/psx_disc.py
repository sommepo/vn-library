"""Read-only single-track Mode 2 CUE/BIN inspection.

ISO files/directories must occupy Form 1 sectors. XA Form 2 payloads are exposed
separately and never silently truncated into a cooked ISO. No disc code is run.
"""
from pathlib import Path
import os
import re
import stat

from .disc import FormatError, IsoImage, dual32, safe_name

RAW_SECTOR = 2352
SYNC = b'\0' + b'\xff' * 10 + b'\0'


class _LogicalView:
    def __init__(self, image):
        self.image, self.position = image, 0

    def seek(self, position):
        self.image._bounds(position, 0)
        self.position = position

    def read(self, size):
        data = self.image.read_at(self.position, size)
        self.position += len(data)
        return data


class Mode2Image(IsoImage):
    def __init__(self, cue):
        self.cue = Path(cue)
        if self.cue.is_symlink() or not self.cue.is_file() or self.cue.stat().st_size > 65536:
            raise FormatError('expected a bounded regular CUE sheet')
        text = self.cue.read_text(encoding='utf-8-sig')
        lines = [line.strip() for line in text.splitlines()
                 if line.strip() and not line.strip().startswith('REM ')]
        if len(lines) != 3 or lines[1:] != ['TRACK 01 MODE2/2352', 'INDEX 01 00:00:00']:
            raise FormatError('expected one MODE2/2352 track at INDEX 01 00:00:00')
        match = re.fullmatch(r'FILE "([^"]+)" BINARY', lines[0])
        if not match:
            raise FormatError('unsupported CUE FILE directive')
        name = safe_name(match[1])
        if '/' in name:
            raise FormatError('CUE BIN must be a sibling file')
        self.path = self.cue.parent / name
        if self.path.is_symlink() or not self.path.is_file():
            raise FormatError('CUE BIN must be a regular sibling file')
        self.raw_size = self.path.stat().st_size
        info = self.path.stat()
        self._identity = (info.st_dev, info.st_ino)
        if not 0 < self.raw_size <= 1024**3 or self.raw_size % RAW_SECTOR:
            raise FormatError('CUE BIN size is not a bounded whole-sector image')
        self.sector_count = self.raw_size // RAW_SECTOR
        self.size = self.sector_count * 2048
        self.entries, self._paths, self._visited = [], set(), set()
        self.volume_descriptors = []
        primary = None
        terminated = False
        for sector in range(16, min(256, self.sector_count)):
            record = self.read_at(sector * 2048, 2048)
            if record[1:7] != b'CD001\1':
                raise FormatError('invalid Mode 2 ISO9660 descriptor')
            self.volume_descriptors.append({'sector': sector, 'type': record[0], 'identifier': 'CD001'})
            if record[0] == 1:
                if primary is not None:
                    raise FormatError('duplicate primary volume descriptor')
                primary = record
            if record[0] == 255:
                terminated = True
                break
        if primary is None or not terminated:
            raise FormatError('incomplete Mode 2 ISO9660 descriptors')
        self.system_id = primary[8:40].decode('ascii').rstrip()
        self.volume_id = primary[40:72].decode('ascii').rstrip()
        self.volume_blocks = dual32(primary, 80)
        if not 16 < self.volume_blocks <= self.sector_count:
            raise FormatError('Mode 2 ISO volume is out of bounds')
        if primary[128:132] != b'\0\x08\x08\0':
            raise FormatError('unsupported Mode 2 ISO logical sector size')
        root = primary[156:190]
        self._walk(_LogicalView(self), dual32(root, 2) * 2048, dual32(root, 10), '', 0)

    def raw_sectors(self, lba, count):
        if lba < 0 or count < 0 or lba + count > self.sector_count:
            raise FormatError('Mode 2 raw extent out of bounds')
        with os.fdopen(os.open(self.path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)), 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or (info.st_dev, info.st_ino) != self._identity or info.st_size != self.raw_size:
                raise FormatError('Mode 2 source size changed')
            stream.seek(lba * RAW_SECTOR)
            for index in range(lba, lba + count):
                sector = stream.read(RAW_SECTOR)
                if len(sector) != RAW_SECTOR or sector[:12] != SYNC or sector[15] != 2:
                    raise FormatError(f'invalid Mode 2 sector at LBA {index}')
                if sector[16:20] != sector[20:24]:
                    raise FormatError(f'conflicting XA subheaders at LBA {index}')
                yield sector

    def read_at(self, offset, size):
        self._bounds(offset, size)
        if size > 64 * 1024**2:
            raise FormatError('Mode 2 in-memory read exceeds 64 MiB')
        if not size:
            return b''
        lba, skip = divmod(offset, 2048)
        output = bytearray()
        for index, sector in enumerate(self.raw_sectors(lba, (skip + size + 2047) // 2048)):
            if sector[18] & 0x20:
                raise FormatError(f'XA Form 2 cannot be read as ISO data at LBA {lba + index}')
            count = min(size - len(output), 2048 - skip)
            output.extend(sector[24 + skip:24 + skip + count])
            skip = 0
        return bytes(output)

    def chunks(self, entry):
        self._bounds(entry.offset, entry.size)
        for offset in range(0, entry.size, 1024**2):
            yield self.read_at(entry.offset + offset, min(1024**2, entry.size - offset))

    def inspect(self, fingerprint=False):
        result = super().inspect(fingerprint)
        result.update(format='CUE MODE2/2352 ISO9660', raw_sector_size=RAW_SECTOR,
                      raw_size=self.raw_size, integrity='sector headers; EDC/ECC not checked')
        return result
