"""Isolated browser harness: real reader/bridge, fake Anki collection transport."""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import sys
import threading
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.server import ReaderServer
from vnkit.anki_bridge import BridgeServer

records=[]
class AnkiMock(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        r=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        records.append(r)
        action=r['action']
        result={'version':6,'modelFieldNames':['Word','Sentence','Source','Picture','SentenceAudio','WordAudio'],'addNote':123}.get(action)
        if action=='storeMediaFile':result=r['params']['filename']
        raw=json.dumps({'result':result,'error':None} if r.get('version',4)>=5 else result).encode();self.send_response(200);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        # Private synthetic/test server only. Avoid sending the large audio data
        # twice: the report keeps hashes and field associations, not source bytes.
        def scrub(r):
            if r.get('action')=='storeMediaFile':
                data=base64.b64decode(r['params']['data']);return {'action':r['action'],'filename':r['params']['filename'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
            return r
        raw=json.dumps([scrub(r) for r in records]).encode();self.send_response(200);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
reader=ReaderServer(('127.0.0.1',0),sys.argv[1],sys.argv[2])
anki=ThreadingHTTPServer(('127.0.0.1',0),AnkiMock)
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
remote = bool(os.environ.get('VNKIT_TEST_REMOTE_MINING'))
remote_key = 'browser-test-credential-'+'r'*32 if remote else None
bridge=BridgeServer({'port':port,'anki_port':anki.server_address[1],'reader_origins':['http://127.0.0.1:'+str(reader.server_address[1])],
    **({'remote_enabled': True, 'remote_origin': 'https://desktop.example.ts.net:8776', 'remote_key': remote_key} if remote else {})})
for s in (reader,anki,bridge):threading.Thread(target=s.serve_forever,daemon=True).start()
print(json.dumps({'reader':reader.server_address[1],'anki':anki.server_address[1],'bridge':bridge.server_address[1], 'remoteKey': remote_key}),flush=True)
try:sys.stdin.read()
finally:
    for s in (reader,anki,bridge):s.shutdown();s.server_close()
    reader.relay.db.close()
