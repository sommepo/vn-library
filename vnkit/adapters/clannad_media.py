"""Native-size SLPM-66302 MZP and paired colour/mask MRG decoding.

The 24-bit 565-high/residual-plane transform is from static source executable
evidence at 0x1129b0/0x112ae8, not an assumed PC CLANNAD image format.
"""
import struct
from vnkit.disc import FormatError
from vnkit.png import encode
from .hunex import decompress_mzx, mrg_sections


def decode_image(data, residual=None):
    sections = mrg_sections(data)
    if sections[0]['data'].startswith(b'mrgd00'):
        if len(sections) != 2:
            raise FormatError('MRG is a multi-image atlas; explicit layout required')
        colour = decode_image(sections[0]['data'])
        alpha = decode_image(sections[1]['data'])
        if (colour['width'], colour['height']) != (alpha['width'], alpha['height']):
            raise FormatError('Colour/mask dimensions differ')
        pixels = bytearray(colour['pixels'])
        pixels[3::4] = alpha['pixels'][3::4]
        return {**colour, 'pixels':bytes(pixels), 'paired_mask':True}
    header = sections[0]['data']
    if len(header) < 16:
        raise FormatError('Truncated image header')
    w,h,tw,th,nx,ny,codec,flags = struct.unpack_from('<8H',header)
    if not (0 < w <= 4096 and 0 < h <= 4096 and 0 < tw <= 1024 and 0 < th <= 1024 and nx == (w+tw-1)//tw and ny == (h+th-1)//th):
        raise FormatError('Invalid image tile geometry')
    count = nx*ny
    if len(sections) != count+1 or len(header) < 16+count:
        raise FormatError('Image tile table mismatch')
    depth = flags & 15
    palette = header[16:-count]
    modes = header[-count:]
    if codec not in (1, 8, 9) or depth not in (0,1,2,3) or len(palette) != {0:64,1:1024,2:0,3:0}[depth]:
        raise FormatError(f'Unsupported image codec/depth/palette: {codec}/{depth}/{len(palette)}')
    if flags & 0x60:
        raise FormatError('Image scaling flags require explicit layout')
    pixels = bytearray(w*h*4)
    residual_sections=None
    if codec==9:
        if residual is None:raise FormatError('Split-colour MZP requires its paired original MZU')
        residual_sections=mrg_sections(residual)
        if len(residual_sections)!=len(sections) or residual_sections[0]['data'][:12]!=header[:12]:
            raise FormatError('MZP/MZU tile geometry differs')
    for i, section in enumerate(sections[1:]):
        if modes[i] not in (0,1,2):
            raise FormatError(f'Unknown tile mode {modes[i]}')
        raw,meta = decompress_mzx(section['data'], invert=False)
        n = tw*th
        if codec==9:
            fine,_=decompress_mzx(residual_sections[i+1]['data'],invert=False)
            # Bottom tiles include unused extra padding in the MZU. The native
            # transform reads only one residual byte per full tile pixel.
            if len(raw)!=n*2 or len(fine)<n:raise FormatError('Invalid split-colour plane lengths')
            raw+=fine[:n]
        needed = [n//2,n,n*2,n*3][depth]
        if len(raw) < needed:
            raise FormatError(f'Tile {i} truncated: {len(raw)} < {needed}')
        # Native loader 0x114178 does not draw mode-zero tiles.
        if not modes[i]: continue
        tile = bytearray(n*4)
        if depth == 2:
            for j,(v,) in enumerate(struct.iter_unpack('<H',raw[:n*2])):
                # 565 high bits, expanded to 8-bit display range.
                tile[j*4:j*4+4] = bytes(((v>>11)*255//31, ((v>>5)&63)*255//63, (v&31)*255//31, 255))
        elif depth == 3:
            for j in range(n):
                low,high = raw[j*2:j*2+2]; fine = raw[n*2+j]
                tile[j*4:j*4+4] = bytes(((high&248)|(fine>>5), ((high<<5)&255)|((low&224)>>3)|((fine&24)>>3), ((low<<3)&255)|(fine&7),255))
        else:
            for j in range(n):
                index = raw[j] if depth == 1 else (raw[j//2] >> (4*(j&1))) & 15
                if depth == 1: index = (index&~24)|((index&8)<<1)|((index&16)>>1)
                r,g,b,a = palette[index*4:index*4+4]
                tile[j*4:j*4+4] = bytes((r,g,b,min(255,round(a*255/128))))
        x0,y0 = (i%nx)*tw,(i//nx)*th
        span = min(tw,w-x0)*4
        for y in range(min(th,h-y0)):
            at = ((y+y0)*w+x0)*4
            pixels[at:at+span] = tile[y*tw*4:y*tw*4+span]
    return {'width':w,'height':h,'pixels':bytes(pixels),'codec':codec,'depth':depth,'flags':flags,'paired_mask':False}


def convert_image(data, residual=None):
    image = decode_image(data,residual)
    return encode(image['width'], image['height'], image['pixels']), {k:v for k,v in image.items() if k!='pixels'}


def convert_resources(extracted, output):
    import json
    from pathlib import Path
    from vnkit.disc import write_bytes, write_json
    extracted,output=Path(extracted),Path(output)
    manifest=json.loads((extracted/'manifest.json').read_text())
    images=[];failures=[]
    for number,entry in enumerate(manifest['files']):
        if not entry['name'].endswith(('.MZP','.MRG')):continue
        try:
            data=(extracted/entry['path']).read_bytes()
            residual=None
            if entry['name'].endswith('.MZP') and number+1<len(manifest['files']):
                following=manifest['files'][number+1]
                if following['name']==entry['name'][:-4]+'.MZU':residual=(extracted/following['path']).read_bytes()
            png,meta=convert_image(data,residual)
            result=write_bytes(output,f'images/{entry["index"]:05d}.png',png)
            images.append({**entry,**meta,'asset':result['path']})
        except ValueError as error:failures.append({'index':entry['index'],'name':entry['name'],'error':str(error)})
    report={'images':images,'unsupported':failures}
    write_json(output,'images.json',report)
    return report


if __name__=='__main__':
    import argparse
    from pathlib import Path
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('extracted',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    try:
        report=convert_resources(a.extracted,a.out)
        print(f'{len(report["images"])} images; {len(report["unsupported"])} unsupported atlas/format entries')
    except (ValueError,OSError) as error:p.exit(2,str(error)+'\n')
