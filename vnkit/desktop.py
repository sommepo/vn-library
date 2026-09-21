"""Small, dependency-free desktop host. Run with python -m vnkit.desktop."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent.parent


def default_data():
    if os.name == 'nt':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'VN Import Toolkit'
    return ROOT / 'private'


class DesktopHost:
    """Own exactly one loopback listener; never adopt or kill another process."""
    def __init__(self, data, port=8891):
        self.data = Path(data).resolve()
        self.port = port
        self.server = None
        self.thread = None
        self._lock_file = None

    def _lock_data(self):
        self.data.mkdir(parents=True, exist_ok=True)
        lock = (self.data / 'desktop.lock').open('a+b')
        try:
            if os.name == 'nt':
                import msvcrt
                if lock.tell() == 0:
                    lock.write(b'0')
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            lock.close()
            raise OSError('This data folder is already open in another desktop launcher') from None
        self._lock_file = lock

    @property
    def url(self):
        port = self.server.server_address[1] if self.server else self.port
        return f'http://127.0.0.1:{port}/'

    def start(self):
        if self.server:
            return
        from .server import ReaderServer
        class LocalServer(ReaderServer):
            # Windows SO_REUSEADDR can let two listeners bind the same port.
            allow_reuse_address = False
            def server_bind(self):
                import socket
                if os.name == 'nt':
                    self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                super().server_bind()
        self._lock_data()
        try:
            server = LocalServer(('127.0.0.1', self.port), self.data / 'library', self.data / 'state')
        except Exception:
            self._lock_file.close()
            self._lock_file = None
            raise
        thread = threading.Thread(target=server.serve_forever, name='VN reader', daemon=True)
        thread.start()
        self.server, self.thread = server, thread

    def stop(self):
        if not self.server:
            return
        server = self.server
        with server.import_jobs.lock:
            worker = server.import_jobs.worker
            if worker and worker.is_alive():
                raise RuntimeError('An ISO is being inspected or imported. Wait for it to finish before stopping.')
            server.import_jobs.accepting = False
        server.shutdown()
        self.thread.join(timeout=5)
        # Disconnect live text clients before closing their database.
        with server.relay.lock:
            import socket
            for client in list(server.relay.clients):
                try:
                    client.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            server.relay.db.close()
        server.server_close()
        self.server = self.thread = None
        self._lock_file.close()
        self._lock_file = None


def main(argv=None):
    if os.name == 'nt':
        import sys
        os.environ['PYTHONUTF8'] = '1'
        if not sys.flags.utf8_mode:
            raise SystemExit('Please start with: py -3 -X utf8 -m vnkit.desktop')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=default_data())
    parser.add_argument('--port', type=int, default=8891)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    import tkinter as tk
    from tkinter import ttk, messagebox
    host = DesktopHost(args.data, args.port)
    window = tk.Tk()
    window.title('VN Import Toolkit')
    window.minsize(460, 260)
    frame = ttk.Frame(window, padding=24)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='VN Import Toolkit', font=('Segoe UI', 18)).pack(anchor='w')
    status = tk.StringVar(value='Stopped')
    ttk.Label(frame, textvariable=status, wraplength=440).pack(anchor='w', pady=(16, 8))
    address = ttk.Label(frame, text=host.url)
    address.pack(anchor='w')
    buttons = ttk.Frame(frame)
    buttons.pack(anchor='w', pady=18)

    def refresh():
        running = host.server is not None
        start_button.configure(state='disabled' if running else 'normal')
        stop_button.configure(state='normal' if running else 'disabled')
        open_button.configure(state='normal' if running else 'disabled')
        address.configure(text=host.url)

    def start():
        try:
            host.start()
            status.set('Running. You can minimise this window while you read.')
        except OSError as error:
            status.set(f'Could not start: {error}. If the port is in use, close the other reader or choose another port with --port.')
        refresh()

    def stop(confirm=True):
        if confirm and not messagebox.askokcancel('Stop reader?', 'Save your position in the browser first. This disconnects every reader using this server.', parent=window):
            return False
        try:
            host.stop()
        except RuntimeError as error:
            messagebox.showinfo('Import running', str(error), parent=window)
            return False
        status.set('Stopped. Your imported games and server saves are kept.')
        refresh()
        return True

    def close():
        if not host.server or stop():
            window.destroy()

    start_button = ttk.Button(buttons, text='Start', command=start)
    start_button.pack(side='left', padx=(0, 8))
    open_button = ttk.Button(buttons, text='Open reader', command=lambda: webbrowser.open(host.url))
    open_button.pack(side='left', padx=(0, 8))
    stop_button = ttk.Button(buttons, text='Stop', command=stop)
    stop_button.pack(side='left')
    ttk.Label(frame, text=f'Games and server saves:\n{host.data}', wraplength=440).pack(anchor='w')
    ttk.Label(frame, text='Local access only · No account needed', foreground='#666666').pack(anchor='w', pady=(12, 0))
    window.protocol('WM_DELETE_WINDOW', close)
    window.after(100, start)
    window.mainloop()


if __name__ == '__main__':
    main()
