#!/usr/bin/env python3
"""Private font-shape comparison, not an automatic Unicode approval tool.

Requires Pillow 12.1.1, numpy 2.4.3 and fonttools 4.61.1 in an isolated research
environment. Reference fonts must be locally supplied and lawfully usable.
Each glyph is compared independently; no story text or language prediction is
used. Every candidate stays unverified, even when the similarity score is high.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

# Bound BLAS before importing numpy on a shared host.
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont


def source_glyphs(raw):
    if len(raw) != 829440:
        raise ValueError('Expected the 2880-glyph, 24-pixel original font')
    b = np.frombuffer(raw, dtype=np.uint8)
    pixels = np.empty(b.size * 2, np.uint8)
    pixels[::2], pixels[1::2] = (b >> 4) * 17, (b & 15) * 17
    return pixels.reshape(2880, 24, 24)


def normalized(image):
    """Compare outlines in a fixed box, preserving aspect ratio and thin strokes."""
    box = image.getbbox()
    if not box:
        return np.zeros(32 * 32, np.float32)
    crop = image.crop(box)
    crop.thumbnail((28, 28), Image.Resampling.LANCZOS)
    # Also scale small reference glyphs up; references are usually rendered at 48px.
    w, h = crop.size
    scale = min(28 / w, 28 / h)
    crop = crop.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new('L', (32, 32))
    canvas.paste(crop, ((32 - crop.width) // 2, (32 - crop.height) // 2))
    canvas = canvas.filter(ImageFilter.GaussianBlur(.55))
    a = np.asarray(canvas, dtype=np.float32).reshape(-1) / 255
    return a / max(float(np.linalg.norm(a)), 1e-12)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('font', type=Path)
    p.add_argument('--reference', required=True, type=Path)
    p.add_argument('--font-index', type=int, default=0)
    p.add_argument('--size', type=int, default=48)
    p.add_argument('--stroke', type=int, default=0)
    p.add_argument('--kanji-only', action='store_true', help='Compare only unified CJK characters, avoiding visually identical Hangul/compatibility symbols')
    p.add_argument('--encoding', help='Limit reference candidates to an encoding, e.g. cp932; a research constraint, not evidence')
    p.add_argument('--start', type=int, default=499)
    p.add_argument('--end', type=int, default=2822)
    p.add_argument('--out', required=True, type=Path)
    args = p.parse_args()
    if args.out.exists() or not 0 <= args.start < args.end <= 2880:
        p.error('Choose a new output and a valid bounded glyph range')
    raw = args.font.read_bytes()
    source = source_glyphs(raw)
    with TTFont(args.reference, fontNumber=args.font_index, lazy=True) as tt:
        cmap = tt.getBestCmap()
        chars = [chr(n) for n in sorted(cmap) if 0x3000 <= n <= 0x9fff or 0xf900 <= n <= 0xfaff]
        if args.kanji_only:
            chars = [c for c in chars if 0x3400 <= ord(c) <= 0x9fff]
        if args.encoding:
            def encodable(c):
                try:
                    c.encode(args.encoding)
                    return True
                except UnicodeEncodeError:
                    return False
            chars = [c for c in chars if encodable(c)]
    if not chars:
        p.error('No Japanese/CJK reference characters')
    font = ImageFont.truetype(str(args.reference), args.size, index=args.font_index)
    refs = []
    for char in chars:
        img = Image.new('L', (128, 128))
        ImageDraw.Draw(img).text((16, 8), char, font=font, fill=255, stroke_width=args.stroke)
        refs.append(normalized(img))
    refs = np.array(refs)
    rows = []
    for first in range(args.start, args.end, 64):
        ids = list(range(first, min(first + 64, args.end)))
        src = np.array([normalized(Image.fromarray(source[g])) for g in ids])
        scores = src @ refs.T
        for g, score in zip(ids, scores):
            top = np.argsort(score)[-5:][::-1]
            rows.append({'glyph':g, 'candidate':chars[int(top[0])], 'verified':False,
                         'matches':[{'character':chars[int(i)], 'similarity':round(float(score[i]), 6)} for i in top]})
        print(f'Compared glyphs through {ids[-1]}', flush=True)
    result = {'format':'vnkit.unverified-font-candidates', 'version':1,
              'font_sha256':hashlib.sha256(raw).hexdigest(),
              'reference':{'path':str(args.reference), 'sha256':hashlib.sha256(args.reference.read_bytes()).hexdigest(),
                           'index':args.font_index, 'size':args.size, 'stroke':args.stroke, 'kanji_only':args.kanji_only, 'encoding':args.encoding, 'characters':len(chars)},
              'warning':'Shape similarity is a review aid, not verified decoding or an exact-font match.', 'glyphs':rows}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({'glyphs':len(rows), 'referenceCharacters':len(chars), 'out':str(args.out)}))


if __name__ == '__main__':
    main()
