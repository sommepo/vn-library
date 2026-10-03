"""Bounded PSMF/MPEG-2 audio recovery for the observed PSP ATRAC3+ profile.

No decoder or third-party implementation is embedded. PES framing and OMA
metadata are container facts; see docs/428-psp-investigation.md for references.
Unknown streams, discontinuities and incomplete frames are rejected.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class PmfAudio:
    oma: bytes
    frames: int
    sample_rate: int
    channels: int
    audio_pts: int
    video_pts: int
    packets: int


def _pts(raw: bytes) -> int:
    if len(raw) != 5 or any(raw[i] & 1 != 1 for i in (0, 2, 4)):
        raise ValueError('Invalid PMF timestamp')
    return ((raw[0] & 14) << 29 | raw[1] << 22 | (raw[2] & 254) << 14 |
            raw[3] << 7 | raw[4] >> 1)


def recover_pmf_audio(data: bytes) -> PmfAudio | None:
    """Recover unmodified audio frames; None means explicitly video-only.

    PTS values retain the source 90 kHz clock. A caller must preserve their
    relative timing when decoding/muxing, rather than assume both streams start
    together. This bounded profile supports one 44.1 kHz mono/stereo stream.
    """
    if not isinstance(data, bytes) or not 2048 <= len(data) <= 128 * 1024 * 1024:
        raise ValueError('PMF input bound')
    if data[:8] != b'PSMF0015':
        raise ValueError('Unsupported PMF header')
    start, size = int.from_bytes(data[8:12], 'big'), int.from_bytes(data[12:16], 'big')
    count = int.from_bytes(data[128:130], 'big')
    if start != 2048 or size != len(data) - start or count not in (1, 2):
        raise ValueError('PMF stream extent or count')
    streams = [data[130 + n * 16:146 + n * 16] for n in range(count)]
    if streams[0][0] != 0xe0 or count == 2 and streams[1][:2] != b'\xbd\0':
        raise ValueError('Unsupported PMF stream profile')
    chunks, marks, video_pts = [], [], None
    cursor, audio_size = start, 0
    while cursor < len(data):
        if data[cursor:cursor + 3] != b'\0\0\1' or cursor + 4 > len(data):
            raise ValueError('PMF packet boundary')
        kind = data[cursor + 3]
        if kind == 0xba:
            if cursor + 14 > len(data) or data[cursor + 4] & 0xc4 != 0x44:
                raise ValueError('Unsupported PMF pack header')
            cursor += 14 + (data[cursor + 13] & 7)
            if cursor > len(data):
                raise ValueError('Truncated PMF pack')
            continue
        if kind == 0xb9:
            if cursor + 4 != len(data):
                raise ValueError('PMF trailing data')
            break
        if kind not in (0xbb, 0xbd, 0xbe, 0xbf, 0xe0) or cursor + 6 > len(data):
            raise ValueError('Unsupported PMF packet')
        end = cursor + 6 + int.from_bytes(data[cursor + 4:cursor + 6], 'big')
        if end > len(data):
            raise ValueError('Truncated PMF packet')
        if kind in (0xbd, 0xe0):
            if cursor + 9 > end or data[cursor + 6] & 0xc0 != 0x80:
                raise ValueError('Unsupported PMF PES header')
            payload = cursor + 9 + data[cursor + 8]
            if payload > end:
                raise ValueError('PMF PES extent')
            timestamp = None
            if data[cursor + 7] & 0x80:
                if data[cursor + 8] < 5:
                    raise ValueError('Truncated PMF timestamp')
                timestamp = _pts(data[cursor + 9:cursor + 14])
            if kind == 0xe0 and video_pts is None:
                video_pts = timestamp
            if kind == 0xbd:
                if count != 2 or payload + 4 > end or data[payload:payload + 2] != b'\0\0':
                    raise ValueError('Unsupported PMF audio channel')
                offset = int.from_bytes(data[payload + 2:payload + 4], 'big')
                if timestamp is not None:
                    marks.append((audio_size + offset, timestamp))
                chunk = data[payload + 4:end]
                chunks.append(chunk)
                audio_size += len(chunk)
        cursor = end
    if count == 1:
        return None
    raw = b''.join(chunks)
    if len(raw) < 8 or not marks or marks[0][0] != 0 or video_pts is None:
        raise ValueError('Missing PMF audio or source clock')
    parameters = int.from_bytes(raw[2:4], 'big')
    channels = parameters >> 10 & 7
    if parameters >> 13 != 1 or channels not in (1, 2):
        raise ValueError('Unsupported PMF ATRAC profile')
    frame_size = (parameters & 1023) * 8 + 16
    if frame_size < 24 or len(raw) % frame_size:
        raise ValueError('Incomplete PMF audio frame')
    header = b'\x0f\xd0' + raw[2:4] + bytes(4)
    frames = []
    for at in range(0, len(raw), frame_size):
        if raw[at:at + 8] != header:
            raise ValueError('PMF audio frame discontinuity')
        frames.append(raw[at + 8:at + frame_size])
    for at, timestamp in marks:
        expected = marks[0][1] + (at // frame_size) * 2048 * 90000 / 44100
        if at % frame_size or at >= len(raw) or abs(timestamp - expected) > 1:
            raise ValueError('PMF audio clock discontinuity')
    oma = bytearray(96)
    oma[:8] = b'EA3\1\0\x60\xff\xff'
    oma[32:36] = bytes((1, 0)) + raw[2:4]
    return PmfAudio(bytes(oma) + b''.join(frames), len(frames), 44100,
                    channels, marks[0][1], video_pts, len(chunks))
