"""Original MIT AnkiConnect-compatible media bridge; runs beside desktop Anki.

The reader does not connect to Anki or need its key. Yomitan sends its ordinary
request here. Only explicitly configured reader origins can supply note media.
"""
import argparse
import base64
import copy
import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import socket
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

MAX_BODY = 48 * 1024 * 1024
DEFAULTS = {'port': 8776, 'anki_port': 8765,
            'reader_origins': ['http://127.0.0.1:8891', 'http://localhost:8891'],
            'source_field': 'Source', 'image_field': 'Picture', 'audio_field': 'SentenceAudio'}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirects are not allowed for mining media')


def origin(url):
    p = urlsplit(url)
    if p.username or p.password or not p.hostname or p.port == 0:
        raise ValueError('Invalid reader address')
    if p.scheme != 'https' and not (p.scheme == 'http' and p.hostname in ('localhost', '127.0.0.1', '::1')):
        raise ValueError('Use HTTPS for a remote reader')
    return p.scheme+'://'+p.netloc


def config_checked(values):
    c = {**DEFAULTS, **values}
    for name in ('port', 'anki_port'):
        if type(c[name]) is not int or not 1 <= c[name] <= 65535:
            raise ValueError('Invalid '+name)
    if c['port'] == c['anki_port']:
        raise ValueError('Bridge and AnkiConnect need separate ports')
    if not isinstance(c['reader_origins'], list) or not 1 <= len(c['reader_origins']) <= 16:
        raise ValueError('Add a reader address')
    for value in c['reader_origins']:
        if origin(value) != value:
            raise ValueError('Reader addresses must have no path or trailing slash')
    fields = [c[k] for k in ('source_field', 'image_field', 'audio_field')]
    if any(not isinstance(x, str) or not 0 < len(x) < 128 for x in fields) or len(set(fields)) != 3:
        raise ValueError('Choose three different note fields')
    return c


def request_json(url, data=None, headers=None):
    # Do not inherit a machine's public HTTP proxy for private reader media.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    req = Request(url, data=None if data is None else json.dumps(data).encode(),
                  headers={'Content-Type': 'application/json', **(headers or {})})
    with opener.open(req, timeout=20) as response:
        raw = response.read(MAX_BODY+1)
    if len(raw) > MAX_BODY:
        raise ValueError('Media response exceeds limit')
    return json.loads(raw)


class MediaBridge:
    def __init__(self, config, fetch=request_json):
        self.config = config_checked(config)
        self.fetch = fetch

    def enrich(self, note):
        if not isinstance(note, dict):
            raise ValueError('Invalid Anki note')
        result = copy.deepcopy(note)
        result.pop('_vn_media', None)
        fields = result.get('fields', {})
        if not isinstance(fields, dict):
            raise ValueError('Invalid note fields')
        source_name = self.config['source_field']
        source = fields.get(source_name, '')
        if not isinstance(source, str) or not source.strip():
            raise ValueError('Map '+source_name+' to {url} in Yomitan so game media can be matched safely')
        urls = re.findall(r'https?://[^\s<>"\']+', html.unescape(source))
        if not urls:
            raise ValueError('The '+source_name+' field must contain Yomitan’s {url}, not the page title')
        candidates = []
        for url in urls:
            try:
                o = origin(url)
            except ValueError:
                continue
            if o in self.config['reader_origins']:
                candidates.append((url, o))
        if not candidates:
            if '#vnl=' in source:
                raise ValueError('Add this reader address in Anki → Tools → VN Library media')
            return result  # Normal mining from unrelated websites is unchanged.
        contexts = {(o, urlsplit(u).fragment) for u, o in candidates}
        if len(contexts) != 1:
            raise ValueError('Ambiguous VN Library source; look up the word again')
        reader, fragment = contexts.pop()
        if fragment == 'vnl=pending':
            raise ValueError('This lookup opened before its media was ready. Close it, wait for Anki: ready in VN Library, then look up the word again. No card was added.')
        if fragment == 'vnl=error':
            raise ValueError('This line’s media could not be prepared. In VN Library use Anki media → Prepare current line again, wait for Anki: ready, then reopen the lookup. No card was added.')
        if fragment == 'vnl=unavailable':
            raise ValueError('Mining is unavailable in menus and backlog. Close the panel and look up a word on the game line. No card was added.')
        if not re.fullmatch(r'vnl=[a-f0-9]{64}', fragment):
            raise ValueError('Enable Anki media in VN Library, then look up the word again')
        image_field, audio_field = self.config['image_field'], self.config['audio_field']
        if image_field not in fields:
            raise ValueError('Map the '+image_field+' field in Yomitan (leave its template blank)')
        try:
            context = self.fetch(reader+'/api/mining/context', headers={'X-VNKit-Mining-Context': fragment[4:]})
        except Exception as e:
            raise ValueError('Cannot retrieve this line’s media. Keep the host running. On the original line, use Anki media → Prepare current line again, then reopen the lookup.') from e
        if context.get('format') != 'vn-library.mining' or context.get('version') != 1 or not context.get('image'):
            raise ValueError('Invalid reader media response; no card was added')
        for kind, target, key, extension in [('image', image_field, 'picture', 'png'), ('audio', audio_field, 'audio', '(?:flac|wav|mp3|ogg|m4a)')]:
            media = context.get(kind)
            if kind == 'audio' and media and target not in fields:
                raise ValueError('Map the '+target+' field in Yomitan (leave its template blank)')
            if target in fields:
                fields[target] = ''
            # Avoid competing screenshot/sentence-audio attachments while keeping
            # dictionary pronunciation and every unrelated field untouched.
            filtered = []
            items = result.get(key) or []
            if isinstance(items, dict):
                items = [items]
            if not isinstance(items, list) or any(not isinstance(i, dict) or not isinstance(i.get('fields'), list) for i in items):
                raise ValueError('Invalid existing note media')
            for item in items:
                item['fields'] = [f for f in item.get('fields', []) if f != target]
                if item['fields']:
                    filtered.append(item)
            if media:
                if not re.fullmatch(r'vn-library-[a-f0-9]{64}\.'+extension, media.get('filename', '')) or not isinstance(media.get('data'), str):
                    raise ValueError('Invalid source media')
                raw = base64.b64decode(media['data'], validate=True)
                if not raw or hashlib.sha256(raw).hexdigest() != media['filename'].split('.')[0][11:]:
                    raise ValueError('Source media checksum mismatch')
                result.setdefault('_vn_media', []).append({**media, 'field': target, 'kind': kind})
            if filtered:
                result[key] = filtered
            else:
                result.pop(key, None)
        # The capability never reaches Anki sync or exported decks.
        for name, value in fields.items():
            if isinstance(value, str):
                fields[name] = re.sub(r'#vnl=[a-f0-9]{64}', '', value)
        return result

    def prepare(self, request, depth=0, budget=None):
        budget = [64] if budget is None else budget
        budget[0] -= 1
        if not isinstance(request, dict) or depth > 4 or budget[0] < 0:
            raise ValueError('Invalid Anki request')
        r = copy.deepcopy(request)
        action, params = r.get('action'), r.get('params', {})
        if action in ('addNote', 'guiAddCards'):
            params['note'] = self.enrich(params['note'])
        elif action == 'addNotes':
            if not isinstance(params['notes'], list) or len(params['notes']) > 32:
                raise ValueError('Too many notes')
            params['notes'] = [self.enrich(n) for n in params['notes']]
        elif action == 'multi':
            if not isinstance(params.get('actions'), list) or len(params['actions']) > 32:
                raise ValueError('Too many operations')
            params['actions'] = [self.prepare(a, depth+1, budget) for a in params['actions']]
        return r

    def invoke(self, request, client_origin=None):
        prepared = self.prepare(request)
        headers = {'Origin': client_origin} if client_origin else {}
        endpoint = 'http://127.0.0.1:'+str(self.config['anki_port'])
        def call(action, params):
            body = {'action': action, 'params': params, 'version': 6}
            if 'key' in request:
                body['key'] = request['key']
            response = self.fetch(endpoint, body, headers)
            if response.get('error'):
                raise ValueError('Anki media preparation: '+str(response['error']))
            return response.get('result')
        stored, models = set(), {}
        def attach(r):
            params = r.get('params', {})
            if r.get('action') == 'multi':
                for a in params['actions']:
                    attach(a)
                return
            notes = params.get('notes', []) if r.get('action') == 'addNotes' else [params.get('note', {})]
            for note in notes:
                media = note.pop('_vn_media', [])
                if not media:
                    continue
                model = note.get('modelName')
                if model not in models:
                    models[model] = call('modelFieldNames', {'modelName': model})
                if not isinstance(models[model], list) or any(m['field'] not in models[model] for m in media):
                    raise ValueError('The configured media fields do not exist in this Anki note type')
                for m in media:
                    filename = m['filename']
                    if filename not in stored:
                        if call('storeMediaFile', {'filename': filename, 'data': m['data']}) != filename:
                            raise ValueError('Anki could not store the original media; no card was added')
                        stored.add(filename)
                    note['fields'][m['field']] = '<img src="'+filename+'">' if m['kind']=='image' else '[sound:'+filename+']'
        # AnkiConnect's optional media attachment helper can swallow write
        # failures. Store required assets explicitly and verify each reply first.
        attach(prepared)
        # Never automatically retry note creation: a timeout may follow a commit.
        try:
            return self.fetch(endpoint, prepared, headers)
        except Exception as e:
            raise ValueError('AnkiConnect did not respond. Check Anki before retrying; the card may already have been added.') from e


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, config):
        self.bridge = MediaBridge(config)
        self.gate = __import__('threading').BoundedSemaphore(4)
        super().__init__(('127.0.0.1', self.bridge.config['port']), BridgeHandler)

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def valid(self):
        self.connection.settimeout(25)
        port = self.server.server_address[1]
        value = self.headers.get('Origin')
        return (self.path == '/' and self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')
                and (value is None or re.fullmatch(r'(?:chrome|moz)-extension://[a-zA-Z0-9-]+', value)))

    def reply(self, result=None, error=None, status=200, raw=False):
        body = json.dumps(result if raw else {'result': result, 'error': error}).encode()
        self.send_response(status)
        value = self.headers.get('Origin')
        if value and self.valid():
            self.send_header('Access-Control-Allow-Origin', value)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.valid():
            return self.reply(error='Origin or host denied', status=403)
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', 'null'))
        self.send_header('Access-Control-Allow-Methods', 'POST')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.end_headers()

    def do_POST(self):
        if not self.valid():
            return self.reply(error='Origin or host denied', status=403)
        if not self.server.gate.acquire(blocking=False):
            return self.reply(error='Media bridge is busy; try again')
        try:
            lengths = self.headers.get_all('Content-Length', [])
            if len(lengths) != 1 or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('Expected bounded JSON')
            size = int(lengths[0])
            if not 0 < size <= MAX_BODY:
                raise ValueError('Request exceeds limit')
            response = self.server.bridge.invoke(json.loads(self.rfile.read(size)), self.headers.get('Origin'))
            self.reply(response, raw=True)
        except (ValueError, KeyError, TypeError, OSError, RecursionError) as e:
            self.reply(error=str(e) if isinstance(e, ValueError) else 'Invalid request or unavailable media')
        finally:
            self.server.gate.release()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', required=True, help='Local JSON configuration; see docs/anki.md')
    a = p.parse_args()
    with open(a.config, encoding='utf-8') as f:
        config = json.load(f)
    server = BridgeServer(config)
    print('VN Library Anki bridge: http://127.0.0.1:'+str(server.server_address[1]), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
