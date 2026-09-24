"""TXA2 GS texture memory decoder.

PSMCT32/PSMT8 addressing adapted from MIT PDTools by Nenkai (2021, 2026),
commit recorded in docs/provenance.md; see third_party/LICENSE-pdtools.txt.
TXA records, bounds and transfer layout are this adapter's disc investigation.
"""
import struct
from ..disc import FormatError
from ..png import encode
from .shin_ps2_graphics import decompress, dimensions

BLOCK=(0,1,4,5,16,17,20,21,2,3,6,7,18,19,22,23,8,9,12,13,24,25,28,29,10,11,14,15,26,27,30,31)
WORD32=(0,1,4,5,8,9,12,13,2,3,6,7,10,11,14,15)


def addr32(x,y,base=0,width=1):
    return base*256+((x//64+y//32*width)*2048+BLOCK[(x%64)//8+(y%32)//8*8]*64+(y%8)//2*16+WORD32[x%8+y%2*8])*4


def addr8(x,y,base,width):
    bx,by=x%16,y%16;column=by//4
    word=WORD32[bx%8+(by%2)*8] ^ (8 if ((by//2)^column)&1 else 0)
    byte=bx//8*2+(by%4)//2
    return base*256+(x//128+y//64*(width//2))*8192+BLOCK[x%128//16+y%64//16*8]*256+column*64+word*4+byte


def texture_archive(data):
    if data[:4]==b'LZS2':
        compressed,size=struct.unpack_from('<II',data,4)
        data=decompress(data[16:16+compressed],size)
    if data[:4]!=b'TXA2' or len(data)<16: raise FormatError('Expected TXA2')
    pages,count,offset,_=struct.unpack_from('<HHII',data,4)
    if not 0<pages<=512 or count>4096 or offset+pages*8192!=len(data): raise FormatError('Invalid TXA2 extents')
    # The resource is uploaded in PSMCT32, one 64x32 GS page at a time.
    src=memoryview(data)[offset:];vram=bytearray(pages*8192)
    for n in range(pages*2048):
        dest=addr32(n%64,n//64);vram[dest:dest+4]=src[n*4:n*4+4]
    at=16;result=[]
    for _ in range(count):
        if at+14>offset: raise FormatError('TXA2 record overflow')
        size,index,w,h,base,fmt,pal=struct.unpack_from('<7H',data,at)
        if size<16 or at+size>offset: raise FormatError('Invalid TXA2 record size')
        name=data[at+14:at+size].split(b'\0')[0].decode('ascii');at+=size
        dimensions(w,h);width,psm=fmt&255,fmt>>8
        if psm!=19 or width<2: raise FormatError(f'Unsupported TXA2 PSM {psm}')
        colors=[]
        for i in range(256):
            j=(i&~24)|((i&8)<<1)|((i&16)>>1)
            a=addr32(j%16,j//16,pal,1)
            if a+4>len(vram): raise FormatError('TXA palette overflow')
            r,g,b,alpha=vram[a:a+4];colors.append(bytes((r,g,b,min(255,alpha*2))))
        out=bytearray(w*h*4)
        for y in range(h):
            for x in range(w):
                a=addr8(x,y,base,width)
                if a>=len(vram): raise FormatError('TXA image overflow')
                out[(y*w+x)*4:(y*w+x+1)*4]=colors[vram[a]]
        result.append(({'index':index,'name':name,'width':w,'height':h},encode(w,h,out)))
    return result
