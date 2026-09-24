import json
from pathlib import Path
import tempfile
import unittest
from vnkit.shared_saves import SharedSaves, SaveConflict
import test_server as server_tests


def save(game='test',signature='sig',position=1):
    return dict(format='vnkit.save',version=1,gameId=game,gameSignature=signature,state={'position':position},savedAt='2026-09-19')


def update(revision=0, changes=None, game='test', signature='sig'):
    return dict(format='vnkit.shared-saves',version=1,gameId=game,gameSignature=signature,baseRevision=revision,changes=changes or {'autosave':save(game,signature)})


class SharedSavesTest(unittest.TestCase):
    def test_explicit_bank_replacement_keeps_history_and_cas(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            progress=dict(format='vnkit.progress',version=1,gameId='test',gameSignature='sig',globals={'13':1})
            previous={'slot 1':save(),'progress':progress}
            store.update('test',update(changes=previous))
            body={**update(1,{'slot 2':save(position=2)}),'replace':True,'operationId':'replace-operation-1234'}
            result=store.update('test',body)
            self.assertEqual(store.read('test')['records'],{'slot 2':save(position=2)})
            self.assertEqual(store.update('test',body),result)
            self.assertEqual(json.loads(store.db.execute('SELECT records FROM save_history WHERE revision=1').fetchone()[0]),previous)
            with self.assertRaises(SaveConflict):store.update('test',{**body,'operationId':'replace-operation-2345'})
            for value in [None,1,'yes']:
                with self.assertRaises(ValueError):store.update('test',{**update(2),'replace':value})
            with self.assertRaises(ValueError):store.update('test',{**update(2,{'slot 1':None}),'replace':True})
            store.update('test',{**update(2),'replace':True,'changes':{}})
            self.assertEqual(store.read('test')['records'],{})
            with self.assertRaises(SaveConflict):store.update('test',body)
            store.db.close()

    def test_delete_tombstone_is_atomic_idempotent_and_keeps_progress(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            progress=dict(format='vnkit.progress',version=1,gameId='test',gameSignature='sig',globals={'13':1})
            store.update('test',update(changes={'slot 1':save(),'slot 2':save(position=2),'progress':progress}))
            body={**update(1,{'slot 1':None}),'operationId':'delete-operation-1234'}
            result=store.update('test',body)
            self.assertEqual(store.update('test',body),result)
            self.assertEqual(store.read('test')['revision'],2)
            self.assertNotIn('slot 1',store.read('test')['records'])
            self.assertEqual(store.read('test')['records']['progress'],progress)
            self.assertEqual(store.read('test')['records']['slot 2'],save(position=2))
            with self.assertRaises(SaveConflict):store.update('test',update(1,{'slot 2':None}))
            for key in ['progress','progress-before-debug','activity','slot 16']:
                with self.assertRaises(ValueError):store.update('test',update(2,{key:None}))
            store.update('test',update(2,{'slot 1':None}))
            self.assertEqual(store.read('test')['revision'],2)
            self.assertIn('slot 1',json.loads(store.db.execute('SELECT records FROM save_history WHERE revision=1').fetchone()[0]))
            store.db.close();store=SharedSaves(folder)
            self.assertNotIn('slot 1',store.read('test')['records'])
            self.assertEqual(store.update('test',body),result)
            store.db.close()

    def test_retry_receipt_is_atomic_persistent_and_never_bypasses_newer_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            body={**update(), 'operationId':'original-operation-123'}
            result=store.update('test',body)
            self.assertEqual(store.update('test',body),result)
            self.assertEqual(store.read('test')['revision'],1)
            store.db.close();store=SharedSaves(folder)
            self.assertEqual(store.update('test',body),result)
            with self.assertRaises(ValueError):store.update('test',{**body,'changes':{'autosave':save(position=2)}})
            store.update('test',update(1,{'autosave':save(position=3)}))
            with self.assertRaises(SaveConflict):store.update('test',body)
            self.assertEqual(store.read('test')['records']['autosave']['state']['position'],3)
            store.db.close()

    def test_retry_receipts_are_bounded_and_identity_is_validated(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            for i in range(70):store.update('test',{**update(i,{'autosave':save(position=i)}),'operationId':f'operation-number-{i:05}'})
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM save_receipts').fetchone()[0],64)
            for value in ['',17,'bad/id', 'x'*129]:
                with self.assertRaises(ValueError):store.update('test',{**update(70),'operationId':value})
            store.db.close()

    def test_atomic_revision_conflicts_and_reopen(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            self.assertEqual(store.read('test')['revision'],0)
            progress=dict(format='vnkit.progress',version=1,gameId='test',gameSignature='sig',globals={'13':1})
            result=store.update('test',update(changes={'autosave':save(),'progress':progress}))
            self.assertEqual(result['revision'],1)
            with self.assertRaises(SaveConflict):store.update('test',update(changes={'autosave':save(position=2)}))
            self.assertEqual(store.read('test')['records']['autosave']['state']['position'],1)
            self.assertEqual(store.read('test')['records']['progress'],progress)
            store.db.close();store=SharedSaves(folder)
            self.assertEqual(store.read('test')['revision'],1)
            store.update('test',update(1,{'slot 15':save(position=15)}))
            self.assertEqual(store.read('test')['records']['slot 15']['state']['position'],15)
            store.db.close()

    def test_invalid_records_cannot_replace_valid_data(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder);store.update('test',update());before=store.read('test')
            bad=[update(1,{'activity':save()}), update(1,{'../file':save()}), update(1,{'autosave':save('different')}),update(1,{'autosave':save(signature='different')}),update(True),update(1,{'slot 16':save()}),update(1,{'progress':save()}),update(1,{'autosave':{**save(),'state':{'x':float('nan')}}}),update(1,{'autosave':{**save(),'state':{'x':'a'*600000}}})]
            for body in bad:
                with self.assertRaises(ValueError):store.update('test',body)
                self.assertEqual(store.read('test'),before)
            with self.assertRaises(SaveConflict):store.update('test',update(1,game='test',signature='other'))
            store.db.close()

    def test_bounded_history_and_independent_games(self):
        with tempfile.TemporaryDirectory() as folder:
            store=SharedSaves(folder)
            for revision in range(24):store.update('test',update(revision,{'autosave':save(position=revision)}))
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM save_history').fetchone()[0],20)
            same=store.read('test');store.update('test',update(24,{'autosave':same['records']['autosave']}));self.assertEqual(store.read('test')['revision'],24)
            self.assertEqual(store.read('another')['records'],{})
            store.db.close()


# Reuse HTTP setup/helpers without rerunning every inherited case in this module.
class SharedSavesHTTPTest(unittest.TestCase):
    setUpClass=classmethod(server_tests.HTTPTest.setUpClass.__func__)
    tearDownClass=classmethod(server_tests.HTTPTest.tearDownClass.__func__)
    request=server_tests.HTTPTest.request

    def test_private_api_auth_bounds_and_conflict(self):
        _,body,_=self.request('/api/saves/session');token=json.loads(body)['token']
        headers={'X-VNKit-Save-Token':token}
        self.assertEqual(self.request('/api/saves/test','POST',update())[0],403)
        self.assertEqual(self.request('/api/saves/test','POST',update(),{**headers,'Origin':'https://renji-xd.github.io'})[0],403)
        self.assertEqual(self.request('/api/saves/test',headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('/api/saves/missing','POST',update(),headers)[0],404)
        status,_,response_headers=self.request('/api/saves/test','POST',update(),headers)
        self.assertEqual(status,200)
        self.assertEqual(response_headers['Connection'],'close')
        self.assertEqual(self.request('/api/saves/test','POST',update(),headers)[0],409)
        self.assertEqual(self.request('/api/saves/test','POST',update(1,{'activity':save()}),headers)[0],400)
        status,data,_=self.request('/api/saves/test');self.assertEqual(status,200);self.assertEqual(json.loads(data)['records']['autosave'],save())
        deletion={**update(1,{'autosave':None}),'operationId':'http-delete-save-123'}
        self.assertEqual(self.request('/api/saves/test','POST',deletion)[0],403)
        self.assertEqual(self.request('/api/saves/test','POST',deletion,{**headers,'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('/api/saves/test','POST',deletion,headers)[0],200)
        self.assertEqual(self.request('/api/saves/test','POST',deletion,headers)[0],200)
        self.assertNotIn('autosave',json.loads(self.request('/api/saves/test')[1])['records'])
        self.assertEqual(self.request('/private/state/shared-saves.sqlite3')[0],404)

    def test_basic_auth_also_protects_shared_saves(self):
        self.server.password='test-private-password'
        try:self.assertEqual(self.request('/api/saves/test')[0],401)
        finally:self.server.password=None
