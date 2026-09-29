"""Exact PS1 Kamaitachi resource recovery; reader conversion is a separate pipeline."""
from dataclasses import asdict
from pathlib import Path
import sys

from . import chunsoft_ps1 as shared

ADAPTER_ID = 'kamaitachi-ps1'
ADAPTER_VERSION = '0.3.0'
TITLE = 'かまいたちの夜 特別篇'
EDITION = 'Japanese PS1 SLPS-01794 (exact executable)'
EXECUTABLE = 'SLPS_017.94'
EXE_SHA256 = '38f6248c7dc0cc409fcecab51ba0c03d4ca541af71c8227e0de22eefe9f0d31a'
CNF_SHA256 = 'fe641a8f10195a15316c153323d5d38fb4a0e4954e66eeb6797100baf64cf631'


def identify(path):
    return shared.identify(path, EXECUTABLE, EXE_SHA256, CNF_SHA256)


def detect(path):
    return shared.detection(path, sys.modules[__name__])


def archives(disc):
    return [(entry, shared.pac_index(disc.read_at(entry.offset, min(8192, entry.size)), entry.size))
            for entry in disc.entries if entry.path.endswith('.PAC') and not entry.directory]


def inspect(path, fingerprint=False):
    disc, _ = identify(path)
    items = archives(disc)
    result = {'identification': detect(path), 'archives': {
        'format': 'LE16 ID/sector PAC', 'count': len(items),
        'members': sum(len(rows) for _, rows in items)}}
    if fingerprint:
        result['source'] = shared.source_fingerprint(disc)
    return result


def recover(path, output, *, all_members=False):
    disc, exe = identify(path)
    out = Path(output)
    files = [shared.record_file(out, f'original/{EXECUTABLE}', exe)]
    index, compressed, scenarios, opaque_ike = [], 0, 0, 0
    for entry, members in archives(disc):
        rows = []
        for member in members:
            row = asdict(member)
            if all_members or entry.path in ('SCE.PAC', 'BIN.PAC'):
                raw = disc.read_at(entry.offset + member.offset, member.size)
                name = f'{Path(entry.path).stem}/{member.id:04x}.bin'
                files.append(shared.record_file(out, 'stored/' + name, raw))
                if raw[2:5] == b'ike':
                    decoded, consumed = shared.unpack_ike(raw)
                    files.append(shared.record_file(out, 'decoded/' + name, decoded))
                    row.update(compression='ike', consumed=consumed, decoded_size=len(decoded))
                    compressed += 1
                else:
                    row['compression'] = 'opaque-or-uncompressed'
                if entry.path == 'SCE.PAC':
                    scenarios += 1
            rows.append(row)
        index.append({'path': entry.path, 'members': rows})
    return shared.finish_recovery(out, sys.modules[__name__], disc, files,
                                  archive_index=index,
                                  summary={'archives': len(index),
                                           'members': sum(len(a['members']) for a in index),
                                           'scenario_resources': scenarios, 'decoded_ike': compressed,
                                           'opaque_ike': opaque_ike})


def extract(path, output):
    return recover(path, output, all_members=True)


def import_game(path, output):
    return recover(path, output)
