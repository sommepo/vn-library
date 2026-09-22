import hashlib
import io
import json
from pathlib import Path
import tempfile
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from vnkit.import_jobs import ImportJobs, CHUNK


class ImportJobsTests(unittest.TestCase):
    def test_prepare_identifies_and_converts_without_second_request(self):
        job=self.upload();ident='remember11-slpm65550-1.02'
        adapter=SimpleNamespace(ADAPTER_ID='remember11-ps2')
        output=self.jobs.root/job['id']/'content';output.mkdir();(output/'content.json').write_text('{"id":"'+ident+'"}')
        with patch('vnkit.__main__.detected_adapter',return_value=(adapter,{'title':'Synthetic identification'})),patch.object(self.jobs,'preflight') as preflight,patch('vnkit.import_jobs.subprocess.run',return_value=subprocess.CompletedProcess([],0)),patch('vnkit.__main__.validate',return_value={'gameId':ident,'errors':[]}):
            self.jobs.run(job,'prepare')
        preflight.assert_called_once()
        self.assertEqual(job['status'],'complete')
        self.assertTrue((self.root/'library'/('import-'+job['id'])/'content.json').exists())

    def test_prepare_stops_for_unsupported_disc_without_converting(self):
        job=self.upload()
        with patch('vnkit.__main__.detected_adapter',return_value=(None,{})),patch.object(self.jobs,'preflight') as preflight:
            self.jobs.run(job,'prepare')
        preflight.assert_not_called();self.assertEqual(job['status'],'unsupported')

    def test_prepare_keeps_existing_library_copy(self):
        job=self.upload();ident='remember11-slpm65550-1.02'
        adapter=SimpleNamespace(ADAPTER_ID='remember11-ps2')
        self.jobs.catalogue=lambda:([],{ident:self.root/'existing'})
        with patch('vnkit.__main__.detected_adapter',return_value=(adapter,{'title':'Synthetic identification'})),patch.object(self.jobs,'preflight') as preflight:
            self.jobs.run(job,'prepare')
        preflight.assert_not_called();self.assertEqual(job['status'],'complete')
        self.assertIn('already in your library',job['message'])

    def test_timeout_names_tool_and_preserves_iso_and_private_log(self):
        job=self.upload();source=self.jobs.path(job)
        self.jobs.update(job,adapter='remember11-ps2',sha256=self.jobs.fingerprint(source))
        with patch('vnkit.import_jobs.shutil.which',return_value='/tools/node.exe'),patch('vnkit.import_jobs.subprocess.run',side_effect=subprocess.TimeoutExpired(['node'],60,stderr=b'startup detail')) as run:
            self.jobs.run(job,'import')
        self.assertEqual(job['status'],'failed')
        self.assertIn('node did not finish its startup check within 60 seconds',job['message'])
        self.assertIn('Conversion has not started',job['message'])
        self.assertEqual(source.read_bytes(),b'x'*32768)
        self.assertIn('startup detail',(self.jobs.root/job['id']/'preflight.log').read_text())
        self.assertEqual(run.call_count,1)
        self.assertEqual(run.call_args.kwargs['timeout'],60)

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.sources=self.root/'sources';self.sources.mkdir()
        self.jobs=ImportJobs(self.root/'state',self.root/'library',lambda:([],{}),self.sources)

    def tearDown(self):self.tmp.cleanup()

    def upload(self,data=b'x'*32768):
        j=self.jobs.create('test.iso',len(data),'a'*64)
        self.jobs.chunk(j['id'],0,data)
        return self.jobs.get(j['id'])

    def test_upload_retry_resume_and_restart(self):
        data=b'x'*(CHUNK+32768);job=self.jobs.create('test.iso',len(data),'a'*64)
        self.jobs.chunk(job['id'],0,data[:CHUNK]);self.jobs.chunk(job['id'],0,data[:CHUNK])
        with self.assertRaises(ValueError):self.jobs.chunk(job['id'],0,b'bad')
        restarted=ImportJobs(self.root/'state',self.root/'library',lambda:([],{}),self.sources)
        resume=restarted.create('test.iso',len(data),'a'*64)
        self.assertEqual(resume['received'],CHUNK)
        self.assertEqual(resume['prefixHashes'],[hashlib.sha256(data[:CHUNK]).hexdigest()])
        result=restarted.chunk(job['id'],CHUNK,data[CHUNK:]);self.assertEqual(result['status'],'uploaded')
        self.assertEqual((restarted.root/job['id']/'source.iso').read_bytes(),data)

    def test_bounds_and_no_source_path_access(self):
        for name in ('../disc.iso','a/b.iso','a\\b.iso','disc.txt'):
            with self.assertRaises(ValueError):self.jobs.create(name,32768,'a'*64)
        job=self.jobs.create('test.iso',32768,'a'*64)
        with self.assertRaises(ValueError):self.jobs.chunk(job['id'],1,b'gap')
        with self.assertRaises(ValueError):self.jobs.chunk(job['id'],0,b'x'*32769)
        with self.assertRaises(ValueError):self.jobs.register('/etc/passwd')
        with self.assertRaises(ValueError):self.jobs.start(job['id'],'inspect')
        (self.sources/'outside.iso').symlink_to('/etc/passwd')
        self.assertEqual(self.jobs.sources(),{})

    def test_source_changed_and_failed_inspection_are_not_imported(self):
        p=self.sources/'disc.iso';p.write_bytes(b'x'*32768)
        source=next(iter(self.jobs.sources()));job=self.jobs.get(self.jobs.register(source)['id'])
        p.write_bytes(b'y'*32768)
        with self.assertRaises(ValueError):self.jobs.path(job)
        job=self.upload();self.jobs.run(job,'inspect')
        self.assertIn(job['status'],('failed','unsupported'));self.assertFalse((self.root/'library').exists())

    def test_interrupted_status_is_recoverable(self):
        job=self.upload();self.jobs.update(job,status='converting')
        restarted=ImportJobs(self.root/'state',self.root/'library',lambda:([],{}),self.sources)
        self.assertEqual(restarted.get(job['id'])['status'],'interrupted')

    def test_cli_staging_and_known_partial_validation(self):
        job=self.upload();self.jobs.update(job,adapter='clannad-ps2',sha256=self.jobs.fingerprint(self.jobs.path(job)),gameId='test-game')
        output=self.jobs.root/job['id']/'content';output.mkdir();(output/'content.json').write_text('{"id":"test-game"}')
        report={'errors':['CLANNAD import is incomplete: known presentation limits'],'gameId':'test-game','scriptValidation':{'unresolvedReferences':0}}
        with patch.object(self.jobs,'preflight'),patch('vnkit.import_jobs.subprocess.run') as run,patch('vnkit.__main__.validate',return_value=report):
            run.return_value.returncode=3;self.jobs.run(job,'import')
            self.assertEqual(run.call_args.args[0][1:4],['-m','vnkit','import'])
        self.assertEqual(job['status'],'complete');self.assertTrue((self.root/'library'/('import-'+job['id'])/'content.json').exists())

    def test_bad_validation_never_installs(self):
        job=self.upload();self.jobs.update(job,adapter='clannad-ps2',sha256=self.jobs.fingerprint(self.jobs.path(job)),gameId='test-game')
        output=self.jobs.root/job['id']/'content';output.mkdir();(output/'content.json').write_text('{}')
        with patch.object(self.jobs,'preflight'),patch('vnkit.import_jobs.subprocess.run') as run,patch('vnkit.__main__.validate',return_value={'errors':['Missing asset'],'gameId':'test-game'}):
            run.return_value.returncode=3;self.jobs.run(job,'import')
        self.assertEqual(job['status'],'failed');self.assertTrue(output.exists());self.assertFalse((self.root/'library').exists())

    def test_never7_only_installs_with_a_complete_story_census(self):
        for census, accepted in [({'unsupported':0,'unresolvedReferences':0},True),
                                 ({'unsupported':1,'unresolvedReferences':0},False),
                                 ({'unsupported':0,'unresolvedReferences':1},False),
                                 ({},False), ({'unsupported':False,'unresolvedReferences':0},False)]:
            with self.subTest(census=census):
                data=bytes([len(self.jobs.jobs)+1])*32768
                created=self.jobs.create('never7-test.iso',len(data),hashlib.sha256(data).hexdigest())
                self.jobs.chunk(created['id'],0,data)
                job=self.jobs.get(created['id'])
                self.jobs.update(job,adapter='never7-ps2',sha256=self.jobs.fingerprint(self.jobs.path(job)),gameId='never7-slps25256-1.01')
                output=self.jobs.root/job['id']/'content';output.mkdir();(output/'content.json').write_text('{}')
                report={'gameId':job['gameId'],'errors':['Never7 experimental runtime remains incomplete: native presentation'], 'scriptValidation':census}
                with patch.object(self.jobs,'preflight'),patch('vnkit.import_jobs.subprocess.run',return_value=subprocess.CompletedProcess([],3)),patch('vnkit.__main__.validate',return_value=report):
                    self.jobs.run(job,'import')
                self.assertEqual(job['status'],'complete' if accepted else 'failed')
                self.assertEqual((self.root/'library'/('import-'+job['id'])).exists(),accepted)
                self.assertEqual(output.exists(),not accepted)

    def test_supported_editions_are_exposed_for_the_add_game_screen(self):
        labels=[row['label'] for row in self.jobs.listing()['editions']]
        self.assertEqual(labels,['PS2 CLANNAD SLPM-66302 v1.01','PS2 Remember11 SLPM-65550 v1.02','PS2 Never7 SLPS-25256 v1.01'])

if __name__=='__main__':unittest.main()
