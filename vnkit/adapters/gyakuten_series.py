"""Static recovery and native import shared by the Gyakuten Saiban GBA editions.

Each edition is one exact ROM (SHA-1 and header) with explicit, ROM-checked
facts: scenario table, standard script, font, episode starts. Script parsing
and reference audits reuse the series primitives in gs2_gba (identical command
format). Reviewed glyph and nametag maps (<key>_charset.py) are bound to the ROM.
No upstream code is used.
"""
from dataclasses import dataclass, field
import hashlib
import importlib
import json
import os
from pathlib import Path
import struct

from ..disc import FormatError, write_bytes, write_json
from . import gs2_gba as series

ROM_SIZE = 0x800000
ROM_BASE = 0x08000000
GLYPH_BYTES = 0x80


@dataclass(frozen=True)
class Edition:
    key: str
    adapter_id: str
    title: str
    header: bytes
    rom_sha1: str
    content_id: str
    edition_label: str
    scenario_table: int
    scenarios: tuple
    episode_starts: tuple
    font_offset: int
    glyphs: int
    font_sha256: str
    title_section: int = 7
    episodes_label: str = '第{n}話　{title}'
    commands: dict = field(default_factory=dict)
    extra_scripts: tuple = ()  # self-contained script blocks the game loads from code, not the table
    adapter_version: str = '0.1.0'

    @property
    def runtime_id(self):
        return f'{self.key}-gba-native'

    @property
    def case_format(self):
        return f'vnkit.{self.key}-case'

    @property
    def charset_format(self):
        return f'{self.key}-gba-charset-review-v1'

    @property
    def names_format(self):
        return f'{self.key}-gba-names-review-v1'


def identify(edition, path):
    rom = Path(path).read_bytes()
    if len(rom) != ROM_SIZE or hashlib.sha1(rom).hexdigest() != edition.rom_sha1:
        raise FormatError(f'unrecognised {edition.title} cartridge dump')
    if rom[0xA0:0xB2] != edition.header:
        raise FormatError(f'{edition.title} header mismatch')
    return rom


def limitation(edition):
    return (f'{edition.title} native runtime: the cartridge runs on the original-code GBA machine; text pages '
            'and choices are read from native state. Device timing is emulated, not measured against hardware; '
            'see the runtime guide.')


def detect(edition, path):
    path = Path(path)
    unsupported = {'supported': False, 'reason': f'Not the tested {edition.title} {edition.edition_label} cartridge dump'}
    if path.suffix.lower() != '.gba' or not path.is_file() or path.stat().st_size != ROM_SIZE:
        return unsupported
    try:
        identify(edition, path)
    except FormatError:
        return unsupported
    return {'supported': True, 'playable': True, 'support_level': 'experimental', 'adapter': edition.adapter_id,
            'adapter_version': edition.adapter_version, 'title': edition.title, 'edition': edition.edition_label,
            'platform': 'Game Boy Advance', 'rom_sha1': edition.rom_sha1, 'reason': limitation(edition)}


def tokenize(edition, data, start, end, label):
    """Series tokenizer with this edition's additional command lengths."""
    if not edition.commands:
        return series.tokenize(data, start, end, label)
    items, pos = [], start
    while pos < end:
        word = struct.unpack_from('<H', data, pos)[0]
        if word >= 0x80:
            items.append({'offset': pos, 'glyph': word - 0x80}); pos += 2; continue
        spec = edition.commands.get(word) or series.COMMANDS.get(word)
        if spec is None:
            raise FormatError(f'{edition.title} {label}:{pos:#x} unknown command {word:#04x}')
        length, name, kind = spec
        if pos + length * 2 > end:
            raise FormatError(f'{edition.title} {label}:{pos:#x} {name} crosses section end')
        args = list(struct.unpack_from(f'<{length - 1}H', data, pos + 2)) if length > 1 else []
        items.append({'offset': pos, 'op': word, 'name': name, 'kind': kind, 'args': args}); pos += length * 2
    return items


def parse_script(edition, data, label, base_section):
    offsets, labels = series.section_table(data, label)
    bounds = offsets + [len(data)]
    sections = [{'section': base_section + i, 'offset': start, 'tokens': tokenize(edition, data, start, end, f'{label}#{i}')}
                for i, (start, end) in enumerate(zip(bounds, bounds[1:]))]
    starts = {(i, t['offset'] - bounds[i]) for i, s in enumerate(sections) for t in s['tokens']}
    for entry in labels:
        if (entry['section'], entry['offset']) not in starts:
            raise FormatError(f'{edition.title} {label} jump label inside a token: {entry}')
    return sections, labels


def scenario_targets(edition, rom):
    """The edition's scenario table: ascending LZ77 script blocks, checked one by one."""
    targets = []
    for index in range(len(edition.scenarios)):
        value = struct.unpack_from('<I', rom, edition.scenario_table + 4 * index)[0]
        if not ROM_BASE <= value < ROM_BASE + len(rom) or rom[value - ROM_BASE] != 0x10:
            raise FormatError(f'{edition.title} scenario table entry {index} invalid')
        targets.append(value - ROM_BASE)
    if any(b <= a for a, b in zip(targets, targets[1:])):
        raise FormatError(f'{edition.title} scenario table is not ascending')
    return targets


def scripts(edition, rom):
    """Every script block: (label, decompressed bytes, base section)."""
    targets = scenario_targets(edition, rom)
    std_offset, std = series.std_scripts(rom, targets[0])
    blocks = [('std', std, 0, std_offset)]
    for label, offset in zip(edition.scenarios, targets):
        data, _ = series.lz77(rom, offset)
        blocks.append((f'scenario_{label}', bytes(data), 0x80, offset))
    for offset in edition.extra_scripts:
        if rom[offset] != 0x10:
            raise FormatError(f'{edition.title} script block {offset:#x} is not LZ77')
        data, _ = series.lz77(rom, offset)
        blocks.append((f'code_{offset:x}', bytes(data), 0x80, offset))
    return blocks


def font(edition, rom):
    data = rom[edition.font_offset:edition.font_offset + edition.glyphs * GLYPH_BYTES]
    if hashlib.sha256(data).hexdigest() != edition.font_sha256:
        raise FormatError(f'{edition.title} font mismatch')
    return data


def read_review(edition, source):
    """A review document: the bundled one, or an explicitly selected file."""
    if isinstance(source, dict):
        return source
    if not Path(source).is_file():
        raise FormatError(f'{edition.title} review map not found: {source}')
    return json.loads(Path(source).read_text(encoding='utf-8'))


def bundled_reviews(edition):
    module = importlib.import_module(f'{__package__}.{edition.key}_charset')
    return module.charset_review(), module.names_review()


def load_charset(edition, path, rom):
    """Reviewed glyph map, strictly bound to this ROM's font bytes."""
    review = read_review(edition, path)
    font(edition, rom)
    if review.get('format') != edition.charset_format or review.get('font_sha256') != edition.font_sha256:
        raise FormatError(f'{edition.title} charset review does not match this font')
    mapping = {int(k): v for k, v in review['map'].items()}
    if sorted(mapping) != list(range(edition.glyphs)) or any(len(v) != 1 for v in mapping.values()):
        raise FormatError(f'{edition.title} charset review is incomplete')
    return mapping


def load_names(edition, path):
    review = read_review(edition, path)
    if review.get('format') != edition.names_format or review.get('rom_sha1') != edition.rom_sha1:
        raise FormatError(f'{edition.title} names review does not match this ROM')
    return review


def audit(edition, rom, charset=None):
    """Parse and audit every script; every referenced glyph must be reviewed."""
    census = {'scripts': 0, 'sections': 0, 'glyphs': set()}
    for label, data, base, _ in scripts(edition, rom):
        sections, labels = parse_script(edition, data, label, base)
        series.audit_references(sections, labels, label, base)
        census['scripts'] += 1; census['sections'] += len(sections)
        for section in sections:
            census['glyphs'].update(t['glyph'] for t in section['tokens'] if 'glyph' in t)
    outside = sorted(g for g in census['glyphs'] if g >= edition.glyphs or (charset is not None and g not in charset))
    if outside:
        raise FormatError(f'{edition.title} script glyphs outside the reviewed font: {outside[:8]}')
    return census


def episode_entries(edition, rom, charset):
    """Episode starts with titles from the game's own part-title text."""
    std = scripts(edition, rom)[0][1]
    sections, _ = parse_script(edition, std, 'std', 0)
    entries = []
    for number, first in enumerate(edition.episode_starts, 1):
        pages = series.section_pages(sections[edition.title_section + first]['tokens'], charset)
        title = pages[0]['text'].split('\n')[0].strip() if pages else ''
        if not title:
            raise FormatError(f'{edition.title} episode {number} title missing')
        entries.append({'id': f'episode-{number}', 'label': edition.episodes_label.format(n=number, title=title), 'scenario': first})
    return entries


def inspect(edition, path):
    rom = identify(edition, path)
    return {'identification': detect(edition, path),
            'source': {'size': len(rom), 'sha1': edition.rom_sha1, 'header': rom[0xA0:0xB2].decode('ascii')},
            'archives': {'scenario_table': edition.scenario_table, 'scenarios': len(edition.scenarios),
                         'container': 'GBA ROM: BIOS-LZ77 scenario scripts, 16x16 4bpp font'}}


def recover(edition, source, destination):
    rom = identify(edition, source)
    census = audit(edition, rom)
    destination = Path(destination)
    for label, data, _, _ in scripts(edition, rom):
        write_bytes(destination, f'scripts/{label}.bin', data)
    write_bytes(destination, 'font/charset.bin', font(edition, rom))
    summary = {'rom_sha1': edition.rom_sha1, 'scenario_table': edition.scenario_table, 'scripts': census['scripts'],
               'sections': census['sections'], 'used_glyphs': len(census['glyphs'])}
    write_json(destination, 'census.json', summary)
    return summary


def build(edition, source, output, charset_path=None, names_path=None):
    """Native import: the exact cartridge plus reviewed text maps.

    The bundled maps are the default; an explicit path or VNKIT_<KEY>_CHARSET /
    VNKIT_<KEY>_NAMES selects another review file with the same source checks.
    """
    rom = identify(edition, source)
    key = edition.key.upper()
    bundled_charset, bundled_names = bundled_reviews(edition)
    charset = load_charset(edition, charset_path or os.environ.get(f'VNKIT_{key}_CHARSET') or bundled_charset, rom)
    names = load_names(edition, names_path or os.environ.get(f'VNKIT_{key}_NAMES') or bundled_names)
    audit(edition, rom, charset)
    entries = episode_entries(edition, rom, charset)
    out = Path(output)
    rom_record = write_bytes(out, 'cartridge/rom.gba', rom)
    tags = {int(k): v for k, v in names['nametags'].items()}
    speakers = names.get('speakerNametags') or list(range(0x80))
    case_document = {
        'format': edition.case_format, 'version': 1, 'rom_sha1': edition.rom_sha1,
        'charset': [charset[i] for i in range(edition.glyphs)],
        'nametags': [tags.get(i, '') for i in range(max(tags, default=0) + 1)],
        'speakerNametags': speakers,
    }
    case_bytes = json.dumps(case_document, ensure_ascii=False, separators=(',', ':')).encode()
    write_bytes(out, 'case.json', case_bytes)
    case_sha = hashlib.sha256(case_bytes).hexdigest()
    content = {
        'format': 'vnkit.content', 'version': 1, 'id': edition.content_id, 'title': edition.title,
        'platform': {'id': 'gba', 'name': 'Game Boy Advance'}, 'viewport': {'width': 240, 'height': 160},
        'adapter': {'id': edition.adapter_id, 'version': edition.adapter_version},
        'runtime': {'id': edition.runtime_id, 'version': 1, 'rom_sha1': edition.rom_sha1,
                    'rom': {'url': 'cartridge/rom.gba', 'sha256': rom_record['sha256']},
                    'case': {'url': 'case.json', 'sha256': case_sha},
                    'font_sha256': edition.font_sha256, 'entries': entries},
        'assets': {'data:rom': {'type': 'data', 'url': 'cartridge/rom.gba', 'sha256': rom_record['sha256']},
                   'data:case': {'type': 'data', 'url': 'case.json', 'sha256': case_sha}},
        'compatibility': {'status': 'experimental', 'summary': limitation(edition),
                          'source': {'scenario_table': edition.scenario_table}},
    }
    write_bytes(out, 'content.json', (json.dumps(content, ensure_ascii=False, indent=2) + '\n').encode())
    return {'status': 'incomplete-runtime', 'adapter': edition.adapter_id, 'content': str(out / 'content.json'),
            'reason': limitation(edition), 'compatibility': content['compatibility']}
