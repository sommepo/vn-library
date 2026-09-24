#!/usr/bin/env python3
"""Enlarge unresolved glyphs and duplicate candidates for private visual review."""
import argparse
from collections import defaultdict
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--font', type=Path, required=True)
    p.add_argument('--review', type=Path, required=True)
    p.add_argument('--edits', type=Path, required=True)
    p.add_argument('--reference', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    spec = importlib.util.spec_from_file_location('matcher', Path(__file__).with_name('cartagra-font-match.py'))
    matcher = importlib.util.module_from_spec(spec); spec.loader.exec_module(matcher)
    source = matcher.source_glyphs(a.font.read_bytes())
    edits = json.loads(a.edits.read_text())
    rows = {r['glyph']: r for r in json.loads(a.review.read_text())['glyphs']}
    duplicates = defaultdict(list)
    for g, row in rows.items():
        row['character'] = edits['corrections'].get(str(g), row['character'])
        if g >= 499:
            duplicates[row['character']].append(g)
    duplicate_groups = [gs for gs in duplicates.values() if len(gs) > 1]
    ids = sorted(set(edits['uncertain']) | {g for gs in duplicate_groups for g in gs})
    font = ImageFont.truetype(str(a.reference), 88, index=0)
    for start in range(0, len(ids), 16):
        image = Image.new('RGB', (1152, 800), 'white'); draw = ImageDraw.Draw(image)
        for n, g in enumerate(ids[start:start+16]):
            x=n%4*288; y=n//4*200
            image.paste(Image.fromarray(255-source[g]).resize((144,144), Image.Resampling.NEAREST), (x,y+24))
            draw.text((x+154,y+15),rows[g]['character'],font=font,fill='black')
            draw.text((x+3,y+3),f'{g}   U+{ord(rows[g]["character"]):04X}',fill='#004477')
            draw.text((x+4,y+177),' / '.join(f'U+{ord(c):04X}' for c in rows[g]['suggestions'] if len(c)==1),fill='#555555')
        image.save(a.out/f'detail-{start//16:02d}.png')
    (a.out/'index.json').write_text(json.dumps({'ids':ids,'duplicates':duplicate_groups}, indent=2))
    alternatives = list(edits.get('enlarge_again', {}).items())
    for start in range(0, len(alternatives), 6):
        image = Image.new('RGB', (1000, 1080), 'white'); draw = ImageDraw.Draw(image)
        for n, (key, chars) in enumerate(alternatives[start:start+6]):
            g=int(key); y=n*180
            image.paste(Image.fromarray(255-source[g]).resize((144,144),Image.Resampling.NEAREST),(0,y+22))
            draw.text((0,y+2),str(g),fill='#004477')
            for col, char in enumerate(chars):
                x=180+col*150
                draw.text((x,y+12),char,font=font,fill='black')
                draw.text((x,y+150),f'U+{ord(char):04X}',fill='#004477')
        image.save(a.out/f'alternatives-{start//6:02d}.png')
    print(json.dumps({'glyphs':len(ids),'sheets':(len(ids)+15)//16,'duplicates':duplicate_groups}))


if __name__ == '__main__':
    main()
