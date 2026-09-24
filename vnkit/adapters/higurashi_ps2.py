"""Resource recovery and source-driven import for Higurashi Matsuri Kakera Asobi SLPM-66913.

Only the tested PS2 standalone edition is admitted.
"""
from pathlib import Path
import argparse
from collections import Counter
import hashlib
import json
from ..source import Source
from .. import __version__
from ..disc import FormatError, write_json, write_bytes
from .shin_ps2 import Rom

ADAPTER_ID = 'higurashi-matsuri-ps2'
ADAPTER_VERSION = '0.1.0'
EXE = 'SLPM_669.13'
EXE_SHA256 = '160fd33e89aec97bda32ad44cc28757f3f97caa2e4ad8fe8863a9ea105a5f750'
ROM_BASE = 0x222e0000  # ELF 0x13ea2c..34 supplies LBA 0x445c0 to 0x12ff78.


def detect(path):
    source = Source(path)
    if not Path(path).is_file() or EXE not in source.entries or 'SYSTEM.CNF' not in source.entries:
        return {'supported': False, 'reason': 'Needs the original SLPM-66913 ISO; ISO file extraction omits raw-sector resources'}
    digest = hashlib.sha256(source.read_at(EXE)).hexdigest()
    cnf = source.read_at('SYSTEM.CNF').decode('ascii')
    supported = digest == EXE_SHA256 and EXE in cnf and 'VER = 1.01' in cnf
    return {'supported': supported, 'playable': True, 'adapter': ADAPTER_ID,
            'adapter_version': ADAPTER_VERSION,
            'title': 'ひぐらしのなく頃に祭 カケラ遊び',
            'edition': 'Japanese PS2 standalone SLPM-66913', 'version': '1.01',
            'platform': 'PlayStation 2', 'engine': 'Shin PS2 ROM 1.4 / SNR variant',
            'executable_sha256': digest,
            'confidence': 'exact executable fingerprint and native ROM loader',
            'reason': 'Source-driven reader; native presentation remains incomplete' if supported else 'Untested executable revision'}


def inspect(path, fingerprint=False):
    identity = detect(path)
    if not identity['supported']:
        raise FormatError(identity['reason'])
    rom = Rom(path, ROM_BASE)
    return {'identification': identity,
            'source': Source(path).fingerprint() if fingerprint else {},
            'archives': {'raw-rom': rom.manifest()},
            'extensions': dict(Counter(Path(m.name).suffix for m in rom.members))}


def extract(source, destination, members=None):
    report = inspect(source, fingerprint=True)
    rom = Rom(source, ROM_BASE)
    records = rom.extract(destination, members)
    for name in (EXE, 'SYSTEM.CNF'):
        write_bytes(destination, name, Source(source).read_at(name))
    report.update(outputs=records, playable=False, toolkit_version=__version__,
                  settings={'selected_members': members},
                  warnings=['Resource recovery is not a reader import.',
                            'Use import to prepare this recovery for the reader.'])
    previous=Path(destination)/'recovery-manifest.json'
    if previous.exists():
        old=json.loads(previous.read_text())
        for key in ('source','archives','extensions','outputs'):
            if old.get(key)!=report.get(key):raise FormatError('Changed recovery manifest: '+key)
    else:write_json(destination, 'recovery-manifest.json', report)
    return {'status': 'recovered', 'members': len(records), 'out': str(destination),
            'playable': False, 'manifest': 'recovery-manifest.json'}


def import_game(source, destination):
    identity = detect(source)
    if not identity['supported']:
        raise FormatError(identity['reason'])
    from .higurashi_import import import_game as convert
    return convert(source,destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--member', action='append', help='Extract just this exact ROM path; repeatable')
    parser.add_argument('--fingerprint', action='store_true')
    args = parser.parse_args()
    try:
        if args.out:
            print(json.dumps(extract(args.source, args.out, args.member)))
        else:
            report = inspect(args.source, args.fingerprint)
            report['archives']['raw-rom']['members'] = len(report['archives']['raw-rom']['members'])
            print(json.dumps(report, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f'higurashi recovery: {error}\n')


if __name__ == '__main__':
    main()
