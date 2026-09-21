"""Original decoder for the measured PS2 BIP RGBA tile atlas.

Stored 16x16 tiles have a one-pixel filtering gutter and 14x14 visible pixels.
The texture atlas is 512 pixels wide. Coordinates remain at source resolution.
"""
import struct
from ..disc import FormatError
from ..png import encode


def decode(data):
    if len(data)<128:raise FormatError('Truncated Remember11 BIP')
    count=struct.unpack_from('<I',data)[0]
    if count not in (5,10):raise FormatError('Unsupported Remember11 BIP section count')
    offsets=struct.unpack_from('<'+'I'*count,data,4)
    if list(offsets)!=sorted(offsets) or offsets[-1]!=len(data):raise FormatError('Invalid BIP section bounds')
    index=offsets[0]
    if index<4+count*4 or index+12>len(data):raise FormatError('BIP index outside bounds')
    n,flag,zero,w,h=struct.unpack_from('<HHIHH',data,index)
    if flag or zero or not 0<w<=4096 or not 0<h<=4096 or index+12+n*8!=offsets[1]:
        raise FormatError('Unsupported BIP tile directory')
    rgba=bytearray(w*h*4); pixels=offsets[-2]
    for k in range(n):
        kind,tile,x,y,tw,th=struct.unpack_from('<HHBBBB',data,index+12+k*8)
        if kind!=2:raise FormatError(f'Unsupported BIP pixel kind {kind} at tile {k}')
        for row in range(th):
            for col in range(tw):
                block=tile+row*tw+col;sx=(block%32)*16+1;sy=(block//32)*16+1
                dx=(x+col)*14;dy=(y+row)*14
                for py in range(min(14,h-dy)):
                    width=min(14,w-dx)
                    if width<=0:continue
                    start=pixels+((sy+py)*512+sx)*4;end=start+width*4
                    if start<pixels or end>offsets[-1]:raise FormatError('BIP atlas tile outside pixels')
                    out=((dy+py)*w+dx)*4;rgba[out:out+width*4]=data[start:end]
    for p in range(3,len(rgba),4):rgba[p]=min(255,rgba[p]*255//128)
    return w,h,rgba


def png(data):
    w,h,rgba=decode(data)
    return w,h,encode(w,h,rgba)
