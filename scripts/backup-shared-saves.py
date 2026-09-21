#!/usr/bin/env python3
"""Consistent, no-clobber SQLite backup; no server downtime required."""
import argparse
from pathlib import Path
import os
import sqlite3
import tempfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--state', type=Path, default=root / 'private/state')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
source = (args.state / 'shared-saves.sqlite3').resolve()
try:
    if not source.is_file():
        raise ValueError('No shared-save database exists at this state path.')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists() or args.out.is_symlink():
        raise ValueError('Refusing to overwrite an existing backup.')
    with tempfile.TemporaryDirectory(prefix='.vnkit-backup-', dir=args.out.parent) as temporary:
        destination = Path(temporary) / 'shared-saves.sqlite3'
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(destination) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Backup integrity check failed.')
        src.close()
        dst.close()
        os.link(destination, args.out)  # Atomic publication; never replaces a file.
    print(f'Shared saves backed up to {args.out.resolve()}')
except (ValueError, OSError, sqlite3.Error) as error:
    parser.exit(2, f'Backup failed: {error}\n')
