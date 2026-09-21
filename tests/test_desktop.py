"""Desktop host lifecycle tests; no GUI or private game files required."""
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from urllib.request import urlopen

from vnkit.desktop import DesktopHost


class DesktopTests(unittest.TestCase):
    def test_start_stop_restart_and_keep_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = DesktopHost(tmp, 0)
            try:
                host.start()
                with urlopen(host.url + 'api/health', timeout=3) as response:
                    self.assertTrue(json.load(response)['ok'])
                old = host.server
                host.start()
                self.assertIs(host.server, old)
                host.stop()
                self.assertTrue((Path(tmp) / 'state/shared-saves.sqlite3').exists())
                host.start()
                with urlopen(host.url, timeout=3) as response:
                    self.assertEqual(response.status, 200)
            finally:
                host.stop()

    def test_collision_leaves_other_listener_alone(self):
        with tempfile.TemporaryDirectory() as tmp, socket.socket() as other:
            other.bind(('127.0.0.1', 0))
            other.listen()
            host = DesktopHost(tmp, other.getsockname()[1])
            with self.assertRaises(OSError):
                host.start()
            self.assertIsNone(host.server)
            self.assertFalse((Path(tmp) / 'state').exists())
            with socket.create_connection(other.getsockname(), timeout=1):
                pass
            host.stop()

    def test_same_data_cannot_run_on_second_port(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = DesktopHost(tmp, 0), DesktopHost(tmp, 0)
            try:
                a.start()
                with self.assertRaisesRegex(OSError, 'another desktop launcher'):
                    b.start()
                a.stop()
                b.start()
            finally:
                a.stop()
                b.stop()

    def test_stop_refuses_active_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = DesktopHost(tmp, 0)
            done = threading.Event()
            worker = threading.Thread(target=done.wait)
            try:
                host.start()
                worker.start()
                host.server.import_jobs.worker = worker
                with self.assertRaisesRegex(RuntimeError, 'Wait for it to finish'):
                    host.stop()
                self.assertTrue(host.server.import_jobs.accepting)
                with urlopen(host.url + 'api/health', timeout=3) as response:
                    self.assertEqual(response.status, 200)
            finally:
                done.set()
                if worker.ident is not None:
                    worker.join()
                host.stop()


if __name__ == '__main__':
    unittest.main()
