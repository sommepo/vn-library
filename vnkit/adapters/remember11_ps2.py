"""SLPM-65550 v1.02 disc recovery. The separate remember11_import module builds the runtime."""
import hashlib
from pathlib import Path
import re
import struct
from collections import Counter
from .. import __version__
from ..source import Source
from ..disc import FormatError, write_bytes as _write_bytes, write_stream, write_json
from ..png import encode
from .cri_afs import index_afs, unpack_lzss

ADAPTER_ID = 'remember11-ps2'
ADAPTER_VERSION = '0.1.0-recovery'
EXE = 'SLPM_655.50'
EXE_SHA256 = '644566b01b67e5795a3ac5064a70e69f777e77a7de855d514594dbd7e3949e92'
ARCHIVES = ('MAC.AFS', 'BG.AFS', 'EV.AFS', 'CHR.AFS', 'BGM.AFS', 'SE.AFS', 'VOICE.AFS', 'ETC.AFS')


def write_bytes(*args):
    # Run status is not content identity; manifests must match on exact reruns.
    result = _write_bytes(*args)
    return {k:v for k,v in result.items() if k != 'status'}


def detect(source):
    s = Source(source)
    if EXE not in s.entries or 'SYSTEM.CNF' not in s.entries:
        return {'supported': False, 'reason': 'Remember11 SLPM-65550 not detected'}
    cnf = s.read_at('SYSTEM.CNF').decode('ascii')
    digest = hashlib.sha256(s.read_at(EXE)).hexdigest()
    supported = EXE in cnf and 'VER = 1.02' in cnf and digest == EXE_SHA256 and all(n in s.entries for n in ARCHIVES)
    return {'supported': supported, 'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
            'title': 'Remember11 -the age of infinity-', 'platform': 'PlayStation 2',
            'edition': 'Japanese standard edition SLPM-65550', 'version': '1.02',
            'engine': 'KID PS2; binary MAC scenarios (not HuneX/RealLive)',
            'confidence': 'high for tested disc/executable; no general KID compatibility claim',
            'capability': 'edition-specific incomplete KID runtime through remember11_import', 'playable': True,
            'executable_sha256': digest, 'system_cnf': cnf,
            'reason': 'Tested edition; incomplete source-script reader available' if supported else 'Untested executable/version or incomplete disc'}


def inspect(source, fingerprint=False):
    identity = detect(source)
    if not identity['supported']:
        raise FormatError(identity['reason'])
    s = Source(source)
    archives = {name: index_afs(s, name) for name in ARCHIVES}
    return {'identification': identity, 'archives': archives,
            **({'source': s.fingerprint()} if fingerprint else {})}


def extract(source, destination):
    report = inspect(source, True); s = Source(source); records = []
    for archive, members in report['archives'].items():
        for e in members:
            path = f"{archive}/{e['index']:05d}-{e['name']}"
            saved = write_stream(Path(destination), path, s.chunks(archive, e['offset'], e['size']))
            saved.pop('status', None)
            records.append({'archive': archive, **e, 'output': saved})
    manifest = {'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION, 'tool_version': __version__,
                'source': report['source'], 'members': records, 'status': 'extraction-only', 'playable': False}
    write_json(Path(destination), 'manifest.json', manifest)
    return {'status': 'extraction-only', 'playable': False, 'members': len(records), 'manifest': str(Path(destination)/'manifest.json')}


# Candidate byte spans only: no instruction parsing, script order or story claims.
CP932_RUN = re.compile(rb'(?:[\x20-\x7e\xa1-\xdf]|[\x81-\x9f\xe0-\xfc][\x40-\x7e\x80-\xfc]){8,}\x00')

def text_candidates(data, source_id):
    candidates = []
    for match in CP932_RUN.finditer(data):
        raw = match.group()[:-1]
        try:
            text = raw.decode('cp932', errors='strict')
        except UnicodeDecodeError:
            continue
        if not re.search('[\u3040-\u30ff\u3400-\u9fff]', text):
            continue
        candidates.append({'id': f'{source_id}:{match.start():08x}', 'offset': match.start(),
                           'bytes': len(raw), 'raw_hex': raw.hex(), 'text': text,
                           'classification': 'candidate string, NOT executed dialogue'})
    return candidates


def thumbnail_png(data):
    """Only the measured single-image, linear RGBA32 TIM2 thumbnail variant."""
    if len(data) < 64 or data[:4] != b'TIM2' or data[4:8] != b'\x04\x00\x01\x00':
        raise FormatError('Unsupported TIM2 header')
    total, clut, size, header = struct.unpack_from('<IIIH', data, 16)
    width, height = struct.unpack_from('<HH', data, 36)
    if header != 48 or clut != 0 or data[35] != 3 or size != width*height*4 or total != size+header or 16+total != len(data):
        raise FormatError('Unsupported TIM2 pixel layout')
    rgba = bytearray(data[64:])
    for i in range(3, len(rgba), 4):
        rgba[i] = min(255, rgba[i]*255//128)
    return encode(width, height, rgba)


def import_game(source, out):
    out = Path(out); s = Source(source); inventory = inspect(source, True); records = []
    script_reports = []; controls = Counter(); candidates_count = 0; script_failures = []
    for e in inventory['archives']['MAC.AFS']:
        source_id = f"MAC.AFS/{e['index']:05d}-{e['name']}"
        raw = s.read_at('MAC.AFS', e['offset'], e['size'])
        records.append({'source': source_id, 'kind': 'original', **write_bytes(out, f'raw/{source_id}', raw)})
        try:
            decoded = unpack_lzss(raw)
            records.append({'source': source_id, 'kind': 'decompressed', **write_bytes(out, f'decoded/{source_id}', decoded)})
            candidates = text_candidates(decoded, source_id)
            candidates_count += len(candidates)
            for c in candidates:
                controls.update(re.findall(r'%[A-Za-z]+', c['text']))
            record = {'source': source_id, 'decoded_bytes': len(decoded), 'sha256': hashlib.sha256(decoded).hexdigest(),
                      'candidate_strings': len(candidates), 'has_psp_text_sentinel': b'\xff'*8 in decoded,
                      'first_bytes': decoded[:16].hex(), 'execution': 'unsupported'}
            write_json(out, f'text-candidates/{e["index"]:05d}.json', candidates)
            script_reports.append(record)
        except FormatError as error:
            script_failures.append({'source': source_id, 'error': str(error)})
    for n in ['SYSTEM.CNF', EXE, 'FILE.DIR', 'INIT.BIN']:
        raw = s.read_at(n);records.append({'source': n, 'kind': 'original', **write_bytes(out, f'raw/{n}', raw)})
    init = unpack_lzss(s.read_at('INIT.BIN'));records.append({'source': 'INIT.BIN', 'kind': 'decompressed', **write_bytes(out, 'decoded/INIT.BIN', init)})
    samples = []
    for archive in ARCHIVES:
        if archive == 'MAC.AFS':
            continue
        for e in inventory['archives'][archive][:2]:
            name = f"{archive}/{e['index']:05d}-{e['name']}";raw = s.read_at(archive, e['offset'], e['size'])
            records.append({'source': name, 'kind': 'original sample', **write_bytes(out, f'samples/raw/{name}', raw)})
            record = {'source': name, 'raw_bytes': len(raw)}
            if e['name'].endswith(('.BIP','.T2P','.FOP')):
                try:
                    decoded = unpack_lzss(raw);record.update(decoded_bytes=len(decoded), header_hex=decoded[:32].hex())
                    records.append({'source': name, 'kind': 'decompressed sample', **write_bytes(out, f'samples/decoded/{name}', decoded)})
                    if e['name'].endswith('.T2P'):
                        png = thumbnail_png(decoded)
                        records.append({'source': name, 'kind': 'original-size thumbnail', **write_bytes(out, f'samples/previews/{name}.png', png)})
                        record['preview'] = 'decoded original thumbnail; not a full-resolution scene'
                except FormatError as error:
                    record['error'] = str(error)
            samples.append(record)
    report = {'status': 'blocked', 'playable': False, 'identification': inventory['identification'],
              'source': inventory['source'], 'archive_members': sum(map(len, inventory['archives'].values())),
              'archives': {a: len(v) for a,v in inventory['archives'].items()}, 'script_resources': script_reports,
              'script_failures': script_failures, 'candidate_strings': candidates_count, 'text_control_candidates': dict(controls),
              'samples': samples, 'init_decoded_bytes': len(init),
              'execution': {'instructions_implemented': 0, 'segments_executed': 0,
                            'blocker': 'PS2 KID binary control flow, variables, choices and resource associations have no interpreter here'},
              'warnings': ['Static candidate strings are not recovered story order or fully parsed Japanese formatting.',
                           'BGM samples are sequenced IECS banks, not decoded music tracks.',
                           'Full-resolution BIP graphics and native TIPS/chronology are not converted.',
                           'No game binaries were executed; no original-console comparison performed.']}
    write_json(out, 'inventory.json', inventory)
    write_json(out, 'compatibility.json', report)
    write_json(out, 'manifest.json', {'adapter': ADAPTER_ID, 'adapter_version': ADAPTER_VERSION,
               'tool_version': __version__, 'source': inventory['source'], 'settings': {'scope': 'all MAC resources, INIT, two samples per remaining archive'},
               'outputs': records, 'warnings': report['warnings'], 'status': 'blocked'})
    write_json(out, 'content.json', {'format': 'vnkit.content', 'version': 1, 'id': 'remember11-slpm65550-1.02',
               'title': 'Remember11 — recovery only (not playable)', 'assets': {}, 'instructions': [],
               'compatibility': {'status': 'blocked', 'summary': report['execution']['blocker']}})
    return {'status': 'blocked', 'playable': False, 'archives': report['archives'], 'script_resources_decompressed': len(script_reports),
            'script_failures': script_failures, 'candidate_strings': candidates_count,
            'report': str(out/'compatibility.json'), 'reason': report['execution']['blocker']}
