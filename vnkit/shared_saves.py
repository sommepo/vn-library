"""Private home-server save bank. Atomic revision checks prevent stale writers.

No accounts/cloud or arbitrary storage paths. Execution-state validation remains
with the game adapter; this layer enforces bounded envelopes and identity.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import re

MAX_SAVE_REQUEST = 4 * 1024 * 1024
SLOTS = frozenset(['autosave', 'quicksave', 'before next choice', 'progress',
                   'progress-before-debug'] + [f'slot {i}' for i in range(1, 16)])


class SaveConflict(ValueError):
    pass


class SharedSaves:
    def __init__(self, folder):
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(folder / 'shared-saves.sqlite3', check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS save_banks (game TEXT PRIMARY KEY, signature TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL, records TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS save_history (game TEXT, revision INTEGER, signature TEXT, updated TEXT, records TEXT, PRIMARY KEY(game,revision))')
        self.db.execute('CREATE TABLE IF NOT EXISTS save_receipts (game TEXT, operation TEXT, digest TEXT NOT NULL, revision INTEGER NOT NULL, result TEXT NOT NULL, PRIMARY KEY(game,operation))')
        self.db.commit()

    def read(self, game):
        with self.lock:
            row = self.db.execute('SELECT signature,revision,updated,records FROM save_banks WHERE game=?', (game,)).fetchone()
        return {'format': 'vnkit.shared-saves', 'version': 1, 'gameId': game,
                'gameSignature': row[0] if row else None, 'revision': row[1] if row else 0,
                'updatedAt': row[2] if row else None, 'records': json.loads(row[3]) if row else {}}

    def update(self, game, body):
        if not isinstance(body, dict) or body.get('gameId') != game or body.get('format') != 'vnkit.shared-saves' or type(body.get('version')) is not int or body['version'] != 1:
            raise ValueError('Invalid save-bank identity or format')
        signature, revision, changes = body.get('gameSignature'), body.get('baseRevision'), body.get('changes')
        replace = body.get('replace', False)
        if type(replace) is not bool:
            raise ValueError('Invalid save-bank replacement mode')
        operation = body.get('operationId')
        if operation is not None and (not isinstance(operation, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', operation)):
            raise ValueError('Invalid save operation identity')
        if not isinstance(signature, str) or not 1 <= len(signature) <= 128 or type(revision) is not int or revision < 0:
            raise ValueError('Invalid signature or revision')
        if not isinstance(changes, dict) or (not changes and not replace) or any(name not in SLOTS for name in changes):
            raise ValueError('Invalid save-slot names')
        for name, value in changes.items():
            # Tombstones only remove save positions; never erase route progress
            # or study history through the slot API. They share normal CAS/receipts.
            if value is None and not replace and not name.startswith('progress'):
                continue
            fmt = 'vnkit.progress' if name.startswith('progress') else 'vnkit.save'
            if not isinstance(value, dict) or value.get('format') != fmt or type(value.get('version')) is not int or value['version'] != 1 or value.get('gameId') != game or value.get('gameSignature') != signature:
                raise ValueError('Save record is incompatible with this game/signature')
            field = 'globals' if fmt == 'vnkit.progress' else 'state'
            if not isinstance(value.get(field), dict):
                raise ValueError('Save record has no valid state')
            encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
            if len(encoded) > 512 * 1024:
                raise ValueError('Save record exceeds 512 KiB')
        with self.lock, self.db:
            old = self.read(game)
            digest = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()).hexdigest()
            receipt = self.db.execute('SELECT digest,revision,result FROM save_receipts WHERE game=? AND operation=?', (game, operation)).fetchone() if operation else None
            if receipt:
                if receipt[0] != digest:
                    raise ValueError('Save operation identity was reused with different data')
                if receipt[1] != old['revision']:
                    raise SaveConflict('Shared saves changed after this save. Reload shared saves before writing.')
                return json.loads(receipt[2])
            if old['revision'] != revision:
                raise SaveConflict('Shared saves changed on another device. Reload shared saves before writing.')
            if old['gameSignature'] is not None and old['gameSignature'] != signature:
                raise SaveConflict('Shared saves belong to a different content revision. Use local saves or a compatible import.')
            # Explicit whole-bank copies include route progress. Ordinary slot
            # writes/deletions retain their narrower semantics.
            records = {} if replace else dict(old['records'])
            for name, value in changes.items():
                if value is None:
                    records.pop(name, None)
                else:
                    records[name] = value
            encoded = json.dumps(records, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
            if len(encoded.encode('utf-8')) > MAX_SAVE_REQUEST:
                raise ValueError('Save bank exceeds 4 MiB')
            if records == old['records']:
                result = {k: v for k, v in old.items() if k != 'records'}
                self.remember(game, operation, digest, result)
                return result
            if old['revision']:
                self.db.execute('INSERT OR REPLACE INTO save_history VALUES (?,?,?,?,?)',
                                (game, old['revision'], old['gameSignature'], old['updatedAt'], json.dumps(old['records'], ensure_ascii=False)))
                self.db.execute('DELETE FROM save_history WHERE game=? AND revision NOT IN (SELECT revision FROM save_history WHERE game=? ORDER BY revision DESC LIMIT 20)', (game, game))
            updated = datetime.now(timezone.utc).isoformat()
            self.db.execute('INSERT OR REPLACE INTO save_banks VALUES (?,?,?,?,?)', (game, signature, revision + 1, updated, encoded))
            result = {'format': 'vnkit.shared-saves', 'version': 1, 'gameId': game,
                      'gameSignature': signature, 'revision': revision + 1, 'updatedAt': updated}
            self.remember(game, operation, digest, result)
            return result

    def remember(self, game, operation, digest, result):
        """Commit a bounded retry receipt in the same transaction as the bank."""
        if not operation:
            return
        self.db.execute('INSERT INTO save_receipts VALUES (?,?,?,?,?)',
                        (game, operation, digest, result['revision'], json.dumps(result)))
        self.db.execute('DELETE FROM save_receipts WHERE game=? AND rowid NOT IN (SELECT rowid FROM save_receipts WHERE game=? ORDER BY rowid DESC LIMIT 64)', (game, game))
