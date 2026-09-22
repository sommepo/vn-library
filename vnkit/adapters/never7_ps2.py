"""Bounded static recovery of Never7 SLPS-25256 v1.01.

The executable reader import is in never7_import.py; this module preserves the
disc investigation stage separately from story execution.

The executable/overlay symbols are input data, never executed or bundled.
CPS decoding below is an original implementation checked against this disc's
get_cps_bin_size/cps2bin routines. See docs/never7-investigation.md.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.parse import quote

from .. import __version__
from ..disc import FormatError, safe_name, write_bytes, write_json
from ..elf import Elf32
from ..png import encode
from ..source import Source
from ..sony_sequence import inspect_sq

ADAPTER_ID = 'never7-ps2'
ADAPTER_VERSION = '0.4.0-recovery'
EXE = 'SLPS_252.56'
EXE_SHA256 = 'f7cde3fe47e6996682e6f10aeb701d4053779765ea4d7bd7d91630a742ba118e'
OVERLAYS = tuple(f'OLM/O{i:X}.' for i in range(14))


def detect(source):
    s = Source(source)
    if EXE not in s.entries or 'SYSTEM.CNF' not in s.entries:
        return {'supported': False, 'reason': 'Never7 SLPS-25256 not detected'}
    cnf = s.read_at('SYSTEM.CNF').decode('ascii', errors='strict')
    digest = hashlib.sha256(s.read_at(EXE)).hexdigest()
    matched = (EXE in cnf and re.search(r'VER\s*=\s*1\.01\b', cnf)
               and digest == EXE_SHA256 and all(n in s.entries for n in OVERLAYS))
    return {'supported': bool(matched), 'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
            'title': 'Never7 -the end of infinity-', 'platform': 'PlayStation 2',
            'edition': 'Japanese SLPS-25256', 'version': '1.01',
            'engine': 'KID PS2 oscr/MWo3; not Remember11 MAC-compatible',
            'confidence': 'high: boot serial/version, executable hash and overlay signatures',
            'capability': 'source-script reader with incomplete presentation', 'playable': bool(matched),
            'executable_sha256': digest, 'system_cnf': cnf,
            'reason': ('Tested edition; source-script reader available' if matched
                       else 'Untested executable/version or missing overlays')}


def portable_path(name):
    """Private extraction names: retain source identity, avoid Win32 trailing dots.

    Percent signs are escaped first, so an original %2E cannot collide with a dot.
    This changes cache paths only, never ISO lookup names or runtime source IDs.
    """
    parts = safe_name(name).split('/')
    return '/'.join(quote(p.rstrip('.'), safe='-_.') + '%2E' * (len(p)-len(p.rstrip('.'))) for p in parts)


def recovered_overlay(root, number):
    name = f'OLM/O{number:X}.'
    portable = Path(root)/'raw'/portable_path(name)
    # Existing Linux investigations used the original trailing-dot name.
    return portable if portable.is_file() else Path(root)/'raw'/name


def cps(data, offset=0, limit=16*1024*1024):
    """Return (decoded bytes, consumed input bytes), preserving following members.

    Three-byte BE output length; literal runs or overlapping 10-bit-distance
    copies. Native evidence: cps2bin 0x1b97a0, get_cps_bin_size 0x1b9750.
    Unlike the native routine, malformed reads/copies fail with bounded errors.
    """
    start = offset
    if offset < 0 or offset+3 > len(data):
        raise FormatError('CPS: missing length')
    size = int.from_bytes(data[offset:offset+3], 'big')
    if not 0 < size <= limit:
        raise FormatError('CPS: output length outside bounds')
    offset += 3
    out = bytearray()
    while len(out) < size:
        if offset >= len(data):
            raise FormatError('CPS: truncated token')
        token = data[offset]; offset += 1
        if token < 128:
            count = token+1
            if offset+count > len(data) or len(out)+count > size:
                raise FormatError('CPS: literal exceeds input/output bounds')
            out.extend(data[offset:offset+count]); offset += count
        else:
            if offset >= len(data):
                raise FormatError('CPS: truncated copy')
            distance = 1 + (token & 3)*256 + data[offset]; offset += 1
            count = ((token & 124) >> 2)+3
            if distance > len(out) or len(out)+count > size:
                raise FormatError('CPS: copy exceeds input/output bounds')
            for _ in range(count):
                out.append(out[-distance])
    return bytes(out), offset-start


def ogdt_png(data):
    """Measured RGB24 / indexed-8 OGDT variants; native LoadOGDImage_exe.

    No scaling. Reject other formats instead of guessing pixel storage.
    PS2 CLUT bit 3/4 permutation is shared with the existing reader's tooling.
    """
    if len(data) < 32 or data[:4] != b'ogdt':
        raise FormatError('OGDT: missing header')
    fmt, tw, th, cols, rows = struct.unpack_from('<IHHHH', data, 4)
    if fmt not in (1, 0x13) or not 0 < tw*th*cols*rows <= 4096*4096:
        raise FormatError(f'OGDT: unsupported format/dimensions {fmt:#x}')
    w, h = tw*cols, th*rows
    if w > 4096 or h > 4096:
        raise FormatError('OGDT: dimensions exceed bound')
    pixels_end = 32+w*h*(3 if fmt == 1 else 1)
    if len(data) != pixels_end+(16+1024 if fmt == 0x13 else 0):
        raise FormatError('OGDT: unverified pixel/palette extent')
    palette = data[pixels_end+16:]
    rgba = bytearray(w*h*4)
    for tile in range(cols*rows):
        x0, y0 = (tile % cols)*tw, (tile // cols)*th
        for y in range(th):
            for x in range(tw):
                pixel = tile*tw*th+y*tw+x
                if fmt == 1:
                    colour = data[32+pixel*3:35+pixel*3]+b'\x80'
                else:
                    index = data[32+pixel]
                    index = (index & ~24) | ((index & 8) << 1) | ((index & 16) >> 1)
                    colour = palette[index*4:index*4+4]
                at = ((y0+y)*w+x0+x)*4
                rgba[at:at+4] = colour[:3]+bytes([min(255, colour[3]*255//128)])
    return w, h, encode(w, h, rgba)


def probe_sq(data):
    """Inspect MIDI events separately from Never7's different Song directory.

    This does not assert that Song selection or the separate Sesq format works.
    Preserve the directory verbatim for subsequent native-engine investigation.
    """
    try:
        return {'unchanged_parser': True, 'sequence': inspect_sq(data, require_loop=False)}
    except ValueError as error:
        original_error = str(error)
    if len(data) < 80 or data[48:56] != b'IECSidiM':
        raise FormatError(original_error)
    song_at = struct.unpack_from('<I', data, 32)[0]
    if song_at+48 != len(data) or data[song_at:song_at+8] != b'IECSgnoS' or struct.unpack_from('<I', data, song_at+8)[0] != 48:
        raise FormatError('Unverified Never7 SQ Song metadata extent')
    offsets = list(struct.unpack_from('<2I', data, 64))
    if offsets[0] != 24 or not 72 < 48+offsets[1] < song_at:
        raise FormatError('Unverified Never7 SQ sequence directory')
    # Two simultaneous-looking streams, not padding. Parse both with the proven
    # event decoder. Do not flatten them, drop one, or claim SPU2 mixing parity.
    ranges = [(72, 48+offsets[1]), (48+offsets[1], song_at)]
    streams = []
    for start, end in ranges:
        seq = inspect_sq(data[:72]+data[start:end], require_loop=False)
        for event in seq['source_events']: event['offset'] += start-72
        streams.append({'offset': start, 'end': end, 'sequence': seq})
    return {'unchanged_parser': False, 'original_error': original_error,
            'streams': streams,
            'song_metadata_hex': data[song_at:].hex(),
            'warning': 'Both MIDI streams parsed; native Song selection, simultaneous mixing and rendering unverified'}


def first_cps(s, name, offset=0):
    size = int.from_bytes(s.read_at(name, offset, 3), 'big')
    if not 0 < size <= 16*1024*1024:
        raise FormatError('CPS output size outside bound')
    # Every output byte consumes at most a token plus literal. This bound also
    # permits probing a member of a large container without reading it in full.
    count = min(s.entries[name].size-offset, size*2+3)
    return cps(s.read_at(name, offset, count))


def overlay(data, expected_index):
    if len(data) < 64 or data[:4] != b'MWo3':
        raise FormatError('MWo3: missing overlay header')
    index, address, text_size, data_size, bss, ctor, end_ctor = struct.unpack_from('<7I', data, 4)
    if index != expected_index+1 or address != 0x5dd000 or text_size != 0xc0 or bss:
        raise FormatError('MWo3: untested overlay layout')
    extent = 64+text_size+data_size
    if extent > len(data) or extent < 64 or any(data[extent:]):
        raise FormatError('MWo3: invalid extent/padding')
    # Native symbols address the complete overlay, including its header. Adding
    # another 64 bytes corrupts strings and instruction alignment on this disc.
    return {'address': address, 'size': extent, 'index': index,
            'text_bytes': text_size, 'data_bytes': data_size,
            'constructors': [ctor, end_ctor]}


def classify(head):
    if head.startswith(b'AFS\0'): return 'CRI AFS'
    if head.startswith(b'MWo3'): return 'MWo3 overlay'
    if head.startswith(b'TIM2'): return 'TIM2'
    if head.startswith(b'ogdt'): return 'OGDT'
    if head[4:8] in (b'ogdt', b'TIM2'): return 'CPS image(s)'
    if head.startswith(b'IECSsreV'):
        return {b'IECSdaeH': 'Sony HD', b'IECSuqeS': 'Sony SQ'}.get(head[16:24], 'Sony bank')
    if head.startswith(b'\0\0\x01\xba'): return 'MPEG PS/PSS'
    if head.startswith(b'\x7fELF'): return 'ELF'
    return 'unclassified'


def inspect(source, fingerprint=False):
    identity = detect(source)
    if not identity['supported']: raise FormatError(identity['reason'])
    s = Source(source)
    members = [{'path': n, 'size': e.size,
                'format': classify(s.read_at(n, 0, min(e.size, 64)))}
               for n, e in s.entries.items()]
    return {'identification': identity, 'archives': {'disc_resources': members},
            **({'source': s.fingerprint()} if fingerprint else {})}


def _symbol_bytes(elf, banks, symbol):
    section = symbol['section']
    if section == 4: return elf.at(symbol['address'], symbol['size'])
    if section not in banks: raise FormatError(f'Unknown symbol section {section}')
    data, info = banks[section]
    at = symbol['address']-info['address']
    if at < 64 or at+symbol['size'] > info['size']:
        raise FormatError(f'MWo3 symbol outside section {section}: {at:#x}')
    return data[at:at+symbol['size']]


def recover(source, destination):
    """Write private evidence and exact bytes. Does not create reader content."""
    out = Path(destination); s = Source(source)
    report = inspect(source, True)
    saved = []
    def save(name, data):
        record = write_bytes(out, name, data)
        record.pop('status', None); saved.append(record)
    elf = Elf32(s.read_at(EXE))
    save('raw/'+EXE, elf.data)
    for name in ('SYSTEM.CNF', 'CD.LST'): save('raw/'+name, s.read_at(name))
    banks = {}
    for i, name in enumerate(OVERLAYS):
        data = s.read_at(name); info = overlay(data, i)
        banks[6+2*i] = (data, info)
        save('raw/'+portable_path(name), data)
    tables = []; strings = []; decode_errors = []; opcode_words = Counter()
    # Recover named, NUL-terminated CP932 data. Never sort these into a story.
    symbols_by_address = {}
    for name, sym in elf.symbols.items():
        if sym['section'] not in banks or sym['type'] != 1: continue
        symbols_by_address[(sym['section'], sym['address'])] = name
        if name.endswith('_intdat'): continue
        raw = _symbol_bytes(elf, banks, sym)
        if not raw.endswith(b'\0') or b'\0' in raw[:-1]: continue
        try: text = raw[:-1].decode('cp932', errors='strict')
        except UnicodeDecodeError as error:
            decode_errors.append({'symbol': name, 'error': str(error)}); continue
        if not re.search('[\u3040-\u30ff\u3400-\u9fff]', text): continue
        strings.append({'id': f"n7:s{sym['section']}:{sym['address']:08x}",
                        'symbol': name, **sym, 'text': text, 'raw_hex': raw.hex(),
                        'classification': 'named source string; not an executed segment'})
    strings_by_addr = {(r['section'], r['address']): r['id'] for r in strings}
    for name, sym in elf.symbols.items():
        if not name.endswith('_intdat'): continue
        raw = _symbol_bytes(elf, banks, sym)
        if len(raw) % 4: raise FormatError(f'Unaligned script table {name}')
        words = struct.unpack('<'+'I'*(len(raw)//4), raw)
        references = [{'word': i, 'string': strings_by_addr[(sym['section'], w)]}
                      for i, w in enumerate(words) if (sym['section'], w) in strings_by_addr]
        opcode_words.update(f'{w:08x}' for w in words if 0xf0000000 <= w < 0xf000009a)
        tables.append({'id': f"n7:s{sym['section']}:{sym['address']:08x}", 'symbol': name,
                       **sym, 'words': list(words), 'string_references': references,
                       'classification': 'source words; instruction boundaries/branches unvalidated'})
    script_index = elf.symbols['memories_sadr']
    native_index = struct.unpack('<252I', elf.at(script_index['address'], script_index['size']))
    index = [{'overlay': i//18, 'slot': i%18, 'address': w,
              'symbol': symbols_by_address.get((6+2*(i//18), w))}
             for i, w in enumerate(native_index) if w]
    # Actual dispatcher table, gated by executable fingerprint. Per-arm calls
    # are evidence only; no inferred opcode width or semantics is executable.
    switches = struct.unpack('<154I', elf.at(0x3909b0, 154*4))
    handler = elf.symbols['oscrExeCommand']
    if any(not handler['address'] <= pc < handler['address']+handler['size'] for pc in switches):
        raise FormatError('Dispatcher table outside verified function')
    write_json(out, 'scripts/source-words.json', tables)
    write_json(out, 'scripts/named-strings.json', strings)
    write_json(out, 'scripts/native-index.json', index)
    write_json(out, 'scripts/dispatcher.json', [{'word': 0xf0000000+i, 'target': w}
                                               for i, w in enumerate(switches)])
    for name in ('oscrExeCommand', 'oscrSetScript', 'oscrGetTopAdr', 'oscrHensuuSet',
                 'oscrSentakuWrite', 'oscrJEqu', 'oscrJnequ', 'cps2bin',
                 'get_cps_bin_size', 'LoadOGDImage_exe'):
        write_json(out, 'native/'+name+'.json', elf.disassemble_mips(name))
    media = []
    for entry in report['archives']['disc_resources']:
        name, kind = entry['path'], entry['format']
        if kind not in ('CPS image(s)', 'Sony SQ'): continue
        item = {'source': name, 'format': kind}
        try:
            if kind == 'CPS image(s)':
                decoded, used = first_cps(s, name)
                item.update(decoded_size=len(decoded), consumed=used,
                            trailing_bytes=entry['size']-used, decoded_magic=decoded[:4].hex())
                save('decoded/'+name+'.bin', decoded)
                try:
                    w, h, png = ogdt_png(decoded)
                    save('previews/'+name+'.png', png)
                    item.update(width=w, height=h, preview='previews/'+name+'.png')
                except FormatError as error: item['preview_unavailable'] = str(error)
            else:
                # Keep full native metadata. Never make the strict shared reader
                # accept a new variant just because it shares the magic string.
                item['shared_parser'] = probe_sq(s.read_at(name))
        except (ValueError, KeyError) as error: item['error'] = str(error)
        media.append(item)
    write_json(out, 'media-probe.json', media)
    manifest = {'format': 'vnkit-never7-recovery', 'version': 1,
                'adapter_version': ADAPTER_VERSION, 'tool_version': __version__,
                'identification': report['identification'], 'source': report['source'],
                'status': 'blocked', 'playable': False, 'originals': saved,
                'inventory': report['archives'],
                'counts': {'overlays': len(banks), 'script_tables': len(tables),
                           'named_japanese_strings': len(strings),
                           'table_string_references': sum(len(t['string_references']) for t in tables),
                           'native_index_entries': len(index)},
                'opcode_word_census': dict(sorted(opcode_words.items())),
                'string_decode_errors': decode_errors,
                'warnings': ['Static recovery output only; use never7_import for reader content.',
                             'Opcode word counts are not parsed instruction counts.',
                             'CPS probe decodes only the first member of each detected resource.',
                             'Recovery success does not validate story execution or media playback.']}
    write_json(out, 'manifest.json', manifest)
    return {'status': 'blocked', 'playable': False, 'manifest': str(out/'manifest.json'),
            'counts': manifest['counts'], 'warnings': manifest['warnings']}


def extract(source, destination):
    return recover(source, destination)


def import_game(source, destination):
    return recover(source, destination)


def recover_images(source, destination):
    """Walk measured sector-aligned CPS streams, keeping failures explicit."""
    s = Source(source); out = Path(destination); inventory = inspect(source, True)
    members = []; failures = []
    for entry in inventory['archives']['disc_resources']:
        if entry['format'] != 'CPS image(s)': continue
        name = entry['path']; at = 0; count = 0
        while at < entry['size']:
            try:
                if count >= 10000: raise FormatError('CPS member count exceeds bound')
                head = s.read_at(name, at, min(8, entry['size']-at))
                if classify(head) != 'CPS image(s)':
                    raise FormatError('Unrecognised CPS member boundary')
                decoded, used = first_cps(s, name, at)
                rel = f'{portable_path(name)}/{at:08x}'
                record = {'source': name, 'offset': at, 'compressed_size': used,
                          'decoded_size': len(decoded), 'id': f'n7:{name}:{at:08x}',
                          'sha256': hashlib.sha256(decoded).hexdigest()}
                write_bytes(out, 'decoded/'+rel+'.bin', decoded)
                try:
                    width, height, png = ogdt_png(decoded)
                    write_bytes(out, 'images/'+rel+'.png', png)
                    record.update(width=width, height=height, image='images/'+rel+'.png')
                except FormatError as error: record['image_unavailable'] = str(error)
                members.append(record); count += 1
                end = at+used
                next_at = min(entry['size'], ((end+2047)//2048)*2048)
                if any(s.read_at(name, end, next_at-end)):
                    raise FormatError('Nonzero bytes in sector padding')
                at = next_at
            except (ValueError, KeyError) as error:
                failures.append({'source': name, 'offset': at, 'error': str(error)})
                break
    report = {'format': 'vnkit-never7-images', 'version': 1,
              'adapter_version': ADAPTER_VERSION, 'source': inventory['source'],
              'status': 'assets-only', 'playable': False, 'members': members, 'failures': failures,
              'warning': 'Only detected CPS streams; no scene mapping or runtime fidelity claim.'}
    write_json(out, 'image-manifest.json', report)
    return {'status': 'assets-only', 'playable': False, 'members': len(members),
            'pngs': sum('image' in r for r in members), 'failures': failures,
            'manifest': str(out/'image-manifest.json')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--images', action='store_true', help='Recover every member of detected CPS image streams')
    args = parser.parse_args()
    try:
        result = (recover_images if args.images else recover)(args.source, args.out)
        print(json.dumps(result, indent=2))
        return 3 if not args.images or result['failures'] else 0
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f'Never7 recovery: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
