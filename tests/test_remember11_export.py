import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from vnkit.adapters.remember11_media import export_bank
from vnkit.disc import FormatError

class ExportTests(unittest.TestCase):
 def test_literal_lf_and_space_paths(self):
  with tempfile.TemporaryDirectory(prefix='bank space ') as d:
   folder=Path(d)
   with patch('vnkit.adapters.remember11_media.subprocess.run') as run:
    def completed(command,**kw):
     self.assertEqual(kw['input'],b'collection export 0 .\nexit\n')
     self.assertNotIn('text',kw)
     self.assertEqual(command[1],str(folder/'bank.sq'))
     (folder/'Sony PS2 Seq.sf2').touch()
     return subprocess.CompletedProcess(command,0,b'',b'')
    run.side_effect=completed
    export_bank(folder/'converter.exe',folder)
 def test_binary_errors_are_readable(self):
  with tempfile.TemporaryDirectory() as d, patch('vnkit.adapters.remember11_media.subprocess.run',return_value=subprocess.CompletedProcess([],1,b'',b'Invalid argument \xff')):
   with self.assertRaisesRegex(FormatError,'Invalid argument'):
    export_bank(Path(d)/'converter.exe',Path(d))
