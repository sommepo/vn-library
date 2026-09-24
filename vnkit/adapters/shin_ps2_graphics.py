"""Native-size PIC2/BUP2 recovery for the tested Shin PS2 revision.

LZ10, palette permutation and record layouts adapted from Umineko Project's
BSD-3-Clause AlchemistUnpacker; see third_party/LICENSE-umineko-project.txt.
Bounds checks and source-plane outputs are original. BUP overlays are retained
as separate mask/colour planes: this does not claim native face composition.
"""
import struct
from ..disc import FormatError
from ..png import encode

MAX_PIXELS = 16 * 1024 * 1024


def span(data, offset, size):
    if offset < 0 or size < 0 or offset + size > len(data):
        raise FormatError('Shin image range outside resource')
    return data[offset:offset+size]


def dimensions(width, height):
    if not 0 < width <= 4096 or not 0 < height <= 16384 or width * height > MAX_PIXELS:
        raise FormatError('Shin image dimensions exceed bounds')


def decompress(data, expected):
    if not 0 <= expected <= MAX_PIXELS * 4:
        raise FormatError('Shin image decompression limit exceeded')
    out, at, flags = bytearray(), 0, 1
    while at < len(data):
        if flags == 1:
            flags = data[at] | 0x100; at += 1
            if at == len(data): raise FormatError('Truncated Shin LZ flag group')
        if flags & 1:
            if at + 2 > len(data): raise FormatError('Truncated Shin LZ reference')
            a, b = data[at:at+2]; at += 2
            count, distance = (a & 15) + 3, ((a & 240) << 4 | b) + 1
            if distance > len(out) or len(out) + count > expected:
                raise FormatError('Shin LZ reference outside output')
            for _ in range(count): out.append(out[-distance])
        else:
            if len(out) >= expected: raise FormatError('Excess Shin LZ literal')
            out.append(data[at]); at += 1
        flags >>= 1
    if len(out) != expected:
        raise FormatError(f'Shin LZ output length {len(out)} differs from {expected}')
    return bytes(out)


def palette(data, offset):
    raw = span(data, offset, 1024)
    result = []
    for i in range(256):
        at = ((i & ~24) | ((i & 8) << 1) | ((i & 16) >> 1)) * 4
        r, g, b, a = raw[at:at+4]
        result.append(bytes((r, g, b, min(255, a*2))))
    return result


def rgba(indices, colors):
    return b''.join(colors[i] for i in indices)


def picture(data):
    if data[:8] != b'PIC2PS2 ' or len(data) < 32:
        raise FormatError('Expected Shin PIC2PS2')
    size, x, y, width, height, unknown, pal_at, count = struct.unpack_from('<I4HIII', data, 8)
    if size != len(data) or count > 4096 or 32 + count*16 > len(data):
        raise FormatError('Invalid PIC2 header/table')
    dimensions(width, height)
    colors = palette(data, pal_at)
    out = bytearray(width*height*4)
    for i in range(count):
        left, top, w, h, at, length = struct.unpack_from('<4HII', data, 32+i*16)
        if not w or not h or not length: continue
        if left+w > width or top+h > height:
            raise FormatError('PIC2 chunk outside image')
        pixels = rgba(decompress(span(data, at, length), w*h), colors)
        for row in range(h):
            dest = ((top+row)*width+left)*4
            out[dest:dest+w*4] = pixels[row*w*4:(row+1)*w*4]
    return {'width':width, 'height':height, 'anchor':[x,y], 'chunks':count,
            'unknown':unknown}, encode(width, height, out)


def portrait_planes(data):
    if data[:8] != b'BUP2PS2 ' or len(data) < 40:
        raise FormatError('Expected Shin BUP2PS2')
    size, char_id, x, y, w, h, pal, at, length, count = struct.unpack_from('<II4H4I', data, 8)
    # Eight narrow portraits advertise a 16-byte-aligned file size but omit
    # the final padding. Every actual chunk must still lie inside the file.
    if size not in (len(data), (len(data)+15)&~15) or count > 256 or 40+count*68 > len(data):
        raise FormatError('Invalid BUP2 header/table')
    dimensions(w, h)
    colors = palette(data, pal)
    pixels = decompress(span(data, at, length), w*h)
    images = [('base', encode(w, h, rgba(pixels, colors)))]
    variants = []
    for i in range(count):
        start = 40 + i*68
        name = span(data, start, 16).split(b'\0')[0].decode('ascii')
        cells = struct.unpack_from('<I', data, start+16)[0]
        planes = []
        for j in range(2):
            left, top, pw, ph, offset, size = struct.unpack_from('<4HII', data, start+20+j*16)
            if not pw or not ph or not size: continue
            dimensions(pw, ph)
            if cells not in (2,3) or left+pw > w or top+ph > h:
                raise FormatError('Unrecognised BUP2 overlay geometry')
            # This edition's face payload has two planes; its mouth payload
            # has four (mask plus animation frames). Preserve rather than
            # flatten these before the native composition is verified.
            rows = 2 if j == 0 else 4
            decoded = decompress(span(data, offset, size), pw*ph*rows)
            key = f'variant-{i:03d}-plane-{j}'
            images.append((key, encode(pw, ph*rows, rgba(decoded, colors))))
            planes.append({'key':key, 'left':left, 'top':top, 'width':pw,
                           'height':ph, 'cells':rows, 'offset':offset, 'size':size})
        variants.append({'index':i, 'name':name, 'cells':cells, 'planes':planes})
    return {'width':w, 'height':h, 'anchor':[x,y], 'character_id':char_id,
            'variants':variants, 'composition_verified':False}, images


def voice_ads(data):
    if data[:4] != b'VDS ' or len(data) < 12:
        raise FormatError('Expected Higurashi VDS voice wrapper')
    at = 8 + struct.unpack_from('<I', data, 4)[0]
    if span(data, at, 4) != b'SShd' or span(data, at+32, 4) != b'SSbd':
        raise FormatError('VDS does not contain Sony ADS at declared offset')
    return data[at:], {'audio_offset':at, 'metadata_hex':data[8:at].hex()}


def portrait_composites(data):
    """Resting BUP expressions, using the upstream face-over-base composition.

    Mouth animation planes stay in the recovery. The resting mouth is already
    painted into the base/expression, so no open-mouth frame is invented.
    """
    meta, _ = portrait_planes(data)
    _,_,_,_,w,h,pal,at,length,count=struct.unpack_from('<II4H4I',data,8)
    colors=palette(data,pal);base=rgba(decompress(span(data,at,length),w*h),colors)
    result=[]
    for i,variant in enumerate(meta['variants']):
        output=bytearray(base);start=40+i*68
        left,top,pw,ph,offset,size=struct.unpack_from('<4HII',data,start+20)
        if pw and ph and size:
            indices=decompress(span(data,offset,size),pw*ph*2)[pw*ph:]
            for y in range(ph):
                for x in range(pw):
                    rgba_value=colors[indices[y*pw+x]];alpha=rgba_value[3]
                    if not alpha:continue
                    dest=((top+y)*w+left+x)*4
                    if alpha==255:output[dest:dest+4]=rgba_value
                    else:
                        old=output[dest:dest+4];combined=alpha*255+old[3]*(255-alpha)
                        output[dest:dest+4]=bytes([round((rgba_value[k]*alpha*255+old[k]*old[3]*(255-alpha))/combined) for k in range(3)]+[round(combined/255)])
        result.append((variant['name'],encode(w,h,output)))
    return meta,result
