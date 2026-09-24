"""Read-only recovery of the tested Ever17 Premium Edition PS2 disc."""
import hashlib
from pathlib import Path
from .. import __version__
from ..source import Source
from ..disc import FormatError, write_stream, write_json
from .cri_afs import index_afs

ADAPTER_ID = 'ever17-ps2'
ADAPTER_VERSION = '0.1.0'
EXE = 'SLPM_654.21'
EXE_SHA256 = '7bd43ef8ba43090eee7f54ef83ffdd5779834ef7b7f825c8e5a33663dc37e17b'
ARCHIVES = ('MAC.AFS', 'BG.AFS', 'EV.AFS', 'CHR.AFS', 'BGM.AFS', 'SE.AFS', 'VOICE.AFS', 'ETC.AFS')


def detect(source):
    s = Source(source)
    if EXE not in s.entries or 'SYSTEM.CNF' not in s.entries:
        return {'supported': False, 'reason': 'Ever17 SLPM-65421 not detected'}
    cnf = s.read_at('SYSTEM.CNF').decode('ascii', 'strict')
    digest = hashlib.sha256(s.read_at(EXE)).hexdigest()
    supported = EXE in cnf and 'VER = 1.01' in cnf and digest == EXE_SHA256 and all(a in s.entries for a in ARCHIVES)
    return {'supported': supported, 'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
            'title': 'Ever17 — the out of infinity — Premium Edition',
            'platform': 'PlayStation 2', 'edition': 'Japanese Premium Edition SLPM-65421',
            'version': '1.01', 'engine': 'KID PS2 MAC; Remember11-related revision',
            'confidence': 'high; exact executable and archive checks',
            'executable_sha256': digest, 'system_cnf': cnf,
            'playable': supported, 'capability': 'source-script routes; native presentation incomplete',
            'reason': 'Tested disc' if supported else 'Untested executable/version or incomplete disc'}


def inspect(source, fingerprint=False):
    identity = detect(source)
    if not identity['supported']:
        raise FormatError(identity['reason'])
    s = Source(source)
    return {'identification': identity, 'archives': {a: index_afs(s, a) for a in ARCHIVES},
            **({'source': s.fingerprint()} if fingerprint else {})}


def extract(source, destination):
    report = inspect(source, True)
    s = Source(source)
    records = []
    for archive, members in report['archives'].items():
        for member in members:
            rel = f"{archive}/{member['index']:05d}-{member['name']}"
            saved = write_stream(Path(destination), rel, s.chunks(archive, member['offset'], member['size']))
            saved.pop('status', None)
            records.append({'archive': archive, **member, 'output': saved})
    write_json(Path(destination), 'manifest.json', {
        'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION, 'tool_version': __version__,
        'source': report['source'], 'members': records, 'status': 'extraction-only', 'playable': False})
    return {'status': 'extraction-only', 'members': len(records), 'playable': False}
