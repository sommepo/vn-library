"""Exact Gyakuten Saiban 2 (AGB-A3GJ) cartridge recovery; static only.

Script, font and table locations are discovered from the supplied ROM and
cross-checked against the exact SHA-1. Command lengths are original work from
native-behaviour notes in docs/gs2-gba-investigation.md. No upstream code is used.
"""
import hashlib
from pathlib import Path
import struct

from ..disc import FormatError, write_bytes, write_json

ROM_SHA1 = 'f7a156dbed52d3edb8104112ae40e6e2aaca57f9'
ROM_SIZE = 0x800000
ADAPTER_ID = 'gs2-gba'
ADAPTER_VERSION = '0.1.0'
ROM_BASE = 0x08000000
SCENARIO_COUNT = 22
FONT_OFFSET = 0x1AE3A8
FONT_GLYPHS = 0x600
GLYPH_BYTES = 0x80
TEXT_PALETTE_OFFSET = 0x1AE388
# Glyphs 1416..1535 are blank/duplicate padding; no script references them.
FONT_USED_GLYPHS = 1416
FONT_SHA256 = '4eaac93080c34fc9a1101db4f46fb4ae133b8947b8cd6eacda4221beb27cfd60'
CHARSET_FORMAT = 'gs2-gba-charset-review-v1'
# Scenario labels follow the native table: episode index (0..3) and part.
# Episode 1 is 0_0..0_1; episodes 2-4 alternate investigation and trial parts.
SCENARIOS = ('0_0', '0_1', '1_0', '1_1', '1_2', '1_3', '1_4', '1_5',
             '2_0', '2_1', '2_2', '2_3', '2_4', '2_5',
             '3_0', '3_1', '3_2', '3_3', '3_4', '3_5', '3_6', '3_7')

# opcode: (total 16-bit words including the opcode, name, control kind)
# Kinds: text layout, wait (native input/timer stop), jump (changes section),
# end (leaves the section), state (flag/record/process), media, presentation.
COMMANDS = {
    0x00: (1, 'reset_section', 'text'), 0x01: (1, 'newline', 'text'),
    0x02: (1, 'wait_page', 'wait'), 0x03: (2, 'text_color', 'text'),
    0x04: (2, 'wait_key', 'wait'), 0x05: (3, 'bgm_fade_in', 'media'),
    0x06: (2, 'sound_effect', 'media'), 0x07: (1, 'choice_page', 'wait'),
    0x08: (3, 'choice_two', 'jump'), 0x09: (4, 'choice_three', 'jump'),
    0x0A: (2, 'wait_page_penalty', 'jump'), 0x0B: (2, 'text_speed', 'text'),
    0x0C: (2, 'wait_frames', 'wait'), 0x0D: (1, 'next_section', 'end'),
    0x0E: (2, 'nametag', 'text'), 0x0F: (3, 'native_0f', 'state'),
    0x10: (2, 'native_10', 'state'), 0x11: (1, 'native_11', 'state'),
    0x12: (4, 'native_12', 'presentation'), 0x13: (2, 'native_13', 'presentation'),
    0x14: (1, 'item_plate', 'presentation'), 0x15: (1, 'stop', 'end'),
    0x16: (1, 'end_segment', 'end'), 0x17: (2, 'add_record', 'state'),
    0x18: (2, 'native_18', 'state'), 0x19: (3, 'replace_record', 'state'),
    0x1A: (5, 'court_scroll', 'presentation'), 0x1B: (2, 'background', 'presentation'),
    0x1C: (2, 'textbox_mode', 'presentation'), 0x1D: (2, 'background_scroll', 'presentation'),
    0x1E: (4, 'person', 'presentation'), 0x1F: (1, 'native_1f', 'presentation'),
    0x20: (2, 'set_next_section', 'jump'), 0x21: (1, 'native_21', 'state'),
    0x22: (3, 'bgm_fade_out', 'media'), 0x23: (3, 'native_23', 'state'),
    0x24: (1, 'title_process', 'end'), 0x25: (2, 'native_25', 'state'),
    0x26: (2, 'native_26', 'state'), 0x27: (3, 'native_27', 'state'),
    0x28: (2, 'native_28', 'state'), 0x29: (2, 'testimony_process', 'state'),
    0x2A: (4, 'flag_branch', 'jump'), 0x2B: (1, 'noop_2b', 'state'),
    0x2C: (2, 'native_2c', 'state'), 0x2D: (1, 'wait_page_alt', 'wait'),
    0x2E: (1, 'clear_text', 'wait'), 0x2F: (3, 'native_2f', 'presentation'),
    0x30: (2, 'native_30', 'presentation'), 0x31: (3, 'native_31', 'state'),
    0x32: (3, 'native_32', 'state'), 0x33: (6, 'native_33', 'presentation'),
    0x34: (2, 'native_34', 'presentation'), 0x35: (3, 'jump_if_flag', 'jump'),
    0x36: (2, 'jump', 'jump'), 0x37: (3, 'native_37', 'state'),
    0x38: (2, 'native_38', 'state'), 0x39: (2, 'native_39', 'state'),
    0x3A: (5, 'native_3a', 'presentation'), 0x3B: (5, 'native_3b', 'presentation'),
    0x3C: (2, 'native_3c', 'presentation'), 0x3D: (2, 'wait_map_marker', 'wait'),
    0x3E: (2, 'native_3e', 'presentation'), 0x3F: (1, 'spot_select', 'jump'),
    0x40: (1, 'native_40', 'state'), 0x41: (1, 'native_41', 'state'),
    0x42: (2, 'native_42', 'state'), 0x43: (2, 'native_43', 'state'),
    0x44: (2, 'native_44', 'state'), 0x45: (1, 'stop_alt', 'end'),
    0x46: (2, 'native_46', 'presentation'), 0x47: (3, 'native_47', 'presentation'),
    0x48: (3, 'text_position', 'text'), 0x49: (1, 'native_49', 'state'),
    0x4A: (2, 'wait_verdict', 'wait'), 0x4B: (2, 'native_4b', 'state'),
    0x4C: (1, 'wait_background_scroll', 'wait'), 0x4D: (3, 'background_mask', 'presentation'),
    0x4E: (2, 'wait_idle', 'wait'), 0x4F: (8, 'psyche_lock_setup', 'state'),
    0x50: (2, 'native_50', 'state'), 0x51: (3, 'native_51', 'state'),
    0x52: (2, 'native_52', 'state'), 0x53: (1, 'native_53', 'state'),
    0x54: (3, 'hp_bar', 'state'), 0x55: (1, 'native_55', 'state'),
    0x56: (1, 'native_56', 'state'), 0x57: (2, 'psyche_lock_show', 'state'),
    0x58: (1, 'native_58', 'state'), 0x59: (2, 'native_59', 'state'),
    0x5A: (2, 'native_5a', 'state'), 0x5B: (3, 'native_5b', 'state'),
    0x5C: (4, 'native_5c', 'presentation'), 0x5D: (1, 'native_5d', 'state'),
    0x5E: (2, 'native_5e', 'state'), 0x5F: (4, 'native_5f', 'presentation'),
    0x60: (5, 'native_60', 'presentation'), 0x61: (4, 'native_61', 'presentation'),
    0x62: (1, 'native_62', 'state'), 0x63: (1, 'native_63', 'state'),
    0x64: (2, 'psyche_lock_process', 'state'), 0x65: (3, 'native_65', 'state'),
    0x66: (4, 'native_66', 'presentation'), 0x67: (1, 'native_67', 'state'),
    0x68: (1, 'native_68', 'state'), 0x69: (1, 'zoom_animation', 'wait'),
    0x6A: (2, 'petals', 'presentation'), 0x6B: (2, 'spotlight_stop', 'presentation'),
    0x6C: (1, 'take_that_record', 'state'), 0x6D: (2, 'signal_detector', 'state'),
    0x6E: (2, 'native_6e', 'state'), 0x6F: (2, 'loop_bridge_section', 'state'),
    0x70: (4, 'bgm_volume', 'media'), 0x71: (4, 'psyche_lock_end', 'state'),
}


def u32(data, offset):
    if offset < 0 or offset + 4 > len(data):
        raise FormatError(f'GS2 read outside data: {offset:#x}')
    return struct.unpack_from('<I', data, offset)[0]


def lz77(data, offset):
    """GBA BIOS LZ77 (type 0x10), bounded by the declared output size."""
    if offset + 4 > len(data) or data[offset] != 0x10:
        raise FormatError(f'GS2 LZ77 header missing at {offset:#x}')
    size = u32(data, offset) >> 8
    out = bytearray()
    pos = offset + 4
    while len(out) < size:
        if pos >= len(data):
            raise FormatError(f'GS2 LZ77 input truncated at {offset:#x}')
        flags = data[pos]
        pos += 1
        for bit in range(8):
            if len(out) >= size:
                break
            if flags & (0x80 >> bit):
                if pos + 2 > len(data):
                    raise FormatError(f'GS2 LZ77 reference truncated at {offset:#x}')
                length = (data[pos] >> 4) + 3
                distance = (((data[pos] & 0xF) << 8) | data[pos + 1]) + 1
                pos += 2
                if distance > len(out):
                    raise FormatError(f'GS2 LZ77 reference before output at {offset:#x}')
                for _ in range(length):
                    out.append(out[-distance])
            else:
                if pos >= len(data):
                    raise FormatError(f'GS2 LZ77 literal truncated at {offset:#x}')
                out.append(data[pos])
                pos += 1
    return bytes(out[:size]), pos - offset


def identify(path):
    rom = Path(path).read_bytes()
    if len(rom) != ROM_SIZE or hashlib.sha1(rom).hexdigest() != ROM_SHA1:
        raise FormatError('unrecognised Gyakuten Saiban 2 cartridge dump')
    if rom[0xA0:0xB2] != b'GYAKUTEN_SA2A3GJ08':
        raise FormatError('Gyakuten Saiban 2 header mismatch')
    return rom


LIMITATION = ('Experimental episode 1 court reader (local CLI import); investigation, psyche-locks, '
              'graphics, animation and sound are not implemented')


def detect(path):
    path = Path(path)
    if path.suffix.lower() != '.gba' or not path.is_file() or path.stat().st_size != ROM_SIZE:
        return {'supported': False, 'reason': 'Not the tested Gyakuten Saiban 2 AGB-A3GJ cartridge dump'}
    try:
        identify(path)
    except FormatError:
        return {'supported': False, 'reason': 'Not the tested Gyakuten Saiban 2 AGB-A3GJ cartridge dump'}
    return {'supported': True, 'playable': True, 'support_level': 'experimental', 'adapter': ADAPTER_ID,
            'adapter_version': ADAPTER_VERSION, 'title': '逆転裁判2',
            'edition': 'Japanese Game Boy Advance AGB-A3GJ rev 0', 'platform': 'Game Boy Advance',
            'rom_sha1': ROM_SHA1, 'reason': LIMITATION}


def scenario_table(rom):
    """Find the 22 ascending LZ77 pointers used by the native script loader."""
    found = []
    for offset in range(0, len(rom) - SCENARIO_COUNT * 4, 4):
        values = struct.unpack_from('<22I', rom, offset)
        if not all(ROM_BASE <= v < ROM_BASE + len(rom) for v in values):
            continue
        targets = [v - ROM_BASE for v in values]
        if any(b <= a for a, b in zip(targets, targets[1:])):
            continue
        if all(rom[t] == 0x10 for t in targets):
            found.append((offset, targets))
    if len(found) != 1:
        raise FormatError(f'GS2 scenario table candidates: {len(found)}')
    return found[0]


def section_table(data, label):
    """Return (section offsets, jump labels) from the shared header table.

    Section entries are ascending byte offsets. Trailing entries used by the
    jump commands pack (byte offset within section, section index) instead.
    """
    count = u32(data, 0)
    if not 0 < count < 0x400 or (count + 1) * 4 > len(data):
        raise FormatError(f'GS2 {label} section count invalid: {count}')
    entries = [u32(data, 4 + 4 * i) for i in range(count)]
    offsets = []
    for value in entries:
        if value > len(data) or value & 1 or (offsets and value < offsets[-1]):
            break
        offsets.append(value)
    if not offsets or offsets[0] != (count + 1) * 4:
        raise FormatError(f'GS2 {label} section offsets invalid')
    bounds = offsets + [len(data)]
    labels = []
    for value in entries[len(offsets):]:
        offset, section = value & 0xFFFF, value >> 16
        if section >= len(offsets) or offset & 1 or bounds[section] + offset >= bounds[section + 1]:
            raise FormatError(f'GS2 {label} jump label invalid: {value:#x}')
        labels.append({'section': section, 'offset': offset})
    return offsets, labels


def std_scripts(rom, first_scenario):
    """The shared table ends immediately before the first compressed scenario."""
    for start in range(first_scenario - 8, max(0, first_scenario - 0x10000), -4):
        count = u32(rom, start)
        if 0 < count < 0x80 and u32(rom, start + 4) == (count + 1) * 4:
            data = rom[start:first_scenario]
            try:
                offsets, labels = section_table(data, 'std')
            except FormatError:
                continue
            if offsets[-1] < len(data) and not labels:
                return start, data
    raise FormatError('GS2 standard script table not found')


def tokenize(data, start, end, label):
    """Linear token census for one section. Unknown opcodes fail closed."""
    items, pos = [], start
    while pos < end:
        word = struct.unpack_from('<H', data, pos)[0]
        if word >= 0x80:
            items.append({'offset': pos, 'glyph': word - 0x80})
            pos += 2
            continue
        spec = COMMANDS.get(word)
        if spec is None:
            raise FormatError(f'GS2 {label}:{pos:#x} unknown command {word:#04x}')
        length, name, kind = spec
        if pos + length * 2 > end:
            raise FormatError(f'GS2 {label}:{pos:#x} {name} crosses section end')
        args = list(struct.unpack_from(f'<{length - 1}H', data, pos + 2)) if length > 1 else []
        items.append({'offset': pos, 'op': word, 'name': name, 'kind': kind, 'args': args})
        pos += length * 2
    return items


def parse_script(data, label, base_section):
    offsets, labels = section_table(data, label)
    bounds = offsets + [len(data)]
    sections = []
    for index, (start, end) in enumerate(zip(bounds, bounds[1:])):
        sections.append({'section': base_section + index, 'offset': start,
                         'tokens': tokenize(data, start, end, f'{label}#{index}')})
    starts = {(i, t['offset'] - bounds[i]) for i, s in enumerate(sections) for t in s['tokens']}
    for entry in labels:
        if (entry['section'], entry['offset']) not in starts:
            raise FormatError(f'GS2 {label} jump label inside a token: {entry}')
    return sections, labels


# Commands whose arguments name scenario sections (0x80-based), by argument index.
SECTION_ARGS = {0x08: (0, 1), 0x09: (0, 1, 2), 0x0A: (0,), 0x0F: (0,), 0x20: (0,), 0x2A: (1, 2), 0x2C: (0,)}


def audit_references(sections, labels, label, base_section=0x80):
    """Every static section, label and in-section jump must land on a token."""
    counts = {'sections': 0, 'labels': 0, 'local': 0}
    entries = len(sections) + len(labels)
    starts = [{t['offset'] - s['offset'] for t in s['tokens']} for s in sections]
    for index, section in enumerate(sections):
        for token in section['tokens']:
            op, args = token.get('op'), token.get('args', [])
            where = f'GS2 {label}#{index}:{token["offset"]:#x}'
            for arg in SECTION_ARGS.get(op, ()):
                target = args[arg]
                if target in (0, 0xFFFF):
                    continue  # native "no alternative" markers, handled by the caller
                if not base_section <= target < base_section + len(sections):
                    raise FormatError(f'{where} section reference outside script: {target:#x}')
                counts['sections'] += 1
            if op == 0x36 or (op == 0x35 and args[0] & 0x80):
                entry = args[0] if op == 0x36 else args[1]
                if not len(sections) <= entry < entries:
                    raise FormatError(f'{where} jump label outside header: {entry}')
                counts['labels'] += 1
            elif op == 0x35:
                if args[1] not in starts[index]:
                    raise FormatError(f'{where} local jump inside a token: {args[1]:#x}')
                counts['local'] += 1
    return counts


def load_charset(path, rom):
    """Reviewed glyph map (a review document or file), bound to this ROM's font bytes."""
    import json
    if isinstance(path, dict):
        review = path
    elif not Path(path).is_file():
        raise FormatError(f'GS2 review map not found: {path}')
    else:
        review = json.loads(Path(path).read_text(encoding='utf-8'))
    font = rom[FONT_OFFSET:FONT_OFFSET + FONT_USED_GLYPHS * GLYPH_BYTES]
    if review.get('format') != CHARSET_FORMAT or review.get('font_sha256') != FONT_SHA256 \
            or hashlib.sha256(font).hexdigest() != FONT_SHA256:
        raise FormatError('GS2 charset review does not match this font')
    mapping = {int(k): v for k, v in review['map'].items()}
    if sorted(mapping) != list(range(FONT_USED_GLYPHS)) or any(len(v) != 1 for v in mapping.values()):
        raise FormatError('GS2 charset review is incomplete')
    return mapping


# Page-ending commands: the native text box waits, then clears on the next page.
PAGE_BREAKS = {0x02, 0x0A, 0x2D, 0x2E}


def section_pages(tokens, charset):
    """Split one section into displayed text pages. Unmapped glyphs fail closed.

    This is a static view of text order within a section, not an execution
    path: commands that jump, wait on native processes or branch are retained
    as markers for the future VM and are never followed here.
    """
    pages, lines, line, speaker = [], [], [], None
    def flush():
        nonlocal lines, line
        if line or lines:
            pages.append({'speaker': speaker, 'text': '\n'.join(lines + [''.join(line)]).rstrip('\n')})
        lines, line = [], []
    for token in tokens:
        if 'glyph' in token:
            if token['glyph'] not in charset:
                raise FormatError(f'GS2 unmapped glyph {token["glyph"]} at {token["offset"]:#x}')
            line.append(charset[token['glyph']])
        elif token['op'] == 0x01:
            lines.append(''.join(line)); line = []
        elif token['op'] == 0x0E:
            speaker = token['args'][0]
        elif token['op'] in PAGE_BREAKS:
            flush()
    flush()
    return pages


# Case tables for this exact ROM. Offsets are checked structurally on every read.
CASE_START_PROCESS = 0x01C3D8      # 22 bytes: native process 3 (court) or 4 (investigation)
CASE_GAMEOVER_SECTIONS = 0x01C3EE  # 23 u16 sections, 0 = none
INITIAL_RECORD_TABLE = 0x111F14    # 22 pointers: profiles, 0xFE, evidence, 0xFF
COURT_PRESENT_TABLE = 0x111F6C     # 22 pointers to (statement, item, target, flag, action) rows
SPEAKER_NAMETAGS = 0x111ED0        # 56 bytes: speaker id -> nametag image index
RECORD_TABLE = 0x022F38            # 8-byte rows: LZ77 description tiles, image id, detail id
RECORD_COUNT = 156


def rom_pointer(rom, offset):
    value = u32(rom, offset)
    if not ROM_BASE <= value < ROM_BASE + len(rom):
        raise FormatError(f'GS2 pointer outside ROM at {offset:#x}')
    return value - ROM_BASE


def case_tables(rom):
    """Native case data consumed by the court processes."""
    start = list(rom[CASE_START_PROCESS:CASE_START_PROCESS + SCENARIO_COUNT])
    if any(v not in (3, 4) for v in start):
        raise FormatError('GS2 case start-process table mismatch')
    gameover = list(struct.unpack_from('<23H', rom, CASE_GAMEOVER_SECTIONS))
    if any(v and not 0x80 <= v < 0x200 for v in gameover):
        raise FormatError('GS2 game-over section table mismatch')
    initial, present = [], []
    for index in range(SCENARIO_COUNT):
        pos = rom_pointer(rom, INITIAL_RECORD_TABLE + 4 * index)
        lists = [[], []]
        for which in (0, 1):
            while rom[pos] != (0xFE, 0xFF)[which]:
                if rom[pos] >= RECORD_COUNT or len(lists[which]) > 32:
                    raise FormatError(f'GS2 initial court record invalid for scenario {index}')
                lists[which].append(rom[pos]); pos += 1
            pos += 1
        initial.append({'profiles': lists[0], 'evidence': lists[1]})
        pos, rows = rom_pointer(rom, COURT_PRESENT_TABLE + 4 * index), []
        while True:
            statement, item, target, flag, action = struct.unpack_from('<HHHBB', rom, pos); pos += 8
            if statement == 0xFFFF:
                break
            if not (0x80 <= statement < 0x200 and item < RECORD_COUNT and 0x80 <= target < 0x200) or len(rows) > 64:
                raise FormatError(f'GS2 court present table invalid for scenario {index}')
            rows.append({'statement': statement, 'item': item, 'target': target,
                         'flag': None if flag == 0xFF else flag, 'objection': action == 0})
        present.append(rows)
    speakers = list(rom[SPEAKER_NAMETAGS:SPEAKER_NAMETAGS + 56])
    if speakers[:4] != [0, 1, 1, 2] or max(speakers) > 0x2E:
        raise FormatError('GS2 speaker nametag map mismatch')
    return {'startProcess': start, 'gameoverSections': gameover, 'initialRecord': initial,
            'courtPresent': present, 'speakerNametags': speakers}


def glyph_rows(rom, index):
    """16x16 4bpp glyph as 16 rows of palette indices (2x2 8x8 tiles)."""
    if not 0 <= index < FONT_GLYPHS:
        raise FormatError(f'GS2 glyph outside font: {index}')
    base = FONT_OFFSET + index * GLYPH_BYTES
    rows = [[0] * 16 for _ in range(16)]
    for tile in range(4):
        tx, ty = (tile & 1) * 8, (tile >> 1) * 8
        for y in range(8):
            for x in range(8):
                byte = rom[base + tile * 32 + y * 4 + x // 2]
                rows[ty + y][tx + x] = (byte >> 4) if x & 1 else (byte & 0xF)
    return rows


def recover(source, destination):
    rom = identify(source)
    destination = Path(destination)
    table_offset, targets = scenario_table(rom)
    std_offset, std = std_scripts(rom, targets[0])
    census = {'rom_sha1': ROM_SHA1, 'scenario_table': table_offset, 'std_scripts': std_offset,
              'font': {'offset': FONT_OFFSET, 'glyphs': FONT_GLYPHS}, 'scripts': [], 'commands': {}}
    used_glyphs = set()

    def record(label, data, source_offset, compressed, parsed):
        sections, labels = parsed
        references = audit_references(sections, labels, label, 0 if label == 'std' else 0x80)
        write_bytes(destination, f'scripts/{label}.bin', data)
        words = sum(len(s['tokens']) for s in sections)
        glyphs = sum(1 for s in sections for t in s['tokens'] if 'glyph' in t)
        for section in sections:
            for token in section['tokens']:
                if 'glyph' in token:
                    used_glyphs.add(token['glyph'])
                else:
                    census['commands'][token['name']] = census['commands'].get(token['name'], 0) + 1
        census['scripts'].append({'label': label, 'offset': source_offset, 'compressed': compressed,
                                  'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                  'sections': len(sections), 'jump_labels': len(labels), 'references': references, 'tokens': words, 'glyph_tokens': glyphs})

    record('std', std, std_offset, 0, parse_script(std, 'std', 0))
    for label, offset in zip(SCENARIOS, targets):
        data, consumed = lz77(rom, offset)
        record(f'scenario_{label}', data, offset, consumed, parse_script(data, label, 0x80))
    bad = sorted(g for g in used_glyphs if g >= FONT_GLYPHS)
    if bad:
        raise FormatError(f'GS2 script glyphs outside font: {bad[:8]}')
    census['used_glyphs'] = len(used_glyphs)
    write_bytes(destination, 'font/charset.bin', rom[FONT_OFFSET:FONT_OFFSET + FONT_GLYPHS * GLYPH_BYTES])
    write_bytes(destination, 'font/text-palette.bin', rom[TEXT_PALETTE_OFFSET:TEXT_PALETTE_OFFSET + 0x20])
    write_json(destination, 'census.json', census)
    return census


def inspect(path, fingerprint=False):
    rom = identify(path)
    table_offset, targets = scenario_table(rom)
    return {'identification': detect(path),
            'source': {'size': len(rom), 'sha1': ROM_SHA1, 'header': rom[0xA0:0xB2].decode('ascii')},
            'archives': {'scenario_table': table_offset, 'scenarios': len(targets),
                         'container': 'GBA ROM: BIOS-LZ77 scenario scripts, 16x16 4bpp font'}}


def extract(source, destination):
    return recover(source, destination)

