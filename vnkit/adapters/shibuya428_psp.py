"""428 ULJS-00219 v1.01 static recovery, deliberately not a playable adapter.

SNS 01.82 is not KID MAC/oscr or HuneX. Structural records and exact source
locations are retained; this module does not guess command execution semantics.
See docs/428-psp-investigation.md for native consumers and the runtime boundary.
"""
from collections import Counter
from dataclasses import asdict
import hashlib
from pathlib import Path
import struct

from ..cri_cpk import CpkArchive
from ..disc import FormatError, safe_name, write_bytes, write_json
from ..source import Source

ADAPTER_ID = '428-psp'
ADAPTER_VERSION = '0.1.0-recovery'
EDITION = 'Japanese PSP ULJS-00219 v1.01'
FINGERPRINTS = {
    'PSP_GAME/PARAM.SFO': 'a267123777e23637dab460e1ea1412d3364ae09bda2969aeb1bd1560e4d0bd3c',
    'PSP_GAME/SYSDIR/EBOOT.BIN': 'cf0fd29ef30406da247d6c368424124584cb9e39f3b7b4801417e059543a160b',
    'PSP_GAME/USRDIR/scriptdatafilechunk.cpk': 'd3782bdd6b23971348cc399e46387da9c654829a7e3b45254d6f76f0ad3f1ba1',
    'PSP_GAME/USRDIR/dummyforlayer.cpk': 'ad6860749da418e74ffed2e901d3dd01ed7433f3ab3635031c301b44640c7941',
}
SNS_KEY = b'CSD-CSCNV:01.82\0'
LIMITATION = ('Static recovery only: the SNS interpreter, cross-character flow, '
              'JUMP/KEEP OUT gates, persistent branch state and reader saves are not implemented.')


def identify(path):
    source = Source(path)
    if not all(name in source.entries for name in FINGERPRINTS):
        raise FormatError('428 PSP edition files are absent')
    for name, expected in FINGERPRINTS.items():
        if hashlib.sha256(source.read_at(name)).hexdigest() != expected:
            raise FormatError(f'unrecognised 428 PSP edition: {name}')
    return source


def detect(path):
    try:
        identify(path)
    except (ValueError, KeyError, FileNotFoundError):
        return {'supported': False, 'reason': 'Not the tested 428 PSP ULJS-00219 v1.01 edition'}
    return {'supported': True, 'playable': False, 'support_level': 'static-recovery',
            'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
            'title': '428 ～封鎖された渋谷で～', 'edition': EDITION,
            'platform': 'PSP', 'reason': LIMITATION}


def archives(source):
    return [CpkArchive(source, name) for name in source.entries
            if name.startswith('PSP_GAME/USRDIR/') and name.endswith('.cpk')]


def inventory(items):
    extensions = Counter(Path(member.name).suffix.lower()
                         for archive in items for member in archive.members)
    return {'container': 'CRI CPK / UTF / CRILAYLA', 'count': len(items),
            'members': sum(len(a.members) for a in items),
            'extracted_bytes': sum(m.extracted_size for a in items for m in a.members),
            'extensions': dict(sorted(extensions.items()))}


def inspect(path, fingerprint=False):
    source = identify(path)
    result = {'identification': detect(path), 'archives': inventory(archives(source))}
    if fingerprint:
        result['source'] = source.fingerprint()
    return result


def parse_script(data, script_id, name):
    """Token framing and label targets only; no opcode is thereby executable."""
    if len(data) < 0x436 or len(data) > 8 * 1024**2:
        raise FormatError('428 script size outside limit')
    if not 0 <= script_id < 255:
        raise FormatError('428 script index outside byte range')
    expected_name = data[:48].split(b'\0', 1)[0]
    if expected_name != name.encode('ascii'):
        raise FormatError('428 script name mismatch')
    content = struct.unpack_from('<I', data, 0x430)[0]
    if not 0x434 <= content <= len(data) - 2 or content % 4:
        raise FormatError('428 script content offset outside bounds')
    cursor, rows = content, []
    while cursor < len(data):
        at, code = cursor, data[cursor]
        cursor += 1
        row = {'offset': at, 'code': code, 'id': f'428:{script_id:02x}:{at:06x}'}
        if code == 0:
            if len(data) - at > 3 or any(data[at:]):
                raise FormatError(f'{row["id"]}: invalid script padding')
            break
        if code == 1:
            end = data.find(b'\x02', cursor)
            if end < 0:
                raise FormatError(f'{row["id"]}: unterminated text')
            raw = data[cursor:end]
            try:
                row['text'] = raw.decode('cp932', 'strict')
            except UnicodeError as error:
                raise FormatError(f'{row["id"]}: invalid CP932') from error
            row['raw_text'] = raw.hex()
            cursor = end + 1
        elif code in (0x1c, 0x1d):
            # Ruby delimiters have no length byte. The enclosed text records
            # remain distinct; never count the reading plus base as two lines.
            row['args'] = []
        else:
            if code == 2 or code > 0xc0 or cursor >= len(data):
                raise FormatError(f'{row["id"]}: unsupported/truncated token {code:#x}')
            length = data[cursor]
            cursor += 1
            if cursor + length > len(data):
                raise FormatError(f'{row["id"]}: token exceeds script')
            row['args'] = list(data[cursor:cursor + length])
            cursor += length
        row['next'] = cursor
        rows.append(row)
        if len(rows) > 500000:
            raise FormatError('428 script token limit exceeded')
    if not rows or rows[0]['code'] != 0xab or rows[-1]['code'] != 0xac:
        raise FormatError('428 script lacks begin/end framing')
    boundaries = {row['offset'] for row in rows}
    labels, visited, extents = {}, set(), []
    for bucket in range(256):
        cursor = struct.unpack_from('<I', data, 0x30 + 4 * bucket)[0]
        while cursor:
            if cursor in visited or cursor % 4 or not 0x434 <= cursor <= content - 9:
                raise FormatError('428 invalid/cyclic label chain')
            visited.add(cursor)
            if len(visited) > 100000:
                raise FormatError('428 label limit exceeded')
            stride, ordinal, relative = struct.unpack_from('<HHI', data, cursor)
            end = data.find(b'\0', cursor + 8, content)
            if end < 0:
                raise FormatError('428 unterminated label')
            try:
                label = data[cursor + 8:end].decode('ascii', 'strict')
            except UnicodeError as error:
                raise FormatError('428 non-ASCII label') from error
            if not label or label in labels or content + relative not in boundaries:
                raise FormatError('428 duplicate label or target outside token boundary')
            labels[label] = {'offset': content + relative, 'table_offset': cursor,
                             'native_index': ordinal, 'bucket': bucket}
            aligned_end = (end + 4) & ~3
            if aligned_end > content or any(data[end:aligned_end]):
                raise FormatError('428 label alignment/padding mismatch')
            extents.append((cursor, aligned_end))
            if stride and (stride % 4 or cursor + stride < aligned_end):
                raise FormatError('428 overlapping label chain')
            cursor = cursor + stride if stride else 0
    previous = 0x434
    for start, end in sorted(extents):
        if start != previous:
            raise FormatError('428 label table overlap or unexplained bytes')
        previous = end
    if previous != content:
        raise FormatError('428 unexplained label-table tail')
    for row in rows:
        if row['code'] in (0x52, 0x56, 0x59, 0x5a):
            args = bytes(row['args'])
            if len(args) < 3 or args[-1] != 0 or b'\0' in args[1:-1]:
                raise FormatError(f'{row["id"]}: invalid direct label operand')
            try:
                label = args[1:-1].decode('ascii', 'strict')
            except UnicodeError as error:
                raise FormatError(f'{row["id"]}: non-ASCII direct label') from error
            row['target'] = {'script': args[0], 'label': label}
            if row['code'] == 0x56:
                if args[0] != script_id or label not in labels or labels[label]['offset'] != row['next']:
                    raise FormatError(f'{row["id"]}: source label disagrees with native table')
    return {'name': name, 'index': script_id, 'size': len(data), 'content_offset': content,
            'sha256': hashlib.sha256(data).hexdigest(), 'labels': labels, 'tokens': rows}


def parse_sns(encoded):
    if not 0x108 <= len(encoded) <= 16 * 1024**2 or encoded[:16] != SNS_KEY:
        raise FormatError('unsupported 428 SNS signature/size')
    data = bytes((value - SNS_KEY[index % 16]) & 255 for index, value in enumerate(encoded))
    count = struct.unpack_from('<I', data, 0x100)[0]
    if not 0 < count < 255 or 0x104 + count * 8 > len(data):
        raise FormatError('428 SNS directory outside bounds')
    scripts, names, previous = [], set(), 0x104 + count * 8
    for index in range(count):
        offset, size = struct.unpack_from('<II', data, 0x104 + index * 8)
        if offset != previous or size < 0x436 or size % 4 or offset + size > len(data):
            raise FormatError('428 SNS overlapping/truncated script extent')
        raw_name = data[offset:offset + 48]
        if b'\0' not in raw_name:
            raise FormatError('428 unterminated script name')
        name = raw_name.split(b'\0', 1)[0].decode('ascii', 'strict')
        safe_name(name)
        if '/' in name or not name.endswith('.xml') or name.casefold() in names:
            raise FormatError('428 invalid or duplicate script name')
        names.add(name.casefold())
        script = parse_script(data[offset:offset + size], index, name)
        script['sns_offset'] = offset
        scripts.append(script)
        previous = offset + size
    missing, direct_count = [], 0
    for script in scripts:
        for row in script['tokens']:
            target = row.get('target')
            if not target:
                continue
            direct_count += 1
            if target['script'] >= count or target['label'] not in scripts[target['script']]['labels']:
                missing.append({'source': row['id'], 'target': target})
    counts = Counter(row['code'] for script in scripts for row in script['tokens'])
    text = [row['text'] for script in scripts for row in script['tokens'] if row['code'] == 1]
    summary = {'scripts': count, 'tokens': sum(counts.values()), 'token_kinds': len(counts),
               'text_fragments': len(text), 'labels': sum(len(s['labels']) for s in scripts),
               'private_use_characters': sum(0xe000 <= ord(c) <= 0xf8ff for t in text for c in t),
               'opcodes': {f'{code:02x}': n for code, n in sorted(counts.items())},
               'direct_label_operands_checked': direct_count, 'missing_direct_labels': missing,
               'uninterpreted_tail_bytes': len(data) - previous,
               'runtime_implemented': False}
    return data, scripts, summary


def recover(path, output, *, all_members=False):
    source = identify(path)
    items = archives(source)
    totals = inventory(items)
    if totals['members'] > 50000 or totals['extracted_bytes'] > 4 * 1024**3:
        raise FormatError('428 recovery exceeds member/size limit')
    scenario = next((a for a in items if a.name.endswith('/scriptdatafilechunk.cpk')), None)
    if scenario is None:
        raise FormatError('428 scenario archive missing')
    sns = [m for m in scenario.members if m.name == 'to.sns']
    flow = [m for m in scenario.members if m.name == 'to.flo']
    if len(sns) != 1 or len(flow) != 1:
        raise FormatError('428 scenario/flow members missing or ambiguous')
    encoded = scenario.read(sns[0])
    decoded, scripts, summary = parse_sns(encoded)
    output = Path(output)
    write_bytes(output, 'original/to.sns', encoded)
    write_bytes(output, 'original/to.flo', scenario.read(flow[0]))
    write_bytes(output, 'decoded/to.sns', decoded)
    for script in scripts:
        index, offset, size = script['index'], script['sns_offset'], script['size']
        write_bytes(output, f'scripts/{index:02d}.bin', decoded[offset:offset + size])
        write_json(output, f'scripts/{index:02d}.json', script)
    recovered, opaque = [], []
    if all_members:
        for archive in items:
            stem = Path(archive.name).stem
            for member in archive.members:
                # Ignore original directory/filename for output paths. The disc
                # includes ../ directory metadata and duplicate basenames.
                target = f'members/{stem}/{member.id:08x}.bin'
                if stem == 'dummyforlayer' and member.size != member.extracted_size:
                    # This exact archive's 129 compressed members have erased
                    # CRILAYLA signatures. Preserve stored bytes without repair.
                    data = b''.join(source.chunks(archive.name, member.offset, member.size))
                    if data[:8] != bytes(8):
                        raise FormatError('unrecognised 428 dummy archive member')
                    opaque.append(target)
                else:
                    data = archive.read(member)
                record = write_bytes(output, target, data)
                recovered.append({k: v for k, v in record.items() if k != 'status'})
    report = {'format_version': 1, 'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
              'edition': EDITION, 'platform': 'psp', 'status': 'blocked', 'playable': False,
              'support_level': 'static-recovery', 'reason': LIMITATION,
              'source': source.fingerprint(), 'inventory': totals, 'scenario': summary,
              'archive_index': [{'path': a.name, 'members': [asdict(m) for m in a.members]} for a in items],
              'recovered_members': recovered, 'opaque_stored_members': opaque}
    write_json(output, 'recovery.json', report)
    # A blocked research output deliberately has no content.json/library tile.
    return {'status': 'blocked', 'playable': False, 'reason': LIMITATION,
            'report': str(output / 'recovery.json'), 'inventory': report['inventory'],
            'opaque_stored_members': len(opaque), 'scenario': summary}


def extract(source, destination):
    return recover(source, destination, all_members=True)


def import_game(source, output):
    return recover(source, output)
