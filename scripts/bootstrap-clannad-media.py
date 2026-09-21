#!/usr/bin/env python3
"""Install the pinned optional AHX decoder into the project's private cache."""
import argparse
import hashlib
from pathlib import Path
import sys
import urllib.request
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.disc import write_bytes

REVISION='r2117'
SHA256='2f98c77f756079f63fbd119939067f1ed461d77e70993bc4cc372736d859c84a'
URL=f'https://github.com/vgmstream/vgmstream/releases/download/{REVISION}/vgmstream-linux.zip'
ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cached-only',action='store_true');a=p.parse_args()
    cache=ROOT/'private/tooling/clannad-research/vgmstream';archive=cache/f'vgmstream-linux-{REVISION}.zip'
    if not archive.is_file():
        if a.cached_only:raise ValueError('Pinned vgmstream archive is absent')
        with urllib.request.urlopen(URL,timeout=60) as response:write_bytes(cache,archive.name,response.read(16*1024*1024))
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA256:raise ValueError('vgmstream checksum mismatch')
    target=ROOT/f'private/tooling/vgmstream-{REVISION}'
    with zipfile.ZipFile(archive) as z:
        if z.namelist()!=['vgmstream-cli']:raise ValueError('Unexpected decoder archive contents')
        write_bytes(target,'vgmstream-cli',z.read('vgmstream-cli'))
    (target/'vgmstream-cli').chmod(0o755)
    print(target/'vgmstream-cli')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError) as error:raise SystemExit(str(error))
