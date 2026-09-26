"""Remote mining uses isolated listeners and a fake Anki collection only."""
import copy
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest

from vnkit.anki_bridge import BridgeServer, MediaBridge, config_checked, tailscale_origin, tailscale_serve_command
import test_mining as fixture
from test_mining import note

KEY = 'r' * 43  # Synthetic test credential, never a shipped default.
REMOTE = dict(remote_enabled=True, remote_origin='https://desktop.example.ts.net:8776', remote_key=KEY)


class RemoteMiningTests(unittest.TestCase):
    def setUp(self):
        self.fake = fixture.BridgeTests()
        self.fake.setUp()
        self.bridge = MediaBridge({**REMOTE, 'anki_key': 'local-secret'}, self.fake.fetch)

    def test_key_required_even_for_version_and_local_connections(self):
        for key in [None, '', 'wrong', 'é'*43, 1]:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Connection key'):
                self.bridge.invoke(dict(action='version', version=2, key=key))
        self.assertEqual(self.fake.calls, [])

    def test_remote_mining_translates_key_without_leaking_it_or_phone_origin(self):
        request = dict(action='addNote', version=6, key=KEY, params={'note': note()})
        self.bridge.invoke(request, 'moz-extension://phone-extension')
        calls = self.fake.calls
        self.assertIn('[sound:vn-library-', calls[-1][1]['params']['note']['fields']['SentenceAudio'])
        self.assertIn('<img src=', calls[-1][1]['params']['note']['fields']['Picture'])
        for _, data, headers in calls:
            self.assertNotIn('Origin', headers or {})
            self.assertNotIn(KEY, json.dumps([data, headers]))
            if data:
                self.assertEqual(data['key'], 'local-secret')
        self.assertEqual(request['key'], KEY)  # Caller data remains untouched.

    def test_nested_batches_translate_keys_before_any_media_writes(self):
        nested = dict(action='multi', version=6, key=KEY, params={'actions': [
            dict(action='multi', key='ignored', params={'actions': [
                dict(action='addNote', params={'note': note()})]})]})
        self.bridge.invoke(nested)
        outgoing = self.fake.calls[-1][1]
        self.assertEqual(outgoing['params']['actions'][0]['params']['actions'][0]['key'], 'local-secret')
        self.fake.calls.clear()
        nested['params']['actions'].append(dict(action='deleteDecks', params={'decks': ['Test']}))
        with self.assertRaisesRegex(ValueError, 'not available'):
            self.bridge.invoke(nested)
        self.assertEqual(self.fake.calls, [])

    def test_no_anki_key_and_normal_yomitan_queries(self):
        self.bridge.config['anki_key'] = ''
        for action in ['version', 'deckNames', 'modelNames', 'modelFieldNames', 'canAddNotes', 'findNotes', 'notesInfo']:
            self.bridge.invoke(dict(action=action, version=2, key=KEY, params={}))
            self.assertNotIn('key', self.fake.calls[-1][1])

    def test_local_mode_still_forwards_existing_anki_key(self):
        bridge = MediaBridge({}, self.fake.fetch)
        bridge.invoke(dict(action='version', version=2, key='old-key'), 'moz-extension://desktop')
        self.assertEqual(self.fake.calls[-1][1]['key'], 'old-key')
        self.assertEqual(self.fake.calls[-1][2], {'Origin': 'moz-extension://desktop'})

    def test_configuration_and_read_only_tailscale_helpers(self):
        self.assertFalse(config_checked({})['remote_enabled'])
        for change in [{'remote_key': ''}, {'remote_origin': 'http://127.0.0.1:8776'},
                       {'remote_origin': 'https://desktop.example.ts.net/path'}, {'remote_enabled': 'yes'}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                config_checked({**REMOTE, **change})
        self.assertEqual(tailscale_origin({'BackendState': 'Running', 'Self': {'DNSName': 'desktop.example.ts.net.'}}),
                         'https://desktop.example.ts.net:8776')
        self.assertEqual(tailscale_serve_command(REMOTE), 'tailscale serve --bg --https=8776 http://127.0.0.1:8776')
        with self.assertRaises(ValueError):
            tailscale_origin({'BackendState': 'Stopped'})
        self.assertEqual(tailscale_serve_command({**REMOTE, 'port': 9776, 'remote_origin': 'https://desktop.example.ts.net:9443'}),
                         'tailscale serve --bg --https=9443 http://127.0.0.1:9776')


@unittest.skipUnless(shutil.which('openssl'), 'openssl needed for isolated TLS proxy test')
class RemoteMiningHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        cert, key = root/'cert.pem', root/'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
                        '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True, timeout=15)
        self.context = ssl.create_default_context(cafile=str(cert))
        # Forward only to this test's bridge, mirroring an HTTPS Serve route.
        outer = self
        class Proxy(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                raw = self.rfile.read(int(self.headers['Content-Length']))
                con = http.client.HTTPConnection('127.0.0.1', outer.bridge.server_address[1], timeout=5)
                try:
                    headers = {'Content-Type': 'application/json', 'Host': self.headers['Host'], 'X-Forwarded-For': '100.64.0.1'}
                    if self.headers.get('Origin'):
                        headers['Origin'] = self.headers['Origin']
                    con.request('POST', '/', raw, headers)
                    reply = con.getresponse(); body = reply.read()
                    self.send_response(reply.status)
                    for name in ('Content-Type', 'Access-Control-Allow-Origin'):
                        if reply.getheader(name): self.send_header(name, reply.getheader(name))
                    self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                finally:
                    con.close()
        self.proxy = ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain(cert, key)
        self.proxy.socket = tls.wrap_socket(self.proxy.socket, server_side=True)
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
        self.bridge = BridgeServer({**REMOTE, 'port': port,
            'remote_origin': 'https://127.0.0.1:'+str(self.proxy.server_address[1])})
        self.fake = fixture.BridgeTests(); self.fake.setUp()
        def fetch(url, data=None, headers=None):
            if data and data['action'] == 'version':
                self.fake.calls.append((url, copy.deepcopy(data), headers))
                return {'result': 6, 'error': None} if data.get('version', 4) >= 5 else 6
            return self.fake.fetch(url, data, headers)
        self.bridge.bridge.fetch = fetch
        for server in (self.bridge, self.proxy):
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            self.addCleanup(lambda s=server, t=thread: (s.shutdown(), s.server_close(), t.join(5)))

    def post(self, data, headers=None, direct=False):
        port = (self.bridge if direct else self.proxy).server_address[1]
        connection = (http.client.HTTPConnection('127.0.0.1', port, timeout=5) if direct else
                      http.client.HTTPSConnection('127.0.0.1', port, context=self.context, timeout=5))
        try:
            connection.request('POST', '/', json.dumps(data), {'Content-Type': 'application/json', **(headers or {})})
            response = connection.getresponse()
            return response.status, json.loads(response.read()), response.getheader('Access-Control-Allow-Origin')
        finally:
            connection.close()

    def test_https_extension_queries_and_media_end_to_end(self):
        for version in (2, 6):
            status, result, cors = self.post(dict(action='version', version=version, key=KEY), {'Origin': 'moz-extension://phone'})
            self.assertEqual(status, 200)
            self.assertEqual(result, 6 if version == 2 else {'result': 6, 'error': None})
            self.assertEqual(cors, 'moz-extension://phone')
        status, result, _ = self.post(dict(action='addNote', version=6, key=KEY, params={'note': note()}))
        self.assertEqual((status, result['result']), (200, 123))
        final_note = self.fake.calls[-1][1]['params']['note']
        self.assertIn('<img src=', final_note['fields']['Picture'])
        self.assertIn('[sound:', final_note['fields']['SentenceAudio'])
        self.assertNotIn(KEY, json.dumps(self.fake.calls))

    def test_wrong_key_host_and_web_origin_are_rejected(self):
        for direct in (False, True):
            self.assertIn('Connection key', self.post(dict(action='version', version=2), direct=direct)[1]['error'])
        request = dict(action='version', version=2, key=KEY)
        self.assertEqual(self.post(request, {'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.post(request, {'Host': 'other.example'})[0], 403)
        self.assertEqual(self.fake.calls, [])

    def test_disabling_remote_rejects_leftover_proxy_with_local_host(self):
        self.bridge.bridge.config['remote_enabled'] = False
        status, _, _ = self.post(dict(action='version', version=2), {'Host': '127.0.0.1:'+str(self.bridge.server_address[1])})
        self.assertEqual(status, 403)
        self.assertEqual(self.post(dict(action='version', version=2), direct=True)[1], 6)


if __name__ == '__main__':
    unittest.main()
