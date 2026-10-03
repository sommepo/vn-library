"""Build a source-driven Gyakuten Saiban 2 reader import.

Scripts are stored as their exact decompressed 16-bit words and executed by
web/adapters/gs2-engine.mjs. Text and speaker names come from
the reviewed maps in gs2_charset.py, bound to this ROM. Only episodes whose native processes are
implemented are admitted; everything else stays fail-closed in the engine.
"""
import hashlib
import json
import os
from pathlib import Path

from ..disc import FormatError, write_bytes
from . import gs2_charset, gs2_gba as g

CONTENT_ID = 'gs2-agb-a3gj'
LIMITATION = ('Gyakuten Saiban 2 native runtime: the cartridge runs on the original-code GBA machine; '
              'text pages and choices are read from native state. Device timing is emulated, not measured '
              'against hardware; see the runtime guide.')


def review_source(env, bundled):
    """The bundled review, unless an environment variable selects a file."""
    return Path(os.environ[env]) if os.environ.get(env) else bundled


def load_names(path, rom_sha1):
    if isinstance(path, dict):
        review = path
    elif not Path(path).is_file():
        raise FormatError(f'GS2 review map not found: {path}')
    else:
        review = json.loads(Path(path).read_text(encoding='utf-8'))
    if review.get('format') != 'gs2-gba-names-review-v1' or review.get('rom_sha1') != rom_sha1:
        raise FormatError('GS2 names review does not match this ROM')
    return review


def build(source, output, charset_path=None, names_path=None):
    rom = g.identify(source)
    charset = g.load_charset(charset_path or review_source('VNKIT_GS2_CHARSET', gs2_charset.charset_review()), rom)
    names = load_names(names_path or review_source('VNKIT_GS2_NAMES', gs2_charset.names_review()), g.ROM_SHA1)
    # Static audit of every script and table still gates the import.
    table_offset, targets = g.scenario_table(rom)
    std_offset, std = g.std_scripts(rom, targets[0])
    g.audit_references(*g.parse_script(std, 'std', 0), 'std', 0)
    for label, offset in zip(g.SCENARIOS, targets):
        data, _ = g.lz77(rom, offset)
        g.audit_references(*g.parse_script(data, label, 0x80), label, 0x80)
    case = g.case_tables(rom)
    std_sections, _ = g.parse_script(std, 'std', 0)
    entries = []
    for number, first in enumerate((0, 2, 8, 14), 1):
        pages = g.section_pages(std_sections[7 + first]['tokens'], charset)
        title = pages[0]['text'].split('\n')[0].strip() if pages else ''
        if not title:
            raise FormatError(f'GS2 episode {number} title missing')
        entries.append({'id': f'episode-{number}', 'label': f'第{number}話　{title}', 'scenario': first})
    out = Path(output)
    rom_record = write_bytes(out, 'cartridge/rom.gba', rom)
    case_document = {
        'format': 'vnkit.gs2-case', 'version': 2, 'rom_sha1': g.ROM_SHA1,
        'charset': [charset[i] for i in range(g.FONT_USED_GLYPHS)],
        'nametags': [names['nametags'].get(str(i), '') for i in range(0x2F)],
        'speakerNametags': case['speakerNametags'],
    }
    case_bytes = json.dumps(case_document, ensure_ascii=False, separators=(',', ':')).encode()
    write_bytes(out, 'case.json', case_bytes)
    assets = {'data:rom': {'type': 'data', 'url': 'cartridge/rom.gba', 'sha256': rom_record['sha256']},
              'data:case': {'type': 'data', 'url': 'case.json', 'sha256': hashlib.sha256(case_bytes).hexdigest()}}
    content = {
        'format': 'vnkit.content', 'version': 1, 'id': CONTENT_ID, 'title': '逆転裁判2',
        'platform': {'id': 'gba', 'name': 'Game Boy Advance'}, 'viewport': {'width': 240, 'height': 160},
        'adapter': {'id': g.ADAPTER_ID, 'version': g.ADAPTER_VERSION},
        'runtime': {'id': 'gs2-gba-native', 'version': 1, 'rom_sha1': g.ROM_SHA1,
                    'rom': {'url': 'cartridge/rom.gba', 'sha256': rom_record['sha256']},
                    'case': {'url': 'case.json', 'sha256': hashlib.sha256(case_bytes).hexdigest()},
                    'font_sha256': g.FONT_SHA256, 'entries': entries},
        'assets': assets, 'compatibility': {'status': 'experimental', 'summary': LIMITATION,
                                            'source': {'scenario_table': table_offset, 'std_scripts': std_offset}},
    }
    write_bytes(out, 'content.json', (json.dumps(content, ensure_ascii=False, indent=2) + '\n').encode())
    return {'status': 'incomplete-runtime', 'adapter': g.ADAPTER_ID, 'content': str(out / 'content.json'),
            'reason': LIMITATION, 'compatibility': content['compatibility']}


def import_game(source, output, work=None):
    return build(source, output)
