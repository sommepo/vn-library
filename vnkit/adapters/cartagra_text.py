"""Strict boundary between source-glyph review and reader text.

OCR candidate files are never Unicode decoders. A reviewed table is bound to
the full original font hash; every requested glyph must have an explicit checked
entry. This validation does not itself establish that a review was accurate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import unicodedata

from ..disc import FormatError, write_json

FONT_SIZE = 2880 * 24 * 24 // 2


def reviewed_map(font, review):
    if len(font) != FONT_SIZE:
        raise FormatError('Expected the 2880-glyph Cartagra SYSTEM font')
    if review.get('format') != 'vnkit.cartagra-font-review' or review.get('version') != 1:
        raise FormatError('A reviewed Cartagra table is required; OCR candidates are not accepted')
    if review.get('font_sha256') != hashlib.sha256(font).hexdigest():
        raise FormatError('Review belongs to another font')
    rows = review.get('glyphs')
    if not isinstance(rows, list) or len(rows) > 2880:
        raise FormatError('Invalid glyph review list')
    result, seen = {}, set()
    for row in rows:
        if not isinstance(row, dict):
            raise FormatError('Invalid glyph review entry')
        glyph = row.get('glyph')
        if type(glyph) is not int or not 0 <= glyph < 2880 or glyph in seen:
            raise FormatError('Invalid or duplicate source glyph ID')
        seen.add(glyph)
        if row.get('verified') is not True:
            continue
        value = row.get('character')
        if (not isinstance(value, str) or not 1 <= len(value) <= 4
                or any(unicodedata.category(c)[0] == 'C' or c in '\r\n\u2028\u2029\ufffd' for c in value)):
            raise FormatError(f'Glyph {glyph}: invalid Unicode mapping')
        result[glyph] = value
    return result


def require_glyphs(mapping, glyphs):
    missing = sorted(set(glyphs) - mapping.keys())
    if missing:
        raise FormatError(f'{len(missing)} source glyphs lack a reviewed mapping; first IDs: {missing[:16]}')
    return mapping


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--font', type=Path, required=True)
    p.add_argument('--review', type=Path, required=True)
    p.add_argument('--audit', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    try:
        font = a.font.read_bytes()
        mapping = reviewed_map(font, json.loads(a.review.read_text()))
        audit = json.loads(a.audit.read_text())
        if audit.get('format') != 'vnkit.cartagra-audit' or audit.get('version') != 1:
            raise FormatError('Expected Cartagra script audit')
        used = set(audit['used_glyphs'])
        missing = sorted(used - mapping.keys())
        report = {'format': 'vnkit.cartagra-font-coverage', 'version': 1,
                  'font_sha256': hashlib.sha256(font).hexdigest(),
                  'used': len(used), 'reviewed_used': len(used & mapping.keys()),
                  'missing': missing, 'complete_table': not missing, 'playable': False,
                  'note': 'Coverage checks explicit approvals; it does not independently verify their accuracy.'}
        write_json(a.out.parent, a.out.name, report)
        print(json.dumps({k: report[k] for k in ('used', 'reviewed_used', 'complete_table', 'playable')}))
        raise SystemExit(3 if missing else 0)
    except (OSError, ValueError, KeyError, TypeError) as e:
        p.exit(2, str(e) + '\n')


if __name__ == '__main__':
    main()
