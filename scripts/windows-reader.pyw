"""Double-click launcher; Python 3.11+ with Tk must be installed."""
from pathlib import Path
import os
import sys
import traceback

# Japanese manifests must not use the Windows locale's default encoding.
os.environ['PYTHONUTF8'] = '1'
if not sys.flags.utf8_mode:
    os.execv(sys.executable, [sys.executable, '-X', 'utf8', str(Path(__file__).resolve()), *sys.argv[1:]])

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.desktop import default_data, main

data = default_data()
data.mkdir(parents=True, exist_ok=True)
# pythonw has no console streams. HTTP logging must still have a writable target.
log_path = data / 'desktop.log'
if log_path.exists() and log_path.stat().st_size > 2 * 1024 * 1024:
    log_path.replace(data / 'desktop.previous.log')
with log_path.open('a', encoding='utf-8', buffering=1) as log:
    sys.stdout = sys.stderr = log
    try:
        main()
    except Exception:
        traceback.print_exc()
        import tkinter.messagebox
        tkinter.messagebox.showerror('VN Import Toolkit', f'Could not open the reader. Details are in:\n{log_path}')
