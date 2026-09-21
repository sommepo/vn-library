"""Portable Windows-host contracts; actual WinForms/installer need device testing."""
import json
import io
from contextlib import redirect_stdout
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from vnkit.windows_tools import vgmstream_path, load_fluidsynth, probe_fluidsynth
from vnkit.import_jobs import ImportJobs

ROOT=Path(__file__).resolve().parents[1]

class ToolTests(unittest.TestCase):
    def test_configured_decoder_and_fluidsynth(self):
        with patch.dict(os.environ,{'VNKIT_VGMSTREAM':'/test/tools/decoder.exe','VNKIT_FLUIDSYNTH':'/test/tools/synth.dll'}):
            self.assertEqual(str(vgmstream_path()),'/test/tools/decoder.exe')
            with patch('vnkit.windows_tools.ctypes.CDLL') as dll:
                load_fluidsynth()
                dll.assert_called_once_with('/test/tools/synth.dll')

    def test_remember_preflight_does_not_require_vgmstream(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);tool=root/'converter.exe';tool.touch()
            jobs=ImportJobs(root/'state',root/'library',lambda:([],{}),root)
            with patch('vnkit.import_jobs.shutil.which',return_value='/tool'),patch('vnkit.import_jobs.subprocess.run') as run,patch('vnkit.import_jobs.shutil.disk_usage') as disk:
                run.return_value=subprocess.CompletedProcess([],0,b'ok',b'')
                disk.return_value.free=30*1024**3
                jobs.preflight({'adapter':'remember11-ps2'},{'VNKIT_VGMTRANS':str(tool)})
                calls=[str(c.args[0]) for c in run.call_args_list]
                for call in run.call_args_list:
                    self.assertEqual(call.kwargs['stdin'], subprocess.DEVNULL)
                self.assertFalse(any('vgmstream' in command for command in calls))
                self.assertTrue(any('--probe-fluidsynth' in command for command in calls))

    def test_fluidsynth_probe_reports_stages_and_rejects_wrong_version(self):
        with patch('vnkit.windows_tools.configure'), patch('vnkit.windows_tools.load_fluidsynth') as load:
            load.return_value.fluid_version_str.return_value = b'2.4.8'
            out = io.StringIO()
            with redirect_stdout(out): probe_fluidsynth()
            self.assertIn('Loading FluidSynth library', out.getvalue())
            self.assertIn('FluidSynth 2.4.8 OK', out.getvalue())
            load.return_value.fluid_version_str.return_value = b'0.0.0'
            with redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'Expected FluidSynth'):
                probe_fluidsynth()

    def test_installer_tool_pins_and_application_only_package_policy(self):
        lock=json.loads((ROOT/'windows/tools.lock.json').read_text())
        self.assertEqual(set(lock['tools']),{'python','node','ffmpeg','vgmstream','fluidsynth'})
        for record in lock['tools'].values():
            self.assertRegex(record['sha256'],r'^[a-f0-9]{64}$')
            self.assertTrue(record['url'].startswith('https://'))
            self.assertNotIn('/latest/',record['url'])
        from vnkit.package import TREES
        self.assertNotIn('.exe',TREES['windows'])
        self.assertNotIn('private',TREES)

class DesktopProtocolTests(unittest.TestCase):
    def test_control_pipe_stops_only_own_server(self):
        with tempfile.TemporaryDirectory() as tmp, socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1];reservation.close()
            p=subprocess.Popen([sys.executable,'-X','utf8','-m','vnkit.desktop_server','--data',tmp,'--port',str(port)],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                message=json.loads(p.stdout.readline())
                self.assertEqual(message['status'],'running')
                self.assertEqual(message['url'],f'http://127.0.0.1:{port}/')
                p.stdin.write('{"action":"unsupported"}\n');p.stdin.flush()
                self.assertEqual(json.loads(p.stdout.readline())['status'],'error')
                output,error=p.communicate('{"action":"stop"}\n',timeout=10)
                self.assertEqual(p.returncode,0,error)
                self.assertEqual(json.loads(output)['status'],'stopped')
            finally:
                if p.poll() is None:p.kill()
                p.communicate()

if __name__=='__main__':unittest.main()
