"""Install/start only this user's VN reader service, without sudo or routing edits.

An existing foreign unit is never overwritten and an existing listener is never
killed. A user can explicitly stop their old foreground reader before starting.
"""
import argparse
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
NAME = 'vnkit-reader.service'

def quoted(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'start', 'restart', 'stop', 'status'])
    args = parser.parse_args()
    env = dict(os.environ)
    env.setdefault('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')
    env.setdefault('DBUS_SESSION_BUS_ADDRESS', f'unix:path={env["XDG_RUNTIME_DIR"]}/bus')
    if args.action == 'install':
        directory = Path.home() / '.config/systemd/user'
        directory.mkdir(parents=True, exist_ok=True)
        unit = directory / NAME
        text = ('# Managed by this VN Import Toolkit checkout\n[Unit]\n'
                'Description=Local VN reader with private Tailscale HTTPS origin\n'
                '[Service]\nType=simple\n'
                f'ExecStart=/bin/sh {quoted(ROOT / "scripts/run-tailnet-reader.sh")}\n'
                'Environment=PYTHONDONTWRITEBYTECODE=1\n'
                'Restart=on-failure\nRestartSec=3\nUMask=0077\nNoNewPrivileges=yes\n'
                '[Install]\nWantedBy=default.target\n')
        if unit.is_symlink() or (unit.exists() and unit.read_text() != text):
            raise SystemExit(f'Refusing to overwrite an existing different service: {unit}')
        if not unit.exists():
            with unit.open('x') as stream:
                stream.write(text)
        subprocess.run(['systemctl', '--user', 'daemon-reload'], env=env, check=True)
        subprocess.run(['systemctl', '--user', 'enable', NAME], env=env, check=True)
        print(f'Installed {unit}. Stop any old foreground reader, then run this script with start.')
    else:
        result = subprocess.run(['systemctl', '--user', args.action, NAME, '--no-pager'], env=env)
        raise SystemExit(result.returncode)

if __name__ == '__main__':
    main()
