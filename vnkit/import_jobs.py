"""Private, resumable ISO transfer and a single CLI-backed conversion worker.

Browser inputs are opaque IDs, never paths or commands. Staging is not served.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from .adapters.registry import gui_adapter

ROOT = Path(__file__).resolve().parent.parent
CHUNK = 4 * 1024 * 1024
MAX_ISO = 9 * 1024**3
ACTIVE = {'inspecting', 'preflight', 'converting', 'validating', 'installing'}
class ImportJobs:
    def __init__(self, state, library, catalogue, source_root=None):
        self.root = Path(state) / 'imports'
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.library = Path(library)
        self.catalogue = catalogue
        self.source_root = Path(source_root or os.environ.get('VNKIT_IMPORT_SOURCE_DIR', ROOT)).resolve()
        self.lock = threading.RLock()
        self.worker = None
        self.accepting = True
        self.jobs = {}
        for p in self.root.glob('*/job.json'):
            if p.is_symlink() or p.parent.is_symlink():
                continue
            try:
                job = json.loads(p.read_text())
                if job.get('id') != p.parent.name or not re.fullmatch('[a-f0-9]{32}', job['id']):
                    continue
                if job.get('origin') not in {'upload','server'} or not isinstance(job.get('status'),str):
                    continue
            except (ValueError, OSError, KeyError, TypeError, AttributeError):
                # Preserve damaged metadata for local recovery; never stop the reader.
                continue
            self.jobs[job['id']] = job
            if job['status'] in ACTIVE:
                self.update(job, status='interrupted', message='Server restarted. Inspect again or resume conversion.')

    def update(self, job, **values):
        with self.lock:
            job.update(values, updated=time.time())
            directory = self.root / job['id']
            directory.mkdir(exist_ok=True, mode=0o700)
            temp = directory / 'job.tmp'
            with temp.open('w') as f:
                json.dump(job, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            temp.replace(directory / 'job.json')

    def sources(self):
        result = {}
        for p in sorted(self.source_root.glob('*')):
            if p.suffix.lower() != '.iso' or p.is_symlink() or not p.is_file():
                continue
            st = p.stat()
            key = hashlib.sha256(f'{p.name}:{st.st_size}:{st.st_mtime_ns}:{st.st_ctime_ns}'.encode()).hexdigest()[:32]
            result[key] = p
        return result

    def public(self, job):
        result = {k:v for k,v in job.items() if k not in {'source', 'source_stat', 'resumeKey'}}
        if job['origin'] == 'upload':
            p = self.root / job['id'] / 'source.iso'
            result['received'] = p.stat().st_size if p.exists() else 0
        try:
            self.path(job);result['sourceAvailable']=True
        except (ValueError,OSError):
            result['sourceAvailable']=False
        result['installed'] = job.get('gameId') in self.catalogue()[1]
        return result

    def listing(self):
        with self.lock:
            return {'uploadDirectory':str(self.root.resolve()), 'sources': [{'id':k,'name':p.name,'size':p.stat().st_size,'status':'On server'} for k,p in self.sources().items()],
                    'jobs':[self.public(j) for j in self.jobs.values()], 'chunkSize':CHUNK, 'maxSize':MAX_ISO,
                    'busy': bool(self.worker and self.worker.is_alive())}

    def get(self, ident):
        if not isinstance(ident, str) or ident not in self.jobs:
            raise ValueError('Unknown import job')
        return self.jobs[ident]

    def create(self, name, size, resume_key):
        if not isinstance(name,str) or len(name)>240 or not name.lower().endswith('.iso') or any(c in name for c in '/\\\x00'):
            raise ValueError('Choose an ISO filename without path components')
        if type(size) is not int or not 32768 <= size <= MAX_ISO:
            raise ValueError('ISO must be between 32 KiB and 9 GiB')
        if not isinstance(resume_key,str) or not re.fullmatch('[a-f0-9]{64}',resume_key):
            raise ValueError('Missing transfer identity')
        with self.lock:
            for job in self.jobs.values():
                if job['origin']=='upload' and job['name']==name and job['size']==size and job.get('resumeKey')==resume_key:
                    result=self.public(job)
                    p=self.root/job['id']/'source.iso'
                    with p.open('rb') as f:
                        result['prefixHashes']=[hashlib.sha256(b).hexdigest() for b in iter(lambda:f.read(CHUNK),b'')]
                    return result
            pending=[j for j in self.jobs.values() if j['status']=='uploading']
            if len(pending)>=4:
                raise ValueError('Finish the pending uploads before adding another')
            reserved=sum(j['size']-self.public(j)['received'] for j in pending)
            if shutil.disk_usage(self.root).free < size + reserved + 512*1024**2:
                raise ValueError('Not enough server disk space for this upload')
            job={'id':secrets.token_hex(16),'name':name,'size':size,'origin':'upload','status':'uploading','resumeKey':resume_key,'message':'Upload in progress'}
            self.jobs[job['id']]=job
            self.update(job)
            (self.root/job['id']/'source.iso').touch(exist_ok=False, mode=0o600)
            return self.public(job)

    def chunk(self, ident, offset, data):
        with self.lock:
            job=self.get(ident)
            if job['status']!='uploading' or job['origin']!='upload':
                raise ValueError('This job is not accepting upload chunks')
            if type(offset) is not int or offset<0 or not 0<len(data)<=CHUNK or offset+len(data)>job['size']:
                raise ValueError('Invalid upload range')
            p=self.root/ident/'source.iso'
            if p.is_symlink():
                raise ValueError('Unsafe upload target')
            with p.open('r+b') as f:
                f.seek(0,2);received=f.tell()
                if offset<received:
                    f.seek(offset)
                    if f.read(len(data))!=data:
                        raise ValueError('Retry differs from stored upload bytes')
                elif offset==received:
                    f.write(data);f.flush();os.fsync(f.fileno())
                else:
                    raise ValueError('Upload offset does not match received bytes; refresh and resume')
            if p.stat().st_size==job['size']:
                self.update(job,status='uploaded',message='ISO uploaded · ready to inspect')
            return self.public(job)

    def register(self, source_id):
        with self.lock:
            p=self.sources().get(source_id)
            if not p:
                raise ValueError('Server ISO is no longer available; refresh the list')
            for job in self.jobs.values():
                if job.get('source')==source_id:
                    return self.public(job)
            job={'id':secrets.token_hex(16),'source':source_id,'name':p.name,'size':p.stat().st_size,'origin':'server','status':'uploaded','message':'ISO already on server · ready to inspect'}
            self.jobs[job['id']]=job;self.update(job)
            return self.public(job)

    def path(self, job):
        if job['origin']=='upload':
            p=self.root/job['id']/'source.iso'
        else:
            p=self.sources().get(job['source'])
        if not p or p.is_symlink() or not p.is_file() or p.stat().st_size!=job['size']:
            raise ValueError('Source ISO changed or is missing')
        return p

    def start(self, ident, action):
        with self.lock:
            if not self.accepting:
                raise ValueError('The reader is stopping; restart it before importing')
            job=self.get(ident)
            if self.worker and self.worker.is_alive():
                raise ValueError('Another inspection or conversion is running')
            if action not in {'inspect','import','prepare'} or job['status']=='uploading':
                raise ValueError('Complete the upload before inspection or import')
            if action=='import' and (not job.get('adapter') or not job.get('sha256')):
                raise ValueError('Inspect a supported ISO first')
            if action=='import' and job.get('gameId') in self.catalogue()[1]:
                raise ValueError('This game is already in the library; its current import is preserved')
            self.update(job,status='inspecting' if action in ('inspect','prepare') else 'preflight',message='Identifying your game…' if action in ('inspect','prepare') else 'Checking import requirements')
            self.worker=threading.Thread(target=self.run,args=(job,action),daemon=True)
            self.worker.start()
            return self.public(job)

    def fingerprint(self,p):
        h=hashlib.sha256()
        with p.open('rb') as f:
            for block in iter(lambda:f.read(4*1024**2),b''):h.update(block)
        return h.hexdigest()

    def environment(self):
        env=os.environ.copy();root=ROOT/'private/tooling/audio-sysroot'
        if (root/'usr/bin').is_dir():
            env['PATH']=str(root/'usr/bin')+os.pathsep+env.get('PATH','')
            env['LD_LIBRARY_PATH']=':'.join([str(root/'usr/lib/x86_64-linux-gnu'),str(root/'usr/lib/x86_64-linux-gnu/pulseaudio'),env.get('LD_LIBRARY_PATH','')])
            env['XDG_CONFIG_HOME']=str(ROOT/'private/tooling/audio-config')
        return env

    def preflight(self,job,env):
        def probe(label,command,allowed=(0,)):
            tracked=job.get('id') in self.jobs
            if tracked:self.update(job,status='preflight',message=f'Checking {label}…')
            logpath=self.root/job['id']/'preflight.log' if tracked else None
            def log(text):
                if logpath:
                    with logpath.open('a',encoding='utf-8') as f:f.write(text+'\n')
            log(f'Checking {label} (60 second limit)')
            try:
                result=subprocess.run(command,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,capture_output=True,timeout=60)
            except subprocess.TimeoutExpired as error:
                for output in (error.stdout,error.stderr):
                    if output:log(output.decode('utf-8',errors='replace') if isinstance(output,bytes) else output)
                log(f'{label} timed out')
                output=error.stdout or b''
                output=output.decode('utf-8',errors='replace') if isinstance(output,bytes) else output
                stage=output.strip().splitlines()[-1][:180] if output.strip() else 'No startup output received'

                raise ValueError(f'{label} did not finish its startup check within 60 seconds. Last step: {stage}. Conversion has not started. Your ISO is kept. Check tools in the desktop app, then choose Try again. Details: state/imports/{job.get("id","unknown")}/preflight.log') from error
            except OSError as error:
                log(str(error))
                raise ValueError(f'Cannot start {label}: {error}. Your ISO is kept; fix the tool setup and choose Try again.') from error
            for output in (result.stdout,result.stderr):
                if output:log(output.decode('utf-8',errors='replace') if isinstance(output,bytes) else str(output))
            if result.returncode not in allowed:
                raise ValueError(f'{label} startup check failed (exit {result.returncode}). Conversion has not started. Your ISO is kept. Details: state/imports/{job.get("id","unknown")}/preflight.log')
            return result
        spec = gui_adapter(job['adapter'])
        if spec is None:
            raise ValueError('This adapter is not enabled for browser import')
        required=['node','ffmpeg','ffprobe']
        for tool in required:
            if not shutil.which(tool,path=env.get('PATH')):
                guide = f'docs/{spec.setup_guide}' if spec.setup_guide else 'the adapter documentation'
                raise ValueError(f'Missing {tool}; install the adapter dependencies in {guide} before retrying')
            probe(tool, [shutil.which(tool,path=env.get('PATH')),'--version' if tool=='node' else '-version'])
        if spec.preflight_profile == 'remember11':
            from .windows_tools import fluidsynth_probe_command
            probe('FluidSynth', fluidsynth_probe_command())
        if spec.preflight_profile == 'clannad':
            from .windows_tools import vgmstream_path
            result=probe('vgmstream', [str(vgmstream_path()),'-V'],allowed=(0,1))
            if b'r2117' not in result.stdout:raise ValueError('Pinned vgmstream r2117 is required')
        if spec.preflight_profile == 'remember11' and not Path(env.get('VNKIT_VGMTRANS',ROOT/'private/tooling/remember11-vgmtrans-shell')).is_file():
            raise ValueError('Remember11 needs the pinned VGMTrans tool; see docs/remember11-import.md')
        if shutil.disk_usage(self.root).free<24*1024**3:
            raise ValueError('Allow at least 24 GiB of free server space for conversion workspace and assets')

    def run(self,job,action):
        try:
            p=self.path(job);sha=self.fingerprint(p)
            if job.get('sha256') and job['sha256']!=sha:
                raise ValueError('ISO bytes changed. Start a new import; existing work is preserved')
            if action in ('inspect','prepare'):
                from .__main__ import detected_adapter
                adapter,identity=detected_adapter(p)
                spec = gui_adapter(adapter.ADAPTER_ID) if adapter else None
                if spec is None:
                    self.update(job,status='unsupported',message='No playable adapter for this edition. ISO retained; nothing imported.',sha256=sha)
                    return
                if hasattr(adapter, 'verify_import_source'):
                    adapter.verify_import_source(p)
                self.update(job,status='ready',sha256=sha,adapter=adapter.ADAPTER_ID,gameId=spec.gui_game_id,title=identity['title'],
                            message='Disc identified. Next: click Import game to convert it into a playable library. Basic support has documented fidelity limits.')
                if action=='inspect':return
                if job['gameId'] in self.catalogue()[1]:
                    self.update(job,status='complete',message='This game is already in your library. You can open it now.')
                    return
            self.preflight(job,self.environment())
            directory=self.root/job['id'];output=directory/'content';work=directory/'work'
            self.update(job,status='converting',message='Converting scripts and media. This can take a while; you may close this panel.')
            command=[sys.executable,'-m','vnkit','import',str(p),'--adapter',job['adapter'],'--work',str(work),'--out',str(output)]
            with (directory/'conversion.log').open('ab') as log:
                result=subprocess.run(command,cwd=ROOT,env=self.environment(),stdin=subprocess.DEVNULL,stdout=log,stderr=log)
            if result.returncode not in (0,3) or not (output/'content.json').is_file():
                raise ValueError('Conversion stopped. Private conversion.log has details; fix the cause and resume.')
            if self.fingerprint(self.path(job))!=job['sha256']:
                raise ValueError('Source changed during conversion; output stays private')
            self.update(job,status='validating',message='Validating converted scripts and resources')
            from .__main__ import validate
            report=validate(output)
            (directory/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            # Compatibility exit 3 is acceptable only for the adapter's explicit notices.
            spec = gui_adapter(job['adapter'])
            if spec is None:
                raise ValueError('This adapter is not enabled for browser import')
            unexpected=[e for e in report['errors'] if not e.startswith(spec.validation_notice_prefixes)]
            if unexpected or report.get('scriptValidation',{}).get('unresolvedReferences',0):
                raise ValueError('Validation failed. Output stays private; see validation.json before retrying.')
            if report.get('gameId')!=job['gameId'] or job['gameId'] in self.catalogue()[1]:
                raise ValueError('A library copy already exists or identity changed; no existing import was replaced')
            self.update(job,status='installing',message='Installing validated import')
            self.library.mkdir(parents=True,exist_ok=True)
            target=self.library/('import-'+job['id'])
            if target.exists():raise ValueError('Install target already exists')
            output.rename(target)
            self.update(job,status='complete',message='Imported · playable with limitations',warnings=report['errors'])
        except Exception as error:
            self.update(job,status='failed',message=str(error) if isinstance(error,ValueError) else f'{type(error).__name__}: import stopped. Check dependencies and private job logs.')
