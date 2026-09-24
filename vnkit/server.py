"""Dependency-free, loopback-first HTTP and RFC6455 text publisher.

No disc paths are served. Only web/, explicitly registered content roots and
the original fixture are reachable. Relay SQLite stores occurrence IDs, not
dialogue. A separate private SQLite bank stores explicitly opted-in game saves.
"""
from __future__ import annotations
from .platforms import content_platform
import base64
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import secrets
import select
import socket
import sqlite3
import ssl
import struct
import threading
from .import_jobs import ImportJobs, CHUNK
from .shared_saves import SharedSaves, SaveConflict, MAX_SAVE_REQUEST
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote

ROOT = Path(__file__).resolve().parent.parent
MAX_EVENT = 128 * 1024


def token_matches(value, expected):
    return isinstance(value, str) and hmac.compare_digest(value.encode('utf-8'), expected.encode('utf-8'))


def valid_origin(value, *, https=False):
    """Accept an exact browser Origin, not a URL with credentials/path/query."""
    try:
        parsed = urlsplit(value)
        return (parsed.scheme in (('https',) if https else ('http', 'https'))
                and bool(parsed.hostname) and parsed.port != 0
                and not (parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment))
    except ValueError:
        return False


def safe_path(root: Path, relative: str) -> Path:
    """Reject traversal, hidden components, symlinks escaping the selected root."""
    parts = Path(relative).parts
    if not relative or relative.startswith('/') or '\\' in relative or any(p.startswith('.') for p in parts):
        raise ValueError('Invalid resource path')
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Resource outside content root')
    return target


def ws_frame(data: bytes, opcode: int = 1) -> bytes:
    n = len(data)
    if n < 126:
        return bytes((0x80 | opcode, n)) + data
    if n < 65536:
        return bytes((0x80 | opcode, 126)) + struct.pack('!H', n) + data
    return bytes((0x80 | opcode, 127)) + struct.pack('!Q', n) + data


class Relay:
    def __init__(self, state: Path):
        state.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.clients = {}
        self.db = sqlite3.connect(state / 'relay.sqlite3', check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS occurrences (game TEXT, session TEXT, occurrence TEXT, PRIMARY KEY(game,session,occurrence))')
        self.db.commit()
        self.publish_token = secrets.token_urlsafe(32)
        self.read_token = secrets.token_urlsafe(32)

    def publish(self, event):
        if not isinstance(event, dict):
            raise ValueError('event must be an object')
        required = ['gameId', 'sessionId', 'segmentId', 'occurrenceId', 'sentence', 'timestamp']
        for key in required:
            limit = {'sentence': 32000, 'segmentId': 4096}.get(key, 256)
            if not isinstance(event.get(key), str) or not event[key] or len(event[key]) > limit:
                raise ValueError(f'Invalid {key}')
        if event.get('type', 'text') not in ('text', 'dialogue', 'narration', 'choice'):
            raise ValueError('Only presented text belongs in the relay')
        if not isinstance(event.get('speaker', ''), str) or len(event.get('speaker', '')) > 256:
            raise ValueError('Invalid speaker')
        flags = event.get('flags', {})
        if not isinstance(flags, dict):
            raise ValueError('Invalid flags')
        # Restored/rerendered content is not a new presentation event.
        if flags.get('restored') or flags.get('replay') or flags.get('rerender'):
            return False
        # Validate the complete outbound frame before recording its occurrence.
        # JSON escape sequences can otherwise introduce invalid UTF-8 surrogates.
        encoded = json.dumps(event, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(encoded) > MAX_EVENT:
            raise ValueError('Text event exceeds relay limit')
        with self.lock:
            inserted = self.db.execute('INSERT OR IGNORE INTO occurrences VALUES (?,?,?)',
                (event['gameId'], event['sessionId'], event['occurrenceId'])).rowcount
            self.db.commit()
            if not inserted:
                return False
            for connection, fmt in list(self.clients.items()):
                # The default sentence format matches Renji's JSON receiver.
                message = event['sentence'] if fmt == 'plain' else json.dumps(
                    event if fmt == 'json' else {'sentence': event['sentence']}, ensure_ascii=False)
                try:
                    connection.sendall(ws_frame(message.encode('utf-8')))
                except OSError:
                    self.clients.pop(connection, None)
            return True


class ReaderServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, library, state, *, origins=(), public_origin=None, password=None):
        self.shared_saves = self.relay = None
        # Claim the listener before opening databases or recovering import jobs.
        # A second launch on an occupied port must leave active state untouched.
        super().__init__(address, ReaderHandler)
        try:
            self.library = Path(library).resolve()
            self.relay = Relay(Path(state))
            self.shared_saves = SharedSaves(Path(state))
            self.save_token = secrets.token_urlsafe(32)
            self.import_token = secrets.token_urlsafe(32)
            self.extra_origins = set(origins)
            self.public_origin = public_origin
            self.password = password
            self._content_cache = {}
            self._content_lock = threading.RLock()
            self.import_jobs = ImportJobs(state, self.library, self.catalogue)
        except Exception:
            self.server_close()
            if self.relay:
                self.relay.db.close()
            raise

    def reader_content(self, folder):
        """Cache large manifests by file identity; still validate each request path."""
        path = folder / 'content.json'
        if folder.is_symlink() or path.is_symlink():
            raise ValueError('Symlinked reader manifest')
        info = path.stat()
        version = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        with self._content_lock:
            cached = self._content_cache.get(folder)
            if cached and cached[0] == version:
                return cached[1], cached[2]
            content = json.loads(path.read_text())
            assets = content.get('assets', {})
            if not isinstance(assets, dict):
                raise ValueError('Invalid asset catalogue')
            allowed = frozenset({'content.json', 'compatibility.json', 'read-paths.json'} | {
                asset['url'] for asset in assets.values()
                if isinstance(asset, dict) and isinstance(asset.get('url'), str)})
            self._content_cache[folder] = (version, content, allowed)
            return content, allowed

    def server_close(self):
        super().server_close()
        if self.shared_saves:
            with self.shared_saves.lock:
                self.shared_saves.db.close()

    def catalogue(self):
        games, roots = [], {}
        fixture = ROOT / 'fixtures' / 'synthetic'
        candidates = [fixture] + (sorted(p for p in self.library.iterdir() if p.is_dir()) if self.library.exists() else [])
        for folder in candidates:
            path = folder / 'content.json'
            if folder.is_symlink() or path.is_symlink() or not path.is_file():
                continue
            try:
                content, _ = self.reader_content(folder)
                ident = content['id']
                if not isinstance(ident, str) or not ident or ident.startswith('.') or '..' in ident or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.' for c in ident):
                    continue
                if ident in roots:
                    continue
                # An imported directory may expose only reader assets, never its raw disc/script diagnostics.
                roots[ident] = folder
                # Local, reversible menu visibility; assets and saved links remain intact.
                if (folder / '.hide-from-library').is_file():
                    continue
                games.append({'id': ident, 'title': content['title'], 'url': f'/content/{ident}/content.json',
                              'platform': content_platform(content),
                              'compatibility': content.get('compatibility', {'status': 'untested'}),
                              'replaces': content.get('replaces', []),
                              'fixture': folder == fixture})
            except (ValueError, KeyError, OSError, TypeError):
                continue
        return games, roots


class ReaderHandler(BaseHTTPRequestHandler):
    server: ReaderServer
    protocol_version = 'HTTP/1.1'
    # No read-ahead: select() must not miss frames already hidden in a buffer.
    rbufsize = 0

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def log_message(self, fmt, *args):
        # Request query strings can contain private stream tokens. Never log them.
        pass

    def reply(self, code, data, content_type='application/json; charset=utf-8'):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def end_headers(self):
        # POST deliberately closes its socket. Tell HTTP/1.1 clients/proxies so
        # they do not try to reuse it for the next save while it is closing.
        if self.close_connection and not any(h.lower().startswith(b'connection:') for h in self._headers_buffer):
            self.send_header('Connection', 'close')
        if not any(h.lower().startswith(b'cache-control:') for h in self._headers_buffer):
            self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def origin(self):
        host = self.headers.get('Host', '')
        # A configured private HTTPS proxy and direct localhost/SSH access can
        # coexist. Never trust forwarded headers or an arbitrary request Host.
        if self.server.public_origin and host == urlsplit(self.server.public_origin).netloc:
            return self.server.public_origin
        return f'http://{host}'

    def host_ok(self):
        host = self.headers.get('Host', '')
        if self.server.public_origin and host == urlsplit(self.server.public_origin).netloc:
            return True
        port = self.server.server_address[1]
        return host in {f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'}

    def authorized(self, websocket=False):
        if not self.host_ok():
            self.reply(403, {'error': 'Unrecognised Host header'})
            return False
        origin = self.headers.get('Origin')
        allowed = {self.origin()}
        if websocket:
            allowed |= self.server.extra_origins
        if origin and origin not in allowed:
            self.reply(403, {'error': 'Origin is not allowed'})
            return False
        if self.server.password and not websocket:
            auth = self.headers.get('Authorization', '')
            try:
                supplied = base64.b64decode(auth.removeprefix('Basic '), validate=True).decode().split(':', 1)[1] if auth.startswith('Basic ') else ''
            except (ValueError, IndexError, UnicodeError):
                supplied = ''
            if not token_matches(supplied, self.server.password):
                self.send_response(401)
                self.send_header('WWW-Authenticate', 'Basic realm="Local VN reader", charset="UTF-8"')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return False
        return True

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            parsed = urlsplit(self.path)
        except ValueError:
            self.close_connection = True
            self.reply(400, {'error': 'Malformed request target'})
            return
        if not self.authorized(websocket=parsed.path == '/ws'):
            return
        if parsed.path == '/ws':
            return self.websocket(parse_qs(parsed.query))
        if parsed.path == '/api/session':
            base = self.origin().replace('http://', 'ws://').replace('https://', 'wss://')
            self.reply(200, {'token': self.server.relay.publish_token, 'wsUrl': f'{base}/ws?token={self.server.relay.read_token}&format=sentence',
                             'structuredWsUrl': f'{base}/ws?token={self.server.relay.read_token}&format=json'})
            return
        if parsed.path == '/api/imports':
            self.reply(200, {**self.server.import_jobs.listing(), 'token':self.server.import_token})
            return
        if parsed.path == '/api/library':
            self.reply(200, {'games': self.server.catalogue()[0]})
            return
        if parsed.path == '/api/saves/session':
            self.reply(200, {'token': self.server.save_token, 'bankReplacement': 1})
            return
        if parsed.path.startswith('/api/saves/'):
            game = parsed.path.removeprefix('/api/saves/')
            if game not in self.server.catalogue()[1]:
                self.reply(404, {'error': 'Unknown imported game'})
                return
            self.reply(200, self.server.shared_saves.read(game))
            return
        if parsed.path == '/api/health':
            self.reply(200, {'ok': True, 'version': '0.1.0'})
            return
        try:
            path = unquote(parsed.path)
            if path.startswith('/content/'):
                pieces = path.split('/', 3)
                if len(pieces) != 4:
                    raise ValueError('Invalid content path')
                root = self.server.catalogue()[1].get(pieces[2])
                if not root:
                    raise ValueError('Unknown game')
                relative = pieces[3]
                _, allowed = self.server.reader_content(root)
                if relative not in allowed:
                    raise ValueError('Resource is not a reader asset')
                target = safe_path(root, relative)
            else:
                target = safe_path(ROOT / 'web', path.lstrip('/') or 'index.html')
            if not target.is_file():
                self.reply(404, {'error': 'Resource not found'})
                return
            info = target.stat()
            size = info.st_size
            # Private, revalidated artwork: no stale import after a rebuild and
            # no repeat PNG transfer when a body/background is used again.
            cache_image = path.startswith('/content/') and target.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.svg'}
            etag = None
            if cache_image:
                identity = (info.st_dev, info.st_ino, size, info.st_mtime_ns, info.st_ctime_ns)
                etag = 'W/"' + hashlib.sha256(repr(identity).encode()).hexdigest() + '"'
                tags = [tag.strip().removeprefix('W/') for tag in self.headers.get('If-None-Match', '').split(',')]
                if '*' in tags or etag.removeprefix('W/') in tags:
                    self.send_response(304)
                    self.send_header('ETag', etag)
                    self.send_header('Cache-Control', 'private, max-age=0, must-revalidate')
                    self.end_headers()
                    return
            start, end = 0, size - 1
            status = 200
            byte_range = self.headers.get('Range')
            if byte_range:
                if not byte_range.startswith('bytes=') or ',' in byte_range:
                    raise ValueError('Unsupported range')
                left, right = byte_range[6:].split('-', 1)
                if left:
                    start = int(left)
                    end = min(int(right), end) if right else end
                else:
                    start = max(0, size - int(right))
                if start < 0 or start > end or start >= size:
                    self.reply(416, {'error': 'Range outside resource'})
                    return
                status = 206
            self.send_response(status)
            if etag:
                self.send_header('ETag', etag)
                self.send_header('Cache-Control', 'private, max-age=0, must-revalidate')
            self.send_header('Content-Type', mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(max(0, end - start + 1)))
            if status == 206:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            if self.command != 'HEAD':
                with target.open('rb') as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    while remaining > 0:
                        block = stream.read(min(remaining, 128 * 1024))
                        if not block:
                            break
                        self.wfile.write(block)
                        remaining -= len(block)
        except (ValueError, OSError, KeyError, TypeError, AttributeError):
            self.reply(404, {'error': 'Invalid or unavailable resource'})

    def do_POST(self):
        # This endpoint consumes one bounded message per HTTP connection. Close
        # on every path so rejected/ambiguous bodies cannot become new requests.
        self.close_connection = True
        if not self.authorized():
            return
        try:
            path = urlsplit(self.path).path
        except ValueError:
            self.reply(400, {'error': 'Malformed request target'})
            return
        if path.startswith('/api/imports/'):
            self.import_request(path)
            return
        if path.startswith('/api/saves/'):
            self.save_request(path)
            return
        if path != '/api/events':
            self.reply(404, {'error': 'Unknown endpoint'})
            return
        try:
            lengths = self.headers.get_all('Content-Length', [])
            if len(lengths) != 1 or self.headers.get('Transfer-Encoding'):
                raise ValueError('Expected one Content-Length and no transfer encoding')
            length = int(lengths[0])
            if not 0 < length <= MAX_EVENT or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('Expected bounded application/json payload')
            payload = self.read_exact(length)
            body = json.loads(payload)
            if not isinstance(body, dict) or not token_matches(body.get('token', ''), self.server.relay.publish_token):
                self.reply(403, {'error': 'Invalid publisher token'})
                return
            accepted = self.server.relay.publish(body.get('event'))
            self.reply(200, {'accepted': accepted})
        except (ValueError, TypeError, UnicodeError, RecursionError, EOFError):
            self.reply(400, {'error': 'Malformed text event'})

    def import_request(self, path):
        if not token_matches(self.headers.get('X-VNKit-Import-Token'), self.server.import_token):
            self.reply(403, {'error':'Invalid import-session token'})
            return
        try:
            lengths=self.headers.get_all('Content-Length', [])
            if len(lengths)!=1 or self.headers.get('Transfer-Encoding'):
                raise ValueError('Expected a single bounded Content-Length')
            length=int(lengths[0])
            binary=path.endswith('/chunk')
            if not 0<length<=(CHUNK if binary else 4096):
                raise ValueError('Import request is too large')
            expected='application/octet-stream' if binary else 'application/json'
            if self.headers.get('Content-Type','').split(';')[0]!=expected:
                raise ValueError('Unexpected import content type')
            payload=self.read_exact(length)
            jobs=self.server.import_jobs
            if binary:
                ident=path.removeprefix('/api/imports/').removesuffix('/chunk')
                offset=int(parse_qs(urlsplit(self.path).query).get('offset',['-1'])[0])
                result=jobs.chunk(ident,offset,payload)
            elif path=='/api/imports/action':
                body=json.loads(payload)
                if not isinstance(body,dict):raise ValueError('Expected an import action')
                action=body.get('action')
                if action=='upload':result=jobs.create(body.get('name'),body.get('size'),body.get('resumeKey'))
                elif action=='register':result=jobs.register(body.get('sourceId'))
                elif action in ('inspect','import','prepare'):result=jobs.start(body.get('id'),action)
                else:raise ValueError('Unknown import action')
            else:raise ValueError('Unknown import endpoint')
            self.reply(200,result)
        except (ValueError,TypeError,UnicodeError,EOFError,KeyError) as error:
            self.reply(400,{'error':str(error) or 'Invalid import request'})
        except OSError:
            self.reply(507,{'error':'Could not write import data. Check server disk space and permissions; received chunks are kept.'})

    def save_request(self, path):
        if not token_matches(self.headers.get('X-VNKit-Save-Token'), self.server.save_token):
            self.reply(403, {'error': 'Invalid save-session token'})
            return
        game = path.removeprefix('/api/saves/')
        if game not in self.server.catalogue()[1]:
            self.reply(404, {'error': 'Unknown imported game'})
            return
        try:
            lengths = self.headers.get_all('Content-Length', [])
            if len(lengths) != 1 or self.headers.get('Transfer-Encoding'):
                raise ValueError('Expected one Content-Length and no transfer encoding')
            length = int(lengths[0])
            if not 0 < length <= MAX_SAVE_REQUEST or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('Expected bounded application/json save payload')
            body = json.loads(self.read_exact(length))
            self.reply(200, self.server.shared_saves.update(game, body))
        except SaveConflict as error:
            self.reply(409, {'error': str(error)})
        except (ValueError, TypeError, UnicodeError, RecursionError, EOFError) as error:
            self.reply(400, {'error': str(error) or 'Malformed save bank'})
        except sqlite3.Error:
            self.reply(503, {'error': 'Server could not commit the save. Keep a local export and retry.'})

    def read_exact(self, length):
        data = bytearray()
        while len(data) < length:
            block = self.rfile.read(length - len(data))
            if not block:
                raise EOFError('Connection ended inside frame')
            data.extend(block)
        return bytes(data)

    def websocket(self, query):
        if not token_matches(query.get('token', [''])[0], self.server.relay.read_token):
            self.reply(403, {'error': 'Invalid stream token'})
            return
        fmt = query.get('format', ['sentence'])[0]
        if fmt not in {'sentence', 'plain', 'json'}:
            self.reply(400, {'error': 'Unknown stream format'})
            return
        key = self.headers.get('Sec-WebSocket-Key', '')
        try:
            valid_key = len(base64.b64decode(key, validate=True)) == 16
        except ValueError:
            valid_key = False
        if self.command != 'GET' or not valid_key or self.headers.get('Sec-WebSocket-Version') != '13' or self.headers.get('Upgrade', '').lower() != 'websocket' or 'upgrade' not in {v.strip().lower() for v in self.headers.get('Connection', '').split(',')}:
            self.reply(400, {'error': 'Expected RFC6455 WebSocket upgrade'})
            return
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        self.connection.settimeout(2)
        with self.server.relay.lock:
            self.server.relay.clients[self.connection] = fmt
        try:
            # Reader-only endpoint; no replay on connect. Accept close and ping only.
            while True:
                tls_pending = isinstance(self.connection, ssl.SSLSocket) and self.connection.pending()
                if not tls_pending and not select.select([self.connection], [], [], 1)[0]:
                    continue
                try:
                    header = self.read_exact(2)
                except (TimeoutError, OSError):
                    break
                if len(header) != 2:
                    break
                opcode, length = header[0] & 15, header[1] & 127
                if not header[1] & 128 or header[0] & 112 or not header[0] & 128:
                    break
                # Control frames must use their canonical <=125-byte encoding.
                if length > 125 or opcode not in (8, 9, 10):
                    break
                mask = self.read_exact(4)
                payload = self.read_exact(length)
                if len(mask) != 4 or len(payload) != length:
                    break
                decoded = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                if opcode == 8:
                    with self.server.relay.lock:
                        self.connection.sendall(ws_frame(struct.pack('!H', 1000), 8))
                    break
                if opcode == 9:
                    with self.server.relay.lock:
                        self.connection.sendall(ws_frame(decoded, 10))
        except (OSError, ValueError, struct.error, EOFError):
            pass
        finally:
            with self.server.relay.lock:
                self.server.relay.clients.pop(self.connection, None)
            self.close_connection = True


def serve(library, state, host='127.0.0.1', port=8891, origins=(), public_origin=None, tls_cert=None, tls_key=None, access_token_file=None):
    remote = host not in ('127.0.0.1', 'localhost')
    if remote and not (tls_cert and tls_key and public_origin and access_token_file):
        raise ValueError('Non-loopback binding requires --tls-cert, --tls-key, --public-origin https://HOST:PORT and --access-token-file. Use an SSH tunnel for simpler remote access.')
    if public_origin and not valid_origin(public_origin, https=True):
        raise ValueError('--public-origin must be an HTTPS origin without a path')
    if any(not valid_origin(origin) for origin in origins):
        raise ValueError('--allow-origin must be an exact HTTP(S) origin without a path')
    if bool(tls_cert) != bool(tls_key) or (tls_cert and not public_origin):
        raise ValueError('TLS requires both --tls-cert/--tls-key and --public-origin')
    password = Path(access_token_file).read_text().strip() if access_token_file else None
    if password is not None and len(password) < 24:
        raise ValueError('Access token must be at least 24 characters')
    server = ReaderServer((host, port), library, state, origins=origins, public_origin=public_origin, password=password)
    if tls_cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(tls_cert, tls_key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f'VN reader: {public_origin or f"http://127.0.0.1:{server.server_address[1]}"}', flush=True)
    print('Original game resources and activity stay local. Ctrl-C stops this isolated server.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.relay.db.close()
