#!/usr/bin/env python3
"""Make private numbered contact sheets for checking every used source glyph.

Inputs are candidate files, not a decoder. The output deliberately contains no
approvals. A reviewer must inspect each source/candidate pair and record changes.
Uses the same isolated Pillow/numpy environment as cartagra-font-match.py.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--font', type=Path, required=True)
    p.add_argument('--audit', type=Path, required=True)
    p.add_argument('--reference', type=Path, required=True)
    p.add_argument('--candidates', type=Path, nargs='+', required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location('matcher', Path(__file__).with_name('cartagra-font-match.py'))
    matcher = importlib.util.module_from_spec(spec); spec.loader.exec_module(matcher)
    raw = a.font.read_bytes(); sha = hashlib.sha256(raw).hexdigest()
    source = matcher.source_glyphs(raw)
    used = sorted(json.loads(a.audit.read_text())['used_glyphs'])
    inputs = []
    for path in a.candidates:
        data = json.loads(path.read_text())
        if data['font_sha256'] != sha:
            raise ValueError('Candidate/source identity mismatch')
        inputs.append({r['glyph']:r['candidate'] for r in data['glyphs']})
    rows = []
    for g in used:
        options = [r.get(g, '') for r in inputs]
        votes = Counter(c for c in options if len(c) == 1)
        # This only chooses which suggestion to display for checking.
        candidate = votes.most_common(1)[0][0] if votes else ''
        rows.append({'glyph':g, 'character':candidate, 'verified':False,
                     'suggestions':options, 'sheet':len(rows)//144})
    font = ImageFont.truetype(str(a.reference), 42, index=0)
    for start in range(0, len(rows), 144):
        image = Image.new('RGB', (1344, 1008), 'white'); draw = ImageDraw.Draw(image)
        for n, row in enumerate(rows[start:start+144]):
            x=n%12*112; y=n//12*84; g=row['glyph']
            options=[c for c in row['suggestions'] if len(c)==1]
            draw.rectangle((x,y,x+110,y+81),fill='#eff7ed' if len(set(options))==1 else '#fff4dd')
            image.paste(Image.fromarray(255-source[g]).resize((48,48),Image.Resampling.NEAREST),(x,y+18))
            draw.text((x+55,y+9),row['character'],font=font,fill='black')
            draw.text((x+2,y+2),f'{g}',fill='#004477')
            draw.text((x+2,y+68),' / '.join(f'U+{ord(c):04X}' for c in set(options))[:28],fill='#555555')
        image.save(a.out/f'sheet-{start//144:02d}.png')
    result={'format':'vnkit.cartagra-font-review','version':1,'font_sha256':sha,
            'review_note':'All approvals start false. Source bitmap left, suggested Unicode right. Scores/votes never verify a glyph.',
            'inputs':[str(p) for p in a.candidates],'glyphs':rows}
    (a.out/'review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'used_glyphs':len(rows),'sheets':(len(rows)+143)//144,'out':str(a.out)}))


if __name__ == '__main__':
    main()
