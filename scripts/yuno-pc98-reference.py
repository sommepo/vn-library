#!/usr/bin/env python3
"""Prepare a private, offline PC-98 comparison harness, not a reader import.

Requires a locally obtained WebNP2 core/FreeDOS image and NP2kai HOSTDRV.COM.
No upstream frontend code is used. Never serve the repository itself.
"""
import argparse
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.disc import IsoImage, write_bytes, write_json


def add_fat12_files(image, files):
    """Add/replace root files on the known 1.23 MB FreeDOS boot disk copy."""
    disk = bytearray(image)
    ss, sc, reserved, fats, roots, total, media, spf = struct.unpack_from('<HBHBHHBH', disk, 11)
    if (ss, sc, reserved, fats, roots, total, spf) != (1024, 1, 1, 2, 192, 1232, 2) or len(disk) != total * ss:
        raise ValueError('unexpected FreeDOS FAT12 disk geometry')
    fat_start, root_start = reserved * ss, (reserved + fats * spf) * ss
    data_start = root_start + roots * 32
    def get(c):
        word = struct.unpack_from('<H', disk, fat_start + c * 3 // 2)[0]
        return (word >> 4 if c & 1 else word) & 0xfff
    def put(c, value):
        for copy in range(fats):
            at = fat_start + copy * spf * ss + c * 3 // 2
            word = struct.unpack_from('<H', disk, at)[0]
            struct.pack_into('<H', disk, at, (word & 15 | value << 4) if c & 1 else (word & 0xf000 | value))
    for name, content in files.items():
        stem, _, ext = name.partition('.')
        if not stem or len(stem) > 8 or len(ext) > 3:
            raise ValueError('expected DOS 8.3 root filename')
        encoded = (stem.upper().ljust(8) + ext.upper().ljust(3)).encode('ascii')
        slots = range(root_start, data_start, 32)
        at = next((p for p in slots if disk[p:p + 11] == encoded), None)
        if at is not None:
            c = struct.unpack_from('<H', disk, at + 26)[0]
            visited = set()
            while 2 <= c < 0xff8:
                if c in visited or c >= (len(disk) - data_start) // ss + 2:
                    raise ValueError('invalid existing FAT chain')
                visited.add(c)
                nxt = get(c)
                put(c, 0)
                c = nxt
        else:
            at = next((p for p in slots if disk[p] in (0, 0xe5)), None)
        if at is None:
            raise ValueError('boot disk root directory is full')
        needed = (len(content) + ss - 1) // ss
        free = [c for c in range(2, (len(disk) - data_start) // ss + 2) if not get(c)][:needed]
        if len(free) != needed:
            raise ValueError('boot disk is full')
        disk[at:at + 32] = bytes(32)
        disk[at:at + 11] = encoded
        disk[at + 11] = 0x20
        struct.pack_into('<HI', disk, at + 26, free[0] if free else 0, len(content))
        for i, c in enumerate(free):
            put(c, free[i + 1] if i + 1 < needed else 0xfff)
            offset = data_start + (c - 2) * ss
            disk[offset:offset + ss] = content[i * ss:(i + 1) * ss].ljust(ss, b'\0')
    return disk


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--recovery', type=Path, required=True)
    p.add_argument('--webnp2', type=Path, required=True)
    p.add_argument('--np2kai', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--trace', action='store_true', help='add original diagnostic TSR; requires GNU as and objcopy')
    p.add_argument('--observe', action='store_true', help='add the expanded native execution observer')
    args = p.parse_args()
    iso = IsoImage(args.recovery / 'media/data.iso')
    names = ['AI5X.EXE', 'AMD.COM', 'PLAY6.COM', 'YUNO.BAT']
    names += [f'YUNO_{c}' for c in 'ABCDEFGHIJKLMNO']
    names += ['FLAG00'] + [f'FLAG{n}{m}' for n in (1, 2, 3) for m in range(9)]
    for name in names:
        write_bytes(args.out / 'game', name, iso.read(name))
    for name in ('emnp21kai_sdl2.js', 'emnp21kai_sdl2.wasm', 'font.bmp', 'LICENSE.NP2kai'):
        write_bytes(args.out / 'core', name, (args.webnp2 / 'public/core' / name).read_bytes())
    boot_files = {
        'HOSTDRV.COM': (args.np2kai / 'np2tool/HOSTDRV.COM').read_bytes(),
        'AUTOEXEC.BAT': b'@ECHO OFF\r\nHOSTDRV C\r\nC:\r\nYUNO.BAT\r\n',
    }
    if args.trace or args.observe:
        with tempfile.TemporaryDirectory(prefix='vnkit-text-probe-') as tmp:
            tmp = Path(tmp)
            source = 'pc98-runtime-probe.s' if args.observe else 'pc98-text-probe.s'
            subprocess.run(['as', '--32', str(Path(__file__).with_name(source)), '-o', str(tmp / 'probe.o')], check=True, timeout=20)
            subprocess.run(['objcopy', '-O', 'binary', '-j', '.text', str(tmp / 'probe.o'), str(tmp / 'probe.bin')], check=True, timeout=20)
            boot_files['VNTRACE.COM'] = (tmp / 'probe.bin').read_bytes()[0x100:]
            boot_files['AUTOEXEC.BAT'] = b'@ECHO OFF\r\nVNTRACE.COM\r\nHOSTDRV C\r\nC:\r\nYUNO.BAT\r\n'
    boot = add_fat12_files((args.webnp2 / 'public/freedos/fd98_2hd.xdf').read_bytes(), boot_files)
    write_bytes(args.out, 'boot.xdf', boot)
    write_json(args.out, 'files.json', names)
    write_bytes(args.out, 'index.html', HTML.encode())
    print(f'Private comparison files: {args.out}. Serve only this directory on loopback.')


HTML = '''<!doctype html><meta charset="utf-8"><title>Private PC-98 reference</title>
<style>body{margin:0;background:#222;color:#eee}canvas{width:640px;height:400px;image-rendering:pixelated}pre{white-space:pre-wrap}</style>
<canvas id="screen" width="640" height="400" tabindex="0"></canvas><pre id="log"></pre>
<script>
(async()=>{
 const log=s=>{document.querySelector('#log').textContent+=s+'\\n';console.log(s);};
 const bytes=async p=>{const r=await fetch(p);if(!r.ok)throw Error(p+': '+r.status);return new Uint8Array(await r.arrayBuffer());};
 const names=await(await fetch('files.json')).json(), files=[];
 for(const name of names)files.push([name,await bytes('game/'+name)]);
 const boot=await bytes('boot.xdf'),font=await bytes('core/font.bmp');
 window.Module={canvas:document.querySelector('canvas'),locateFile:p=>'core/'+p,
  arguments:['/boot.xdf'],preRun:[()=>{
   FS.mkdir('/hostdrv');for(const[n,b]of files)FS.writeFile('/hostdrv/'+n,b);
   FS.writeFile('/font.bmp',font);FS.writeFile('/boot.xdf',boot);
   FS.writeFile('/np21kai.cfg','[NekoProject21kai]\\nfontfile=/font.bmp\\nuse_hdrv=true\\nhdrvroot=/hostdrv\\nhdrv_acc=3\\nExMemory=1\\nclk_mult=8\\nUSEFMGEN=true\\nSeek_Snd=false\\n');
  }],print:log,printErr:log,onAbort:s=>log('ABORT '+s),onRuntimeInitialized:()=>{window.ready=true;log('Core initialized');}};
 const script=document.createElement('script');script.src='core/emnp21kai_sdl2.js';document.head.append(script);
})().catch(e=>document.querySelector('#log').textContent=e.stack);
</script>'''


if __name__ == '__main__':
    main()
