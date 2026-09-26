import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from vnkit.mining import MiningContexts
from vnkit.anki_bridge import MediaBridge, DEFAULTS, config_checked
from vnkit.anki_addon import build_addon
from vnkit.server import safe_path
from vnkit.adapters.pia_media import _png

PNG = _png(2, 2, 4, bytes([80, 120, 220, 255])*4)
CAP = 'a'*64
URL = 'http://127.0.0.1:8891/?game=test#vnl='+CAP


def media(data, ext):
    return {'filename':'vn-library-'+hashlib.sha256(data).hexdigest()+ext,'data':base64.b64encode(data).decode()}


def note(url=URL):
    return {'deckName':'Test','modelName':'Vocabulary','fields':{'Word':'道','Sentence':'同じ文。','Source':'<a href="'+url+'">source</a>','Picture':'','SentenceAudio':'','WordAudio':'[sound:word.mp3]'},'options':{'allowDuplicate':False}}


class MiningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root/'voice.wav').write_bytes(b'RIFF-original-source-voice')
        self.content = {'id':'test','assets':{'voice':{'type':'voice','url':'voice.wav'},'secret':{'type':'script','url':'secret.txt'}}}
        self.clock = [0]
        self.cache = MiningContexts(clock=lambda:self.clock[0], ttl=10, limit=2)
        self.payload = dict(context=CAP,gameId='test',segmentId='scene:1',occurrenceId='one',sentence='同じ文。',voice='voice',image=base64.b64encode(PNG).decode())

    def tearDown(self):
        self.temp.cleanup()

    def put(self, **changes):
        self.cache.put({**self.payload, **changes}, self.content, self.root, safe_path)

    def test_exact_voice_image_identity_and_no_script_access(self):
        self.put()
        r=self.cache.get(CAP)
        self.assertEqual(base64.b64decode(r['image']['data']), PNG)
        self.assertEqual(base64.b64decode(r['audio']['data']), (self.root/'voice.wav').read_bytes())
        with self.assertRaises(ValueError):self.put(context='b'*64, voice='secret')
        self.content['assets']['voice']['url']='../secret.wav'
        with self.assertRaises(ValueError):self.put(context='c'*64)

    def test_same_sentence_distinct_occurrences_and_immutable_context(self):
        self.put()
        self.put(context='b'*64,segmentId='scene:2',occurrenceId='two',voice=None)
        self.assertEqual(self.cache.get(CAP)['segmentId'],'scene:1')
        self.assertIsNone(self.cache.get('b'*64)['audio'])
        with self.assertRaises(ValueError):self.put(occurrenceId='changed')
        self.assertEqual(self.cache.get(CAP)['occurrenceId'],'one')

    def test_expiry_eviction_and_changed_source_fail_closed(self):
        self.put()
        self.put(context='b'*64)
        self.put(context='c'*64)
        with self.assertRaises(KeyError):self.cache.get(CAP)
        (self.root/'voice.wav').write_bytes(b'changed')
        with self.assertRaises(ValueError):self.cache.get('b'*64)
        self.clock[0]=11
        with self.assertRaises(KeyError):self.cache.get('c'*64)
        self.assertEqual(self.cache.bytes,0)

    def test_addon_contains_only_original_code_and_explicit_host(self):
        with zipfile.ZipFile(io.BytesIO(build_addon('https://reader.example.ts.net:8891'))) as z:
            self.assertEqual(set(z.namelist()),{'__init__.py','bridge.py','config.json','config.md','LICENSE','manifest.json'})
            self.assertEqual(json.loads(z.read('config.json'))['reader_origins'],['https://reader.example.ts.net:8891'])
            self.assertEqual(json.loads(z.read('manifest.json'))['human_version'], '0.2.0')
            config = json.loads(z.read('config.json'))
            self.assertFalse(config['remote_enabled'])
            self.assertEqual((config['remote_key'], config['anki_key']), ('', ''))
        with self.assertRaises(ValueError):build_addon('https://reader.example/a')


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        self.context={'format':'vn-library.mining','version':1,'image':media(PNG,'.png'),'audio':media(b'original voice','.flac')}
        self.fail_store=False
        self.fail_lookup=False
        self.model_fields=list(note()['fields'])
        self.bridge=MediaBridge({},self.fetch)

    def fetch(self,url,data=None,headers=None):
        self.calls.append((url,copy.deepcopy(data),headers))
        if url.endswith('/api/mining/context'):
            if self.fail_lookup:raise OSError('gone')
            self.assertEqual(headers['X-VNKit-Mining-Context'],CAP)
            return copy.deepcopy(self.context)
        action=data['action']
        if action=='modelFieldNames':return {'result':self.model_fields,'error':None}
        if action=='storeMediaFile':return {'result':None if self.fail_store else data['params']['filename'],'error':'Disk full' if self.fail_store else None}
        return {'result':123,'error':None}

    def request(self,n=None):
        return {'action':'addNote','version':6,'key':'test-key','params':{'note':n or note()}}

    def test_attach_before_add_preserve_word_audio_and_strip_capability(self):
        original=self.request()
        self.assertEqual(self.bridge.invoke(original)['result'],123)
        outgoing=self.calls[-1][1]['params']['note']
        self.assertIn('<img src="vn-library-',outgoing['fields']['Picture'])
        self.assertIn('[sound:vn-library-',outgoing['fields']['SentenceAudio'])
        self.assertEqual(outgoing['fields']['WordAudio'],'[sound:word.mp3]')
        self.assertNotIn('#vnl=',outgoing['fields']['Source'])
        self.assertNotIn('_vn_media',outgoing)
        self.assertIn('#vnl=',original['params']['note']['fields']['Source'])
        self.assertEqual([x[1]['action'] for x in self.calls if x[1]],['modelFieldNames','storeMediaFile','storeMediaFile','addNote'])
        self.assertTrue(all(x[1].get('key')=='test-key' for x in self.calls if x[1]))

    def test_missing_source_never_silently_adds_an_unenriched_note(self):
        for value in ['', 'Game title']:
            n=note();n['fields']['Source']=value
            with self.assertRaises(ValueError):self.bridge.invoke(self.request(n))
        self.assertEqual(self.calls,[])

    def test_unvoiced_line_gets_image_without_stale_sentence_audio(self):
        self.context['audio']=None
        n=note();n['fields']['SentenceAudio']='old'
        self.bridge.invoke(self.request(n))
        self.assertEqual(self.calls[-1][1]['params']['note']['fields']['SentenceAudio'],'')
        self.assertIn('Picture',self.calls[-1][1]['params']['note']['fields'])

    def test_media_failure_or_missing_model_field_never_adds_note(self):
        for state in ['lookup','store','model']:
            self.calls.clear();self.fail_lookup=state=='lookup';self.fail_store=state=='store';self.model_fields=[] if state=='model' else list(note()['fields'])
            with self.subTest(state=state),self.assertRaises(ValueError):self.bridge.invoke(self.request())
            self.assertFalse(any(x[1] and x[1]['action']=='addNote' for x in self.calls))

    def test_untrusted_origins_backlog_and_expired_links_never_fall_back(self):
        for url in ['https://evil.example/#vnl='+CAP,'http://127.0.0.1:8891/#vnl=unavailable','http://127.0.0.1:8891/']:
            with self.subTest(url=url), self.assertRaises(ValueError):self.bridge.invoke(self.request(note(url)))
        self.assertEqual(self.calls,[])

    def test_pending_and_failed_lookups_explain_reopening_without_adding(self):
        for state, message in [('pending', 'before its media was ready'), ('error', 'Prepare current line again')]:
            with self.subTest(state=state), self.assertRaisesRegex(ValueError, message):
                self.bridge.invoke(self.request(note('http://127.0.0.1:8891/#vnl='+state)))
        self.assertEqual(self.calls, [])

    def test_other_sites_and_duplicate_checks_are_passthrough(self):
        request=self.request(note('https://dictionary.example/'))
        self.bridge.invoke(request)
        self.assertEqual(self.calls[-1][1],request)
        self.calls.clear()
        request={'action':'canAddNotes','version':6,'params':{'notes':[note()]}}
        self.bridge.invoke(request)
        self.assertEqual(self.calls[-1][1],request)
        self.assertEqual(len(self.calls),1)

    def test_batch_and_multi_pin_the_context_and_reuse_uploads(self):
        r={'action':'multi','version':6,'params':{'actions':[self.request(),self.request()]}}
        self.bridge.invoke(r)
        self.assertEqual(sum(bool(x[1] and x[1]['action']=='storeMediaFile') for x in self.calls),2)
        self.assertEqual(self.calls[-1][1]['action'],'multi')
        with self.assertRaises(ValueError):config_checked({'port':8765})
        with self.assertRaises(ValueError):config_checked({'reader_origins':['http://192.168.1.2:8891']})


if __name__=='__main__':unittest.main()
