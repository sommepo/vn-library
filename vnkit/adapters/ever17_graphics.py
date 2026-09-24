"""Ever17's 16-pixel BIP atlas variant, with explicit source frame directories.

SLPM-65421 draw routine 0x16d0f8 shifts tile X/Y by four and advances each
destination by 16 (0x16d14c, 0x16d1a8, 0x16d3ac). Its UV +1 is a 1/16 pixel
sample offset, not the one-pixel gutter used by the later R11 decoder.
0x16d780 bounds frame selectors against section count minus four.
"""
import json
import struct
from pathlib import Path
from ..disc import FormatError, write_bytes, write_json
from ..png import encode
from .cri_afs import unpack_lzss
from .remember11_graphics import decode
from .remember11_media import digest

VERSION = 'ever17-bip-1'


def convert(source, out):
    source, out = Path(source), Path(out)
    rel = f'images/{source.parent.name}/{source.name}.png'
    meta = out/(rel+'.json')
    if meta.exists():
        info = json.loads(meta.read_text())
        if info['version'] != VERSION or info['source_sha256'] != digest(source):
            raise FormatError('Ever17 image cache changed; use a fresh output')
        for frame in info['frames']:
            if digest(out/frame['url']) != frame['sha256']:
                raise FormatError('Ever17 image cache integrity failure')
        return info
    data = unpack_lzss(source.read_bytes())
    count = struct.unpack_from('<I',data)[0]
    if count not in (5,6,10):
        raise FormatError('Unestablished Ever17 image section count')
    frames = []
    for frame in range(count-4):
        w,h,rgba = decode(data,tile_size=16,gutter=0,frame=frame,section_counts=(5,6,10))
        path = rel if frame == 0 else rel[:-4]+f'.frame-{frame}.png'
        saved = write_bytes(out,path,encode(w,h,rgba))
        frames.append({'index':frame,'url':path,'sha256':saved['sha256'],'width':w,'height':h})
    info = {'version':VERSION,'source_sha256':digest(source),'type':'image',
            **frames[0], 'frames':frames}
    write_json(out,rel+'.json',info)
    return info
