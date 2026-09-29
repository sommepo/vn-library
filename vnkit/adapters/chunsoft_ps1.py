"""Bounded resource containers for the two inspected PS1 sound novels.

These are recovery helpers, not a shared story VM. IKE is independently derived
from SLPS-017.94's decoder at 0x800356c8; see the investigation for evidence.
"""
from dataclasses import dataclass
from dataclasses import asdict
import hashlib
from pathlib import Path
import struct

from ..disc import FormatError, sha256_file, write_bytes, write_json
from ..psx_disc import Mode2Image

LIMITATION = ('Resource recovery only. Use the ordinary local import command for the '
              'experimental reader; recovery alone is not a playable library entry.')


def identify(path, executable, digest, cnf_digest):
    disc = Mode2Image(path)
    exe = disc.read(executable, limit=1024**2)
    if (hashlib.sha256(exe).hexdigest() != digest or
            hashlib.sha256(disc.read('SYSTEM.CNF')).hexdigest() != cnf_digest):
        raise FormatError('Not the inspected PS1 sound novel executable/boot configuration')
    return disc, exe


def detection(path, module):
    try:
        module.identify(path)
    except (OSError, ValueError):
        return {'supported': False, 'reason': f'Not the inspected {module.EDITION}'}
    return {'supported': True, 'playable': True, 'support_level': 'experimental-reader',
            'adapter': module.ADAPTER_ID, 'adapter_version': module.ADAPTER_VERSION,
            'platform': 'PS1', 'title': module.TITLE, 'edition': module.EDITION,
            'reason': 'Source-driven full-scene reader; native presentation and auxiliary menus remain incomplete.'}


def source_fingerprint(disc):
    return {'type': 'cue-bin', 'raw_size': disc.raw_size,
            'bin_sha256': sha256_file(disc.path), 'cue_sha256': sha256_file(disc.cue)}


def record_file(out, name, data):
    return {k: v for k, v in write_bytes(out, name, data).items() if k != 'status'}


def finish_recovery(out, module, disc, files, **extra):
    report = {'adapter': module.ADAPTER_ID, 'adapter_version': module.ADAPTER_VERSION,
              'edition': module.EDITION, 'platform': 'ps1', 'playable': False,
              'status': 'blocked', 'support_level': 'resource-recovery',
              'reason': LIMITATION, 'source': source_fingerprint(disc),
              'disc_entries': [asdict(e) for e in disc.entries], 'files': files, **extra}
    write_json(out, 'recovery.json', report)
    return {'status': 'blocked', 'playable': False, 'reason': LIMITATION,
            'files': len(files), 'report': str(Path(out) / 'recovery.json'),
            'summary': extra.get('summary', {})}


@dataclass(frozen=True)
class Member:
    id: int
    offset: int
    size: int


def pac_index(header, size):
    """Kamaitachi LE16 (resource ID, sector) pairs plus an FFFF end marker."""
    if size < 2048 or size % 2048 or len(header) < 4:
        raise FormatError('PAC has invalid sector extent')
    pairs, seen = [], set()
    for at in range(0, min(len(header), 8192) - 3, 4):
        resource, sector = struct.unpack_from('<HH', header, at)
        offset = sector * 2048
        if not 0 < offset <= size or (pairs and offset <= pairs[-1][1]):
            raise FormatError('PAC has invalid/non-increasing member offset')
        if resource == 0xffff:
            first = pairs[0][1] if pairs else offset
            if offset != size or at + 4 > first or len(header) < first:
                raise FormatError('PAC table/end marker extent mismatch')
            if any(header[at + 4:first]):
                raise FormatError('PAC has unexplained table padding')
            all_pairs = pairs + [(resource, offset)]
            return [Member(id, start, all_pairs[i + 1][1] - start)
                    for i, (id, start) in enumerate(pairs)]
        if resource in seen:
            raise FormatError('PAC has duplicate member ID')
        seen.add(resource)
        pairs.append((resource, offset))
        if at + 4 >= pairs[0][1]:
            break
    raise FormatError('PAC end marker missing')


def unpack_ike(data, limit=1024**2):
    """Return (decoded, consumed bytes); preserve sector padding separately.

    Native control words are LE16, LSB first, eagerly refilled after bit 16
    (before the next literal/offset byte). References overlap the output.
    A short -1 reference has a separate continue/end bit. Byte 5 extends the
    stored length. Byte 10 extends the decoded length in units of 0x4000;
    its two low bits are reserved. Both size forms have native decoder evidence.
    Bytes 8..9 are uninterpreted and retained with the original stream.
    """
    if len(data) < 15 or data[2:5] != b'ike':
        raise FormatError('IKE signature/header missing')
    if data[10] & 3:
        raise FormatError('unverified IKE decoded-size flag bits')
    expected = (data[10] << 14) | int.from_bytes(data[11:13], 'little')
    stored = 13 + ((data[5] << 16) | int.from_bytes(data[6:8], 'little'))
    if not 0 < expected <= limit:
        raise FormatError('IKE decoded size outside limit')
    if not 15 <= stored <= len(data):
        raise FormatError('IKE stored size outside input')
    at = 13

    def take(n):
        nonlocal at
        if at + n > stored:
            raise FormatError('truncated IKE stream')
        value = int.from_bytes(data[at:at + n], 'little')
        at += n
        return value

    flags, mask = take(2), 1

    def bit():
        nonlocal flags, mask
        result = bool(flags & mask)
        mask <<= 1
        if mask == 0x10000:
            flags, mask = take(2), 1
        return result

    out = bytearray()
    # Input size also bounds no-output continuation tokens.
    for _ in range(stored * 8):
        if bit():
            if len(out) >= expected:
                raise FormatError('IKE output exceeds declared size')
            out.append(take(1))
            continue
        long = bit()
        distance = take(1) - 256
        if not long:
            if not bit():
                if distance == -1:
                    if bit():
                        continue
                    if len(out) != expected or at != stored:
                        raise FormatError(f'IKE end/size mismatch: output {len(out)}/{expected}, input {at}/{stored}')
                    return bytes(out), at
            else:
                distance -= 256
                if not bit():
                    distance -= 1024
                if not bit():
                    distance -= 512
                if not bit():
                    distance -= 256
            length = 2
        else:
            high = 0 if bit() else 256
            if not bit():
                distance -= 512
                if not bit():
                    high = high * 2 + (0 if bit() else 256)
                    distance -= 512
                    if not bit():
                        high = high * 2 + (0 if bit() else 256)
                        distance -= 1024
                        if not bit():
                            distance -= 2048
                            high = high * 2 + (0 if bit() else 256)
            distance -= high
            if bit():
                length = 3
            elif bit():
                length = 4
            elif bit():
                length = 5
            elif bit():
                length = 6
            elif bit():
                length = 8 if bit() else 7
            elif bit():
                length = take(1) + 17
            else:
                length = (13 if bit() else 9) + (2 if bit() else 0) + (1 if bit() else 0)
        if len(out) + distance < 0:
            raise FormatError('IKE reference precedes output')
        if len(out) + length > expected:
            raise FormatError('IKE reference exceeds declared size')
        for _ in range(length):
            out.append(out[len(out) + distance])
    raise FormatError('IKE token limit exceeded')
