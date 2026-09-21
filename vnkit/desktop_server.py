"""Private stdin/stdout control protocol for the Windows tray host.

No extra HTTP control endpoint or remote shutdown permission is introduced.
"""
import argparse
import json
import sys
import time
from pathlib import Path
from .desktop import DesktopHost
from .windows_tools import configure


def emit(status, **fields):
    print(json.dumps(dict(status=status, **fields)), flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--data', required=True, type=Path)
    p.add_argument('--port', required=True, type=int)
    args = p.parse_args()
    if not 1 <= args.port <= 65535:
        p.error('Port must be 1–65535')
    configure()
    host = DesktopHost(args.data, args.port)
    try:
        host.start()
    except Exception as error:
        emit('error', message=str(error))
        return 2
    emit('running', url=host.url)
    for line in sys.stdin:
        try:
            command = json.loads(line)
            if command != {'action': 'stop'}:
                raise ValueError('Unknown desktop command')
            host.stop()
            emit('stopped')
            return 0
        except (ValueError, RuntimeError) as error:
            emit('error', message=str(error))
    # Parent exited. Finish an active conversion rather than abandon it halfway.
    while host.server:
        try:
            host.stop()
        except RuntimeError:
            time.sleep(1)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
