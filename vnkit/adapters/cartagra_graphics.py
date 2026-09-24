"""Bounded Cartagra CPS decoding; native-size RGBA output.

Adapted from GSLmeltData in punk7890's PS2 Visual Novel Tool (MIT), revision
e27f4f940af07f46ae1dbed7cdefd9e4be5cf667. See LICENSE-ps2-vn-tool.txt.
These CPS headers/keys differ from Never7's CPS format.
"""
import struct
from ..disc import FormatError

KEYS = (0xB739A245,0x9D95B93F,0x44C3F5DF,0x0E870733,
        0xDBB9EA9B,0x7C31C2ED,0x5D95284D,0x14C5ACCB)


def decompress(data,limit=16*1024*1024):
    if len(data)<44 or data[:4]!=b'CPS\0':raise FormatError('Not Cartagra CPS')
    size, = struct.unpack_from('<I',data,4)
    expected, = struct.unpack_from('<I',data,12)
    if not 44<=size<=len(data) or size%4 or not 0<expected<=limit:
        raise FormatError('Invalid Cartagra CPS lengths')
    data = bytearray(data)
    seed_off = (struct.unpack_from('<I',data,size-4)[0]-0x7534682)&0xffffffff
    if seed_off%4 or seed_off+4>size:raise FormatError('Invalid CPS seed location')
    seed = (struct.unpack_from('<I',data,seed_off)[0]+seed_off+0x3786425)&0xffffffff
    for i in range(8,min(1023,len(data)//4)):
        if i*4!=seed_off:
            value = struct.unpack_from('<I',data,i*4)[0]-KEYS[i%8]-seed-size
            struct.pack_into('<I',data,i*4,value&0xffffffff)
        seed = (seed*0x41c64e6d+0x9b06)&0xffffffff
    out = bytearray();cursor = 40
    def take(n):
        nonlocal cursor
        if cursor+n>size:raise FormatError('Truncated CPS token')
        b = data[cursor:cursor+n];cursor+=n;return b
    while len(out)<expected:
        control = take(1)[0]
        if control&0x80:
            if control&0x40:
                n = (control&31)+2
                if control&32:n += take(1)[0]<<5
                block = take(1)*n
            else:
                distance = ((control&3)<<8)+take(1)[0]+1
                n = ((control>>2)&15)+2
                if distance>len(out) or len(out)+n>expected:raise FormatError('Invalid CPS backreference')
                for _ in range(n):out.append(out[-distance])
                continue
        elif control&0x40:
            repeat = take(1)[0]+1
            block = take((control&63)+2)*repeat
        else:
            n = (control&31)+1
            if control&32:n+=take(1)[0]<<5
            block = take(n)
        if len(out)+len(block)>expected:raise FormatError('CPS output overrun')
        out.extend(block)
    return bytes(data[32:40])+out


def decode(data):
    b = decompress(data)
    w,h,depth = struct.unpack_from('<HHI',b)
    if not 0<w<=4096 or not 0<h<=4096 or w*h>4096*4096:
        raise FormatError('Invalid CPS dimensions')
    pixels = w*h
    if depth==8:
        if len(b)<1032+pixels:raise FormatError('Truncated indexed CPS')
        palette = []
        for i in range(256):
            j = (i&~24)|((i&8)<<1)|((i&16)>>1)
            r,g,blue,a = b[8+j*4:12+j*4]
            palette.append(bytes((r,g,blue,min(255,a*255//128))))
        rgba = b''.join(palette[i] for i in b[1032:1032+pixels])
    elif depth==24:
        if len(b)<8+pixels*4:raise FormatError('Truncated RGBA CPS')
        rgba = bytearray(b[8:8+pixels*4])
        for i in range(3,len(rgba),4):rgba[i]=min(255,rgba[i]*255//128)
        rgba = bytes(rgba)
    else:raise FormatError(f'Unsupported CPS pixel depth {depth}')
    return w,h,rgba


def main():
    import argparse
    from collections import Counter
    import hashlib
    import json
    from pathlib import Path
    from ..disc import write_json
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('recovery',type=Path);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args()
    if a.report.exists():p.error('Choose a new audit report path')
    rows=[];errors=[];sizes=Counter()
    for name in ('BG.DAT','BG2.DAT','CHARA.DAT','CHARA2.DAT','SYSTEM.DAT'):
        paths=sorted((a.recovery/name).glob('*.bin'))
        if not paths:raise FormatError('Missing recovered image archive: '+name)
        for path in paths:
            if name=='SYSTEM.DAT' and path.name=='0024.bin':continue
            try:
                w,h,pixels=decode(path.read_bytes())
                rows.append({'source':name+'/'+path.name,'width':w,'height':h,'rgba_sha256':hashlib.sha256(pixels).hexdigest()})
                sizes[f'{w}x{h}']+=1
            except (ValueError,IndexError,struct.error) as e:errors.append({'source':name+'/'+path.name,'error':str(e)})
        print(f'{name}: {len(paths)} members checked',flush=True)
    write_json(a.report.parent,a.report.name,{'format':'vnkit.cartagra-image-audit','version':1,'decoded':rows,'errors':errors,'sizes':dict(sizes)})
    print(json.dumps({'decoded':len(rows),'errors':len(errors),'sizes':dict(sizes)}))
    raise SystemExit(3 if errors else 0)


if __name__=='__main__':main()
