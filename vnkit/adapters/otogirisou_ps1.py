"""Exact Otogirisou PS1 recovery; the bundled Machi demo is kept separate."""
from pathlib import Path
import sys

from . import chunsoft_ps1 as shared

ADAPTER_ID = 'otogirisou-ps1'
ADAPTER_VERSION = '0.3.0'
TITLE = '弟切草 蘇生篇'
EDITION = 'Japanese PS1 SLPS-01645 (exact executable)'
EXECUTABLE = 'SLPS_016.45'
EXE_SHA256 = '4692c8dc46f56794fd1e62bf0bf431ae503eaddc308b7ff6b99f7c03e45541b2'
CNF_SHA256 = 'f0f60cd54aefb2ce5cc418c62cd11f4708137af4758615f6b99a6ec83a881af7'


def identify(path):
    return shared.identify(path, EXECUTABLE, EXE_SHA256, CNF_SHA256)


def detect(path):
    return shared.detection(path, sys.modules[__name__])


def resources(disc):
    return [e for e in disc.entries if not e.directory and e.path == 'CDIMG.BIN']


def inspect(path, fingerprint=False):
    disc, _ = identify(path)
    result = {'identification': detect(path), 'archives': {
        'format': 'CDIMG native LBA resources; loose SNB/SBB/GSF belong to the Machi demo',
        'resource_files': len(resources(disc))}}
    if fingerprint:
        result['source'] = shared.source_fingerprint(disc)
    return result


def recover(path, output):
    disc, exe = identify(path)
    out = Path(output)
    files = [shared.record_file(out, f'original/{EXECUTABLE}', exe)]
    entries = resources(disc)
    for entry in entries:
        files.append(shared.record_file(out, 'original/' + entry.path, disc.read(entry)))
    return shared.finish_recovery(out, sys.modules[__name__], disc, files,
                                  summary={'game_containers': len(entries)},
                                  media_status='CDIMG and original STR movies remain unconverted; Machi demo excluded')


def extract(path, output):
    return recover(path, output)


def import_game(path, output):
    return recover(path, output)
