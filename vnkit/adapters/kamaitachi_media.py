"""Private source artwork/font conversion for SLPS-01794.

This converts pixels only. It does not claim native shadow blending/animation
or assign pictures to text. All associations come from the source interpreter.
"""
import hashlib
from pathlib import Path
import struct

from ..disc import FormatError, write_bytes, write_json
from ..png import encode
from .chunsoft_ps1 import unpack_ike
from .chunsoft_ps1_media import unpack_lzs, tim, font_glyphs
from .kamaitachi_ps1 import EXE_SHA256, EXECUTABLE


def font(exe, source):
    if hashlib.sha256(exe).hexdigest() != EXE_SHA256:
        raise FormatError('Kamaitachi executable identity mismatch')
    glyphs = font_glyphs(source)
    width, height, cell = 1024, ((len(glyphs) + 15) // 16) * 32, 64
    atlas = bytearray(width * height * 4)
    metrics = {}
    for index, g in enumerate(glyphs):
        if g is None:
            continue
        if g['width'] > cell or g['height'] > 32:
            raise FormatError('Kamaitachi glyph exceeds atlas cell')
        u, v = (index % 16) * cell, (index // 16) * 32
        for y in range(g['height']):
            for x in range(g['width']):
                pixel = g['pixels'][y * g['width'] + x]
                at = ((v + y) * width + u + x) * 4
                atlas[at:at + 4] = bytes((255,255,255, pixel * 255 // 14))
    for at in range(0x8006b754, 0x8006b754 + 4096 * 4, 4):
        code, index = struct.unpack_from('<Hh', exe, at - 0x80010000 + 2048)
        if code == 65535:
            continue
        if not 0 <= index < len(glyphs) or glyphs[index] is None or str(code) in metrics:
            raise FormatError('Invalid/duplicate Kamaitachi native font mapping')
        g = glyphs[index]
        try:
            text = code.to_bytes(1 if code < 256 else 2, 'big').decode('cp932', errors='strict')
        except UnicodeError as error:
            raise FormatError('Unmapped native Kamaitachi character') from error
        if len(text) != 1 or ord(text) < 32:
            raise FormatError('Native font maps a control character')
        metrics[str(code)] = {'text': text, 'index': index, 'width': 2 if code == 0x8140 else g['width'],
                              'height': 14 if code == 0x8140 else g['height'],
                              'u': (index % 16) * cell, 'v': (index // 16) * 32}
    return {'width': width, 'height': height, 'metrics': metrics,
            'sha256': hashlib.sha256(source).hexdigest(), 'png': encode(width,height,atlas)}


def convert(recovery, output):
    recovery, out = Path(recovery), Path(output)
    exe = (recovery / 'original' / EXECUTABLE).read_bytes()
    if hashlib.sha256(exe).hexdigest() != EXE_SHA256:
        raise FormatError('Kamaitachi executable identity mismatch')
    assets, files, entries = {}, [], []
    for archive in ('BGD', 'SDW'):
        for path in sorted((recovery / 'stored' / archive).glob('*.bin')):
            data = path.read_bytes()
            if data[2:5] == b'ike':
                data, consumed = unpack_ike(data)
            elif data.startswith(b'LZS'):
                data = unpack_lzs(data)
                consumed = path.stat().st_size
            else:
                consumed = path.stat().st_size
            t = tim(data)
            resource = int(path.stem, 16)
            key, url = f'{archive.lower()}:{resource}', f'images/{archive.lower()}/{resource:04x}.png'
            record = write_bytes(out, url, encode(t['width'],t['height'],t['rgba']))
            record.pop('status',None)
            files.append(record)
            assets[key] = {'type':'image','url':url,'sha256':record['sha256'],
                           'width':t['width'],'height':t['height'],'x':t['x'],'y':t['y']}
            if archive == 'SDW':
                # The native loader combines index bytes before replacing its
                # CLUT. Keep those bytes losslessly, independent of mask colour.
                pixels = bytes(c for index in t['indices'] for c in (index,0,0,255))
                index_url = f'images/indices/{resource:04x}.png'
                index_record = write_bytes(out,index_url,encode(t['width'],t['height'],pixels))
                index_record.pop('status',None); files.append(index_record)
                assets[f'sdw-index:{resource}'] = {'type':'image','url':index_url,
                    'sha256':index_record['sha256'],'width':t['width'],'height':t['height']}
            entries.append({'id':key,'stored_consumed':consumed,'tim_consumed':t['consumed'],
                            'stp_pixels':sum(t['stp'])})
    f = font(exe, (recovery / 'stored/BIN/0000.bin').read_bytes())
    record = write_bytes(out,'images/font.png',f.pop('png'))
    record.pop('status',None)
    files.append(record)
    assets['font:native'] = {'type':'image','url':'images/font.png','sha256':record['sha256'],
                              'width':f['width'],'height':f['height']}
    write_json(out,'font.json',f)
    report = {'format':'vnkit.kamaitachi-media','version':1,'assets':assets,'images':entries,'files':files,
              'limits':['STP source draw modes and native palette animation require the runtime',
                        'Font mask preserves source coverage; native CLUT colours are separate']}
    write_json(out,'artwork.json',report)
    return {'images':len(entries),'font_glyphs':len(f['metrics'])}
