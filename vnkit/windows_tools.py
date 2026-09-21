"""App-local Windows tools; never modify the system PATH or load arbitrary DLLs."""
import ctypes
import ctypes.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def configure(root=None):
    """Called by the installed host before starting HTTP or import subprocesses."""
    root = Path(root or ROOT / 'tools').resolve()
    if os.name != 'nt':
        return
    paths = [root / 'node', root / 'ffmpeg/bin', root / 'vgmstream', root / 'fluidsynth/bin']
    os.environ['PATH'] = os.pathsep.join(map(str, paths)) + os.pathsep + os.environ.get('PATH', '')
    os.environ['VNKIT_VGMSTREAM'] = str(root / 'vgmstream/vgmstream-cli.exe')
    os.environ['VNKIT_VGMTRANS'] = str(root / 'vgmtrans/vgmtrans-shell.exe')
    os.environ['VNKIT_FLUIDSYNTH'] = str(root / 'fluidsynth/bin/libfluidsynth-3.dll')
    os.environ['PYTHONUTF8'] = '1'


def vgmstream_path():
    return Path(os.environ.get('VNKIT_VGMSTREAM', ROOT / 'private/tooling/vgmstream-r2117/vgmstream-cli'))


def load_fluidsynth(library=None):
    name = library or os.environ.get('VNKIT_FLUIDSYNTH') or ctypes.util.find_library('fluidsynth') or 'libfluidsynth.so.3'
    # Python 3.8+ does not search PATH for dependent Windows DLLs.
    if os.name == 'nt' and Path(name).is_absolute():
        with os.add_dll_directory(str(Path(name).parent)):
            return ctypes.CDLL(str(name))
    return ctypes.CDLL(str(name))


def fluidsynth_probe_command():
    return [sys.executable, '-X', 'utf8', '-u', '-m', 'vnkit.windows_tools', '--probe-fluidsynth']


def probe_fluidsynth():
    """One-shot DLL check with flushed stages for private timeout diagnostics."""
    print('Starting FluidSynth check', flush=True)
    configure()
    if os.name == 'nt':
        # A missing DLL must produce an error, not a hidden Windows dialog.
        ctypes.windll.kernel32.SetErrorMode(0x0001 | 0x8000)
    print('Loading FluidSynth library', flush=True)
    lib = load_fluidsynth()
    print('Reading FluidSynth version', flush=True)
    lib.fluid_version_str.restype = ctypes.c_char_p
    version = lib.fluid_version_str().decode()
    if version != '2.4.8':
        raise ValueError('Expected FluidSynth 2.4.8; found ' + version)
    print('FluidSynth ' + version + ' OK', flush=True)


def check():
    configure()
    results = {}
    for name, command in {
        'Node': ['node', '--version'], 'FFmpeg': ['ffmpeg', '-version'],
        'FFprobe': ['ffprobe', '-version'], 'vgmstream': [str(vgmstream_path()), '-V'],
    }.items():
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if result.returncode not in ((0, 1) if name == 'vgmstream' else (0,)):
            raise ValueError(f'{name} exited with code {result.returncode}: {result.stderr[:300]}')
        results[name] = result.stdout.splitlines()[0]
        if name == 'vgmstream' and 'r2117' not in result.stdout:
            raise ValueError('Expected vgmstream r2117')
    result = subprocess.run(fluidsynth_probe_command(), stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise ValueError('FluidSynth check failed: ' + result.stderr[-1000:])
    results['FluidSynth'] = result.stdout.strip().splitlines()[-1]
    tool = Path(os.environ['VNKIT_VGMTRANS'])
    result = subprocess.run([str(tool)], input=b'exit\n', capture_output=True, timeout=60)
    if result.returncode:
        raise ValueError('VGMTrans failed to start: ' + result.stderr[-300:].decode('utf-8',errors='replace'))
    results['VGMTrans'] = 'Started successfully'
    return results


if __name__ == '__main__':
    if sys.argv[1:] == ['--probe-fluidsynth']:
        probe_fluidsynth()
    else:
        print(json.dumps(check(), ensure_ascii=False, indent=2))
