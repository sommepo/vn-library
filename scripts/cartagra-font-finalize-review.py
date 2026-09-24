#!/usr/bin/env python3
"""Apply an explicit, font-bound visual-review ledger; never approve OCR scores."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit.adapters.cartagra_text import reviewed_map, require_glyphs
from vnkit.disc import FormatError, write_json


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('font','review','edits','audit','out'):
        p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    font=a.font.read_bytes(); raw=a.review.read_bytes()
    review=json.loads(raw); edits=json.loads(a.edits.read_text())
    sha=hashlib.sha256(font).hexdigest()
    if (edits.get('review_complete') is not True or edits.get('uncertain') != []
            or edits.get('font_sha256') != sha
            or edits.get('review_sha256') != hashlib.sha256(raw).hexdigest()
            or set(edits.get('sheets_checked',[])) != {r['sheet'] for r in review['glyphs']}):
        raise FormatError('A complete, source-bound visual review is required')
    rows=review['glyphs']; ids={str(r['glyph']) for r in rows}
    if set(edits['corrections'])-ids:
        raise FormatError('Correction refers to a glyph outside the reviewed pack')
    for row in rows:
        row['character']=edits['corrections'].get(str(row['glyph']),row['character'])
        row['verified']=True
    review['review_note']=edits['review_limits']
    review['normalization_notes']=edits['normalization_notes']
    review['review_evidence']={'ledger_sha256':hashlib.sha256(a.edits.read_bytes()).hexdigest(),
                              'sheets_checked':edits['sheets_checked'],'reviewer':edits['reviewer']}
    require_glyphs(reviewed_map(font,review),json.loads(a.audit.read_text())['used_glyphs'])
    write_json(a.out.parent,a.out.name,review)
    print(json.dumps({'reviewed':len(rows),'out':str(a.out)}))


if __name__=='__main__':
    main()
