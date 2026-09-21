"""Real HTTP + WebSocket tests. No game content or external network required."""
import base64
import http.client
import io
import json
from pathlib import Path
import secrets
import socket
import struct
import tempfile
import tarfile
import threading
import time
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
from urllib.parse import urlsplit
from vnkit.server import ReaderServer, Relay, safe_path, serve


class RelayTest(unittest.TestCase):
    def test_compound_source_identity_is_preserved_and_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            relay = Relay(Path(folder))
            source = '+'.join(f'SCENE:{i:08x}' for i in range(24))
            event = dict(gameId='test', sessionId='session', segmentId=source,
                         occurrenceId='compound', sentence='続きの文章。', timestamp='now')
            self.assertGreater(len(source), 256)
            self.assertTrue(relay.publish(event))
            self.assertFalse(relay.publish(event))
            with self.assertRaises(ValueError):
                relay.publish(dict(event, segmentId='x' * 4097, occurrenceId='large'))
            self.assertTrue(relay.publish(dict(event, occurrenceId='large')))
            relay.db.close()

    def test_occurrence_dedupe_survives_restart_without_string_dedupe(self):
        with tempfile.TemporaryDirectory() as folder:
            relay = Relay(Path(folder))
            event = dict(gameId='test', sessionId='session', segmentId='s1', occurrenceId='o1', sentence='同じ言葉。', timestamp='2026-01-01T00:00:00Z')
            self.assertTrue(relay.publish(event))
            self.assertFalse(relay.publish(event))
            relay.db.close()
            relay = Relay(Path(folder))
            self.assertFalse(relay.publish(event))
            self.assertTrue(relay.publish(dict(event, segmentId='s2', occurrenceId='o2')))
            self.assertFalse(relay.publish(dict(event, occurrenceId='o3', flags={'restored': True})))
            with self.assertRaises(ValueError):
                relay.publish(dict(event, occurrenceId='o4', type='status'))
            relay.db.close()

    def test_path_and_remote_binding(self):
        for name in ['../iso', '/etc/passwd', '.env', 'a/../../file', 'a\\b']:
            with self.assertRaises(ValueError): safe_path(Path('/tmp'), name)
        with self.assertRaisesRegex(ValueError, 'Non-loopback'):
            serve('/tmp', '/tmp', host='0.0.0.0')
        for origin in ['https://', 'https://user:pass@example.com', 'https://example.com?secret=x', 'https://example.com/#x']:
            with self.assertRaisesRegex(ValueError, 'public-origin'):
                serve('/tmp', '/tmp', public_origin=origin)

    def test_invalid_utf8_never_consumes_occurrence(self):
        with tempfile.TemporaryDirectory() as folder:
            relay = Relay(Path(folder))
            event = dict(gameId='test', sessionId='session', segmentId='s1', occurrenceId='o1', sentence='\ud800', timestamp='now')
            with self.assertRaises(UnicodeError):
                relay.publish(event)
            self.assertTrue(relay.publish(dict(event, sentence='有効な文章。')))
            relay.db.close()


class HTTPTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        game = cls.root / 'library/test'
        game.mkdir(parents=True)
        (game / 'content.json').write_text(json.dumps({'id': 'test', 'title': 'Test', 'assets': {'a': {'type': 'sound', 'url': 'sound.wav'}}}))
        (game / 'sound.wav').write_bytes(b'0123456789')
        (game / 'secrets.txt').write_text('must not be served')
        cls.server = ReaderServer(('127.0.0.1', 0), cls.root / 'library', cls.root / 'state', origins=['https://renji-xd.github.io'])
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server.relay.db.close()
        cls.temp.cleanup()

    def request(self, path, method='GET', body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        data = json.dumps(body) if body is not None else None
        hdr = {'Content-Type': 'application/json'} if body is not None else {}
        hdr.update(headers or {})
        conn.request(method, path, data, hdr)
        response = conn.getresponse()
        result = response.status, response.read(), dict(response.getheaders())
        conn.close()
        return result

    def test_api_and_resource_boundary(self):
        status, data, _ = self.request('/api/library')
        self.assertEqual(status, 200)
        self.assertTrue(any(g['id'] == 'test' for g in json.loads(data)['games']))
        for path in ['/content/test/secrets.txt', '/content/test/../secrets.txt', '/content/test/%2e%2e/secrets.txt', '/private/probe/NSCR.NFP', '/.git/config']:
            self.assertEqual(self.request(path)[0], 404, path)
        self.assertEqual(self.request('/api/session', headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/session', headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request('/api/session', headers={'Origin': 'https://renji-xd.github.io'})[0], 403)
        status, data, headers = self.request('/content/test/sound.wav', headers={'Range': 'bytes=3-6'})
        self.assertEqual((status, data, headers['Content-Range']), (206, b'3456', 'bytes 3-6/10'))

    def test_versioned_game_id_with_dot_is_visible_and_addressable(self):
        game = self.root / 'library/versioned'
        game.mkdir(exist_ok=True)
        (game / 'content.json').write_text(json.dumps({'id': 'edition-1.04', 'title': 'Versioned test', 'assets': {}, 'compatibility': {'status': 'blocked'}}))
        try:
            status, data, _ = self.request('/api/library')
            self.assertEqual(status, 200)
            self.assertTrue(any(g['id'] == 'edition-1.04' for g in json.loads(data)['games']))
            self.assertEqual(self.request('/content/edition-1.04/content.json')[0], 200)
        finally:
            (game / 'content.json').unlink()
            game.rmdir()

    def test_artwork_revalidation_is_private_and_detects_replacement(self):
        with tempfile.TemporaryDirectory(dir=self.root / 'library') as folder:
            root = Path(folder)
            (root / 'content.json').write_text(json.dumps({'id': 'cache-test', 'assets': {'a': {'type': 'image', 'url': 'art.png'}}}))
            image = root / 'art.png'
            image.write_bytes(b'original-image')
            url = '/content/cache-test/art.png'
            status, data, headers = self.request(url)
            self.assertEqual((status, data), (200, b'original-image'))
            self.assertEqual(headers['Cache-Control'], 'private, max-age=0, must-revalidate')
            etag = headers['ETag']
            status, data, headers = self.request(url, headers={'If-None-Match': etag})
            self.assertEqual((status, data, headers['ETag']), (304, b'', etag))
            self.assertEqual(self.request(url, headers={'Origin': 'https://evil.example', 'If-None-Match': etag})[0], 403)
            self.assertEqual(self.request(url, method='HEAD')[2]['ETag'], etag)
            self.assertEqual(self.request(url, headers={'Range': 'bytes=0-3'})[:2], (206, b'orig'))
            replacement = root / 'replacement'
            replacement.write_bytes(b'replaced-image')
            replacement.replace(image)
            status, data, headers = self.request(url, headers={'If-None-Match': etag})
            self.assertEqual((status, data), (200, b'replaced-image'))
            self.assertNotEqual(headers['ETag'], etag)
            for path in ['/api/saves/session', '/api/saves/cache-test', '/api/session', '/content/cache-test/content.json', '/app.mjs']:
                self.assertEqual(self.request(path)[2]['Cache-Control'], 'no-store', path)

    def test_hidden_import_remains_addressable_without_menu_entry(self):
        marker = self.root / 'library/test/.hide-from-library'
        marker.write_text('Paused by user')
        try:
            status, data, _ = self.request('/api/library')
            self.assertEqual(status, 200)
            self.assertFalse(any(g['id'] == 'test' for g in json.loads(data)['games']))
            self.assertEqual(self.request('/content/test/content.json')[0], 200)
            self.assertEqual(self.request('/content/test/sound.wav')[1], b'0123456789')
            self.assertEqual(self.request('/content/test/.hide-from-library')[0], 404)
        finally:
            marker.unlink()

    def test_private_https_proxy_and_local_tunnel_origins_coexist(self):
        self.server.public_origin = 'https://reader.example.ts.net:8891'
        try:
            status, data, _ = self.request('/api/session', headers={
                'Host': 'reader.example.ts.net:8891', 'Origin': self.server.public_origin})
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(data)['wsUrl'].startswith('wss://reader.example.ts.net:8891/ws?'))
            local = f'http://127.0.0.1:{self.port}'
            status, data, _ = self.request('/api/session', headers={'Origin': local})
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(data)['wsUrl'].startswith(f'ws://127.0.0.1:{self.port}/ws?'))
            self.assertEqual(self.request('/api/session', headers={
                'Host': 'reader.example.ts.net:8891', 'Origin': 'https://evil.example'})[0], 403)
        finally:
            self.server.public_origin = None

    def connect_ws(self, fmt='sentence', origin='https://renji-xd.github.io', token=None):
        token = token or self.server.relay.read_token
        sock = socket.create_connection(('127.0.0.1', self.port), timeout=3)
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        sock.sendall((f'GET /ws?token={token}&format={fmt} HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\nOrigin: {origin}\r\n\r\n').encode())
        response = b''
        while not response.endswith(b'\r\n\r\n'):
            response += sock.recv(1)
        return sock, response

    def masked_control(self, message, opcode=9):
        mask = b'1234'
        return bytes((0x80 | opcode, 0x80 | len(message))) + mask + bytes(value ^ mask[index % 4] for index, value in enumerate(message))

    def test_idle_and_coalesced_websocket_pings(self):
        sock, response = self.connect_ws()
        try:
            self.assertIn(b'101 Switching Protocols', response)
            # More than the old socket timeout: inactivity is not disconnection.
            time.sleep(2.2)
            sock.sendall(self.masked_control(b'first') + self.masked_control(b'second'))
            expected = b'\x8a\x05first\x8a\x06second'
            received = b''
            while len(received) < len(expected):
                block = sock.recv(len(expected) - len(received))
                self.assertTrue(block)
                received += block
            self.assertEqual(received, expected)
            sock.sendall(self.masked_control(b'', opcode=8))
            self.assertEqual(sock.recv(4), b'\x88\x02\x03\xe8')
        finally:
            sock.close()

    def test_malformed_controls_and_tokens_are_rejected(self):
        sock, response = self.connect_ws(token='%E6%96%87')
        self.assertIn(b'403 Forbidden', response)
        sock.close()
        self.assertEqual(self.request('/api/events', 'POST', {'token': '文', 'event': {}})[0], 403)
        for frame in [b'\x89\x00', b'\x89\xfe\x00\x01', b'\x81\x80']:
            sock, response = self.connect_ws()
            try:
                sock.sendall(frame)
                self.assertEqual(sock.recv(1), b'')
            finally:
                sock.close()
        self.assertEqual(self.request('/api/health')[0], 200)

    def test_malformed_event_schema_and_utf8(self):
        event = dict(gameId='test', sessionId='s', segmentId='x', occurrenceId=secrets.token_hex(8), sentence='\ud800', timestamp='now')
        self.assertEqual(self.request('/api/events', 'POST', {'token': self.server.relay.publish_token, 'event': event})[0], 400)
        status, data, _ = self.request('/api/events', 'POST', {'token': self.server.relay.publish_token, 'event': dict(event, sentence='正しい文。')})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(data)['accepted'])
        self.assertEqual(self.request('/api/events', 'POST', {'token': self.server.relay.publish_token, 'event': []})[0], 400)

    def test_invalid_content_catalogue_cannot_expose_other_files(self):
        game = self.root / 'library/bad'
        game.mkdir(exist_ok=True)
        try:
            (game / 'content.json').write_text(json.dumps({'id': 'bad', 'title': 'Bad', 'assets': []}))
            (game / 'private.json').write_text('private')
            self.assertEqual(self.request('/content/bad/private.json')[0], 404)
            self.assertEqual(self.request('/content/bad/content.json')[0], 404)
        finally:
            for path in game.iterdir(): path.unlink()
            game.rmdir()

    def test_http_rejects_malformed_targets_and_ambiguous_framing(self):
        requests = [
            f'GET http://[bad HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n\r\n',
            f'POST /api/events HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{{}}',
        ]
        for request in requests:
            sock = socket.create_connection(('127.0.0.1', self.port), timeout=3)
            try:
                sock.sendall(request.encode())
                self.assertIn(b'400 Bad Request', sock.recv(1024))
            finally:
                sock.close()

    def receive(self, sock):
        head = sock.recv(2)
        self.assertEqual(head[0], 0x81)
        length = head[1]
        if length == 126: length = struct.unpack('!H', sock.recv(2))[0]
        if length == 127: length = struct.unpack('!Q', sock.recv(8))[0]
        data = b''
        while len(data) < length: data += sock.recv(length - len(data))
        return data.decode()

    def test_external_websocket_real_frames_and_receiver_formats(self):
        sockets = []
        try:
            for fmt in ['sentence', 'plain', 'json']:
                sock, response = self.connect_ws(fmt)
                self.assertIn(b'101 Switching Protocols', response)
                sockets.append(sock)
            event = dict(type='text', gameId='test', sessionId='s', segmentId='location-1', occurrenceId=secrets.token_hex(8), speaker='声', sentence='日本語の一文。', timestamp='2026-09-07T22:00:00Z', flags={'skip': False})
            status, data, _ = self.request('/api/events', 'POST', {'token': self.server.relay.publish_token, 'event': event})
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(data)['accepted'])
            messages = [self.receive(sock) for sock in sockets]
            self.assertEqual(json.loads(messages[0]), {'sentence': event['sentence']})
            self.assertEqual(messages[1], event['sentence'])
            self.assertEqual(json.loads(messages[2]), event)
            # Renji: JSON.parse(data)?.sentence || data, catch -> data.
            for message in messages:
                try: received = json.loads(message).get('sentence') or message
                except ValueError: received = message
                self.assertEqual(received, event['sentence'])
            status, data, _ = self.request('/api/events', 'POST', {'token': self.server.relay.publish_token, 'event': event})
            self.assertFalse(json.loads(data)['accepted'])
            for sock in sockets:
                sock.settimeout(.15)
                with self.assertRaises(TimeoutError): sock.recv(1)
        finally:
            for sock in sockets: sock.close()

    def test_websocket_access_controls(self):
        for kwargs in [{'origin': 'https://evil.example'}, {'token': 'wrong'}]:
            sock, response = self.connect_ws(**kwargs)
            self.assertIn(b'403 Forbidden', response)
            sock.close()
        event = dict(gameId='test', sessionId='s', segmentId='x', occurrenceId='a', sentence='文', timestamp='now')
        self.assertEqual(self.request('/api/events', 'POST', {'token': self.server.relay.read_token, 'event': event})[0], 403)


class PackagingAndCLITest(unittest.TestCase):
    def test_code_package_excludes_unlisted_data_and_rejects_root_symlinks(self):
        from vnkit import package
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, data in {'README.md': 'public', 'docs/public.md': 'public', 'docs/raw-script.json': 'private',
                               'scripts/raw.txt': 'private', 'fixtures/synthetic/content.json': '{}',
                               'fixtures/synthetic/other-game.wav': 'private'}.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(data)
            with patch.object(package, 'ROOT', root):
                package.build(root / 'first.tar.gz')
                with tarfile.open(root / 'first.tar.gz') as archive:
                    names = archive.getnames()
                self.assertIn('vnkit/docs/public.md', names)
                self.assertFalse(any('private' in name or 'raw' in name or 'other-game' in name for name in names))
                (root / 'README.md').unlink()
                (root / 'README.md').symlink_to(root / 'docs/raw-script.json')
                with self.assertRaisesRegex(ValueError, 'symlink'):
                    package.build(root / 'second.tar.gz')
                (root / 'README.md').unlink()
                (root / 'vnkit').symlink_to(root / 'docs', target_is_directory=True)
                with self.assertRaisesRegex(ValueError, 'symlink'):
                    package.build(root / 'third.tar.gz')

    def test_cli_unknown_disc_directory_and_malformed_content_are_diagnostic(self):
        from vnkit.__main__ import main
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'SYSTEM.CNF').write_bytes(b'\xff')
            output = io.StringIO()
            with redirect_stdout(output):
                self.assertEqual(main(['inspect', str(root)]), 0)
            self.assertFalse(json.loads(output.getvalue())['identification']['supported'])
            (root / 'content.json').write_text('[]')
            errors = io.StringIO()
            with redirect_stderr(errors):
                self.assertEqual(main(['validate', str(root)]), 2)
            self.assertIn('JSON object', errors.getvalue())


if __name__ == '__main__': unittest.main()
