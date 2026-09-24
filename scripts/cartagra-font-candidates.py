#!/usr/bin/env python3
"""Generate PRIVATE, unverified glyph transcription candidates for font research.

This is not a text decoder. Candidates must not be admitted to an import as a
verified character map. Uses an explicitly supplied local Tesseract library and
language data, one thread, no network or subprocesses. Preserves the source font.
"""
import argparse
import ctypes as C
import hashlib
import json
import os
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('font', type=Path)
    p.add_argument('--library', required=True)
    p.add_argument('--tessdata', required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--start', type=int, default=0)
    p.add_argument('--end', type=int, default=2880)
    p.add_argument('--psm', type=int, choices=(6,10,13), default=10)
    p.add_argument('--kanji-only', action='store_true', help='Research constraint only; never evidence of correctness')
    a = p.parse_args()
    raw = a.font.read_bytes()
    if len(raw) != 829440 or not 0 <= a.start < a.end <= 2880:
        p.error('Expected the 2880-glyph Cartagra native font and a bounded range')
    if a.out.exists(): p.error('Output exists; choose a new research output')
    os.environ['OMP_THREAD_LIMIT'] = '1'
    lib = C.CDLL(a.library)
    signatures = {
        'Create': (C.c_void_p, []),
        'Init3': (C.c_int, [C.c_void_p, C.c_char_p, C.c_char_p]),
        'SetPageSegMode': (None, [C.c_void_p, C.c_int]),
        'SetVariable': (C.c_int, [C.c_void_p, C.c_char_p, C.c_char_p]),
        'SetImage': (None, [C.c_void_p, C.c_void_p, C.c_int, C.c_int, C.c_int, C.c_int]),
        'GetUTF8Text': (C.c_void_p, [C.c_void_p]),
        'MeanTextConf': (C.c_int, [C.c_void_p]),
        'Clear': (None, [C.c_void_p]),
        'End': (None, [C.c_void_p]),
        'Delete': (None, [C.c_void_p]),
    }
    for name, (restype, argtypes) in signatures.items():
        f = getattr(lib, 'TessBaseAPI'+name); f.restype = restype; f.argtypes = argtypes
    lib.TessDeleteText.argtypes = [C.c_void_p]
    api = lib.TessBaseAPICreate()
    if lib.TessBaseAPIInit3(api, os.fsencode(a.tessdata), b'jpn'):
        raise RuntimeError('Local Japanese OCR initialization failed')
    lib.TessBaseAPISetPageSegMode(api, a.psm)
    if a.kanji_only:
        chars=''.join(chr(n) for n in range(0x4e00,0xa000))+'一二三々'
        if not lib.TessBaseAPISetVariable(api,b'tessedit_char_whitelist',chars.encode()):
            raise RuntimeError('OCR candidate whitelist unavailable')
    rows = []
    try:
        for index in range(a.start, a.end):
            glyph = raw[index*288:(index+1)*288]
            pixels = bytearray([255])*(112*112)
            for y in range(24):
                for x in range(24):
                    value = glyph[y*12+x//2]
                    value = (value >> 4) if x % 2 == 0 else (value & 15)
                    for yy in range(3):
                        base = (20+y*3+yy)*112+20+x*3
                        pixels[base:base+3] = bytes([255-value*17])*3
            buf = C.create_string_buffer(bytes(pixels))
            lib.TessBaseAPISetImage(api, buf, 112, 112, 1, 112)
            ptr = lib.TessBaseAPIGetUTF8Text(api)
            value = C.string_at(ptr).decode('utf-8').strip() if ptr else ''
            if ptr: lib.TessDeleteText(ptr)
            rows.append({'glyph': index, 'candidate': value,
                         'ocr_confidence': lib.TessBaseAPIMeanTextConf(api),
                         'verified': False})
            lib.TessBaseAPIClear(api)
            if index % 200 == 0: print(f'Candidate glyph {index}', flush=True)
    finally:
        lib.TessBaseAPIEnd(api); lib.TessBaseAPIDelete(api)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open('x', encoding='utf-8') as f:
        json.dump({'format': 'vnkit.unverified-font-candidates', 'version': 1,
                   'font_sha256': hashlib.sha256(raw).hexdigest(),
                   'warning': 'OCR candidates only. Not verified Japanese decoding.',
                   'glyphs': rows}, f, ensure_ascii=False, indent=2)
    print(f'Saved {len(rows)} UNVERIFIED candidates to {a.out}')


if __name__ == '__main__': main()
