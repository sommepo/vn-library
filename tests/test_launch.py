"""CLI launch diagnostics; no listeners or private game data required."""
import errno
import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from vnkit.__main__ import main


class LaunchDiagnosticsTest(unittest.TestCase):
    def invoke_failure(self, arguments, error):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch('vnkit.server.serve', side_effect=error) as serve:
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = main(['serve', *arguments])
        # A collision must never silently retry on another port.
        serve.assert_called_once()
        self.assertEqual(result, 2)
        self.assertEqual(stdout.getvalue(), '')
        return stderr.getvalue(), serve.call_args.args

    def test_occupied_default_port_points_to_possible_existing_reader(self):
        output, called = self.invoke_failure([], OSError(errno.EADDRINUSE, 'Address already in use'))
        self.assertIn('127.0.0.1:8891: address already in use', output)
        self.assertIn('may already be running', output)
        self.assertIn('http://127.0.0.1:8891/', output)
        self.assertIn('No running process was stopped', output)
        self.assertEqual(called[2:4], ('127.0.0.1', 8891))

    def test_remote_collision_uses_configured_https_origin(self):
        output, called = self.invoke_failure(
            ['--host', '100.64.0.2', '--port', '9443',
             '--public-origin', 'https://reader.example:9443'],
            OSError(errno.EADDRINUSE, 'Address already in use'))
        self.assertIn('100.64.0.2:9443: address already in use', output)
        self.assertIn('https://reader.example:9443/', output)
        self.assertNotIn('http://127.0.0.1', output)
        self.assertEqual(called[2:4], ('100.64.0.2', 9443))

    def test_other_os_errors_keep_original_diagnostic(self):
        output, _ = self.invoke_failure([], OSError(errno.EACCES, 'Permission denied'))
        self.assertIn('Permission denied', output)
        self.assertNotIn('already be running', output)
        self.assertNotIn('http://', output)


if __name__ == '__main__':
    unittest.main()
