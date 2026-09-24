#!/usr/bin/env python3
"""Recover this PC-98 CD's files, without running its DOS installer.

This is resource recovery, not a playable import. Originals and every derived
file belong in a private workspace. See docs/yuno-pc98-investigation.md.
"""
import argparse
from collections import Counter
from dataclasses import asdict
import hashlib
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.cd_media import CueMedia
from vnkit.disc import IsoImage, write_bytes, write_json
from vnkit.adapters.yuno_pc98_archive import entries, expand_mes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='CUE/BIN directory, CUE or ZIP')
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--no-audio', action='store_true', help='inspect/extract data only; records omitted CDDA')
    args = parser.parse_args()
    with CueMedia(args.source) as source:
        media = source.normalize(args.work / 'media', audio=not args.no_audio)
    disc = IsoImage(args.work / 'media/data.iso')
    if (disc.volume_id != 'YU_NO' or b'ai5x start.mes' not in disc.read('YUNO.BAT').lower()
        or hashlib.sha256(disc.read('AI5X.EXE')).hexdigest() != '04f2e70a535208d5d9cb879b8f7ccde96c267aadad6907ff9760e8376b02893d'):
        raise ValueError('not the expected original PC-98 YU-NO CD')
    report = dict(format='vnkit.yuno-pc98-recovery', version=1,
                  platform={'id': 'pc98', 'name': 'PC-9800'},
                  media=media, files=[], executables={}, duplicate_resources=[], playable=False)
    for name in ['AI5X.EXE', 'INSTALL.EXE', 'AMD.COM', 'PLAY6.COM', 'YUNO.BAT', 'README.TXT', 'FLAG00', *[f'FLAG{n}{m}' for n in (1,2,3) for m in range(9)]]:
        data = disc.read(name)
        write_bytes(args.work / 'disc', name, data)
        report['executables'][name] = hashlib.sha256(data).hexdigest()
    counts = Counter()
    names = set()
    for letter in 'ABCDEFGHIJKLMNO':
        volume = f'YUNO_{letter}'
        data = disc.read(volume)
        write_bytes(args.work / 'disc', volume, data)
        for entry in entries(data):
            resource = data[entry.offset:entry.offset + entry.size]
            result = write_bytes(args.work / 'archive-resources' / volume, entry.name, resource)
            chosen = entry.name not in names
            record = dict(**asdict(entry), archive=volume, sha256=result['sha256'], selected=chosen)
            # AI5X 0000:841c searches volumes from A and returns the first match.
            # Keep both original copies and document the shadowed one.
            if chosen:
                decoded = expand_mes(resource) if entry.name.endswith('.MES') else resource
                prepared = write_bytes(args.work / 'resources', entry.name, decoded)
                record['decoded_sha256'] = prepared['sha256']
                record['decoded_size'] = prepared['size']
            else:
                report['duplicate_resources'].append(dict(name=entry.name, shadowed_archive=volume,
                    resolution='first volume in native A-to-T search order'))
            names.add(entry.name)
            report['files'].append(record)
            counts[Path(entry.name).suffix] += 1
    report['counts'] = dict(counts)
    write_json(args.work, 'recovery.json', report)
    print(f'Recovered {sum(counts.values())} source resources. This is not a playable import.')
    print(dict(counts))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(f'yuno-pc98-media: {error}')
