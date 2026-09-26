"""Short-lived, bounded media contexts for an explicit dictionary lookup.

No collection polling, screen recording, dialogue feed or Anki credentials.
Only an unguessable context capability can retrieve its image and source voice.
"""
import base64
from collections import OrderedDict
import hashlib
import re
import struct
import threading
import time

MAX_IMAGE = 4 * 1024 * 1024
MAX_AUDIO = 24 * 1024 * 1024
MAX_REQUEST = 6 * 1024 * 1024
TOKEN = re.compile(r'^[a-f0-9]{64}$')


class MiningContexts:
    def __init__(self, clock=time.monotonic, ttl=7200, budget=64*1024*1024, limit=128):
        self.clock, self.ttl, self.budget, self.limit = clock, ttl, budget, limit
        self.items = OrderedDict()
        self.bytes = 0
        self.lock = threading.RLock()

    def prune(self):
        now = self.clock()
        for key, (deadline, size, _) in list(self.items.items()):
            if deadline <= now:
                self.bytes -= size
                del self.items[key]

    def put(self, payload, content, folder, resolve):
        if not isinstance(payload, dict) or not TOKEN.fullmatch(payload.get('context', '')):
            raise ValueError('Invalid mining context')
        for key, limit in [('gameId', 256), ('segmentId', 4096), ('occurrenceId', 256), ('sentence', 32000)]:
            if not isinstance(payload.get(key), str) or not 0 < len(payload[key]) <= limit:
                raise ValueError('Invalid mining '+key)
        if payload['gameId'] != content['id']:
            raise ValueError('Wrong game')
        png = base64.b64decode(payload.get('image', ''), validate=True)
        if not 33 <= len(png) <= MAX_IMAGE or png[:8] != b'\x89PNG\r\n\x1a\n' or png[12:16] != b'IHDR':
            raise ValueError('Expected a bounded PNG scene image')
        width, height = struct.unpack('>II', png[16:24])
        if not 1 <= width <= 2048 or not 1 <= height <= 2048:
            raise ValueError('Scene dimensions exceed limit')
        voice = payload.get('voice')
        audio = None
        if voice is not None:
            asset = content.get('assets', {}).get(voice)
            if not asset or asset.get('type') not in ('voice', 'audio'):
                raise ValueError('Voice is not a registered dialogue asset')
            path = resolve(folder, asset['url'])
            if path.suffix.lower() not in ('.wav', '.flac', '.mp3', '.ogg', '.m4a') or path.stat().st_size > MAX_AUDIO:
                raise ValueError('Unsupported or oversized source voice')
            # Retain a validated path, not a client-supplied URL. Read only on Add.
            audio = (path, path.stat().st_size, path.stat().st_mtime_ns)
        record = {k: payload[k] for k in ('gameId', 'segmentId', 'occurrenceId', 'sentence')}
        record.update(image=png, audio=audio)
        size = len(png) + len(payload['sentence'].encode('utf-8')) + 8192
        if size > self.budget:
            raise ValueError('Mining image exceeds cache budget')
        with self.lock:
            self.prune()
            key = payload['context']
            if key in self.items:
                if self.items[key][2] != record:
                    raise ValueError('Mining contexts are immutable')
                return
            while self.items and (self.bytes + size > self.budget or len(self.items) >= self.limit):
                _, (_, old_size, _) = self.items.popitem(last=False)
                self.bytes -= old_size
            self.items[key] = (self.clock()+self.ttl, size, record)
            self.bytes += size

    def get(self, key):
        with self.lock:
            self.prune()
            if not isinstance(key, str) or not TOKEN.fullmatch(key) or key not in self.items:
                raise KeyError('Mining context expired. Look up the word again on its original line.')
            record = self.items[key][2].copy()
        def media(data, ext):
            return {'filename': 'vn-library-'+hashlib.sha256(data).hexdigest()+ext,
                    'data': base64.b64encode(data).decode('ascii')}
        image = media(record.pop('image'), '.png')
        source = record.pop('audio')
        audio = None
        if source:
            path, size, mtime = source
            info = path.stat()
            if (info.st_size, info.st_mtime_ns) != (size, mtime):
                raise ValueError('Source voice changed; look up this line again')
            with path.open('rb') as stream:
                data = stream.read(MAX_AUDIO+1)
            if len(data) != size:
                raise ValueError('Source voice changed or exceeds limit')
            audio = media(data, path.suffix.lower())
        return {'format': 'vn-library.mining', 'version': 1, **record,
                'image': image, 'audio': audio, 'audioPolicy': 'complete-source-voice'}
