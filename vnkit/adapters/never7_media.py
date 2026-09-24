"""Bounded reuse trial of the existing VGMTrans tool on one Never7 bank.

This exports research MIDI/SF2, not finished reader music: Never7's two SQ streams
need native mixing validation. Run only a locally installed tool, never disc code.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

from .never7_ps2 import detect, probe_sq
from ..disc import FormatError, write_bytes, write_json
from ..source import Source
from ..sony_sequence import VGMTRANS_REVISION


def probe(source, destination, vgmtrans):
    if not detect(source)['supported']: raise FormatError('Never7 edition mismatch')
    s = Source(source); out = Path(destination).resolve(); out.mkdir(parents=True, exist_ok=True)
    if any((out/n).exists() for n in ('Sony PS2 Seq.mid', 'Sony PS2 Seq.sf2')):
        raise FormatError('Use a new probe directory; existing exports are preserved')
    records = []
    for name, suffix in [('A040/A043.', 'hd'), ('A040/A044.', 'sq'), ('A040/A045.', 'bd')]:
        result = write_bytes(out, 'bank.'+suffix, s.read_at(name)); result.pop('status', None)
        records.append({'source': name, **result})
    tool = Path(vgmtrans).resolve()
    env = {**os.environ, 'XDG_CONFIG_HOME': str(out/'tool-config')}
    proc = subprocess.run([str(tool), *[str(out/('bank.'+ext)) for ext in ('sq', 'hd', 'bd')]],
                          input=b'collection list\ncollection export 0 .\nexit\n',
                          capture_output=True, cwd=out, timeout=45, env=env)
    write_bytes(out, 'export.log', proc.stdout+proc.stderr)
    if proc.returncode: raise FormatError(f'VGMTrans failed ({proc.returncode}); private export.log has details')
    midi = (out/'Sony PS2 Seq.mid').read_bytes(); sf2 = (out/'Sony PS2 Seq.sf2').read_bytes()
    if midi[:4] != b'MThd' or sf2[:4] != b'RIFF' or sf2[8:12] != b'sfbk':
        raise FormatError('Missing or invalid exported MIDI/SoundFont')
    report = {'status': 'export-probe-only', 'source': records,
              'tool_sha256': hashlib.sha256(tool.read_bytes()).hexdigest(),
              'expected_tool_revision': VGMTRANS_REVISION,
              'midi_bytes': len(midi), 'sf2_bytes': len(sf2),
              'sq': probe_sq((out/'bank.sq').read_bytes()),
              'warnings': ['Exporter reports overlapping-note warnings in export.log.',
                           'MIDI/SF2 export is not proof that both native sequence streams are rendered.',
                           'No listening or original PS2 comparison performed.']}
    write_json(out, 'probe.json', report)
    return {k: report[k] for k in ('status', 'midi_bytes', 'sf2_bytes', 'warnings')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--vgmtrans', type=Path, required=True)
    args = parser.parse_args()
    try: print(json.dumps(probe(args.source, args.out, args.vgmtrans), indent=2))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(2, f'Never7 music probe: {error}\n')


if __name__ == '__main__': main()
