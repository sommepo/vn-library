"""Import the exact Cartagra disc with reviewed, font-bound Japanese text."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from .. import __version__
from ..disc import FormatError, write_bytes, write_json, write_stream
from .cartagra_ps2 import EXE, EXE_SHA256, native_tables
from .cartagra_text import FONT_SIZE, reviewed_map, require_glyphs
from .pia_media import _png
from .remember11_media import digest

VERSION = '0.3.0'
ROOT = Path(__file__).resolve().parents[2]


def import_game(source, out, work=None):
    from . import cartagra_ps2 as recovery
    from .cartagra_audit import audit
    from .cartagra_media import convert_resources, extract_movies
    from .cartagra_charset import bundled_review
    out = Path(out)
    work = Path(work or out.parent / (out.name + '-work'))
    print('Checking disc and recovering Cartagra resources…', flush=True)
    recovery.extract(source, work / 'archives-v1')
    print('Checking scripts and Japanese character coverage…', flush=True)
    report = audit(work / 'archives-v1', work / 'audit-v1')
    font = (work / 'archives-v1/SYSTEM.DAT/0024.bin').read_bytes()
    require_glyphs(reviewed_map(font, bundled_review()), report['used_glyphs'])
    for kind in ('images', 'audio'):
        print('Preparing Cartagra '+kind+'…', flush=True)
        convert_resources(work / 'archives-v1', work / 'media-v1', kind)
    print('Preparing original movies…', flush=True)
    extract_movies(source, work / 'movies-source-v1')
    subprocess.run([sys.executable, str(ROOT/'scripts/convert-remember11-movies.py'),
                    str(work/'movies-source-v1'), '--out', str(work/'media-v1/movies'),
                    '--max-mib', '1024', '--jobs', '1'], check=True)
    return import_preview(work, out, bundled=True)


def font_atlas(font):
    if len(font) != FONT_SIZE:
        raise FormatError('Wrong original font size')
    width, height = 32 * 24, 90 * 24
    rgba = bytearray(width * height * 4)
    for glyph in range(2880):
        for y in range(24):
            for x in range(24):
                v = font[glyph * 288 + y * 12 + x // 2]
                alpha = ((v >> 4) if x % 2 == 0 else (v & 15)) * 17
                at = ((glyph // 32 * 24 + y) * width + glyph % 32 * 24 + x) * 4
                rgba[at:at+4] = bytes((255, 255, 255, alpha))
    return _png(width, height, 4, rgba)


def import_preview(work, out, review_path=None, *, bundled=False):
    work, out = Path(work).resolve(), Path(out).resolve()
    recovery, media, audit = work/'archives-v1', work/'media-v1', work/'audit-v1'
    if digest(recovery/EXE) != EXE_SHA256:
        raise FormatError('Untested Cartagra executable')
    native = native_tables((recovery/EXE).read_bytes())
    recovered = json.loads((recovery/'manifest.json').read_text())
    font = (recovery/'SYSTEM.DAT/0024.bin').read_bytes()
    review = None
    if bundled:
        from .cartagra_charset import bundled_review
        review = bundled_review()
    if review_path:
        review = json.loads(Path(review_path).read_text())
    if review:
        require_glyphs(reviewed_map(font, review), json.loads((audit/'audit.json').read_text())['used_glyphs'])
    assets, scripts, records = {}, {}, []

    def copy_checked(root, rel, expected):
        # Cached manifests are still input: forbid traversal/symlink escape.
        src = (root/rel).resolve()
        if not src.is_relative_to(root.resolve()) or digest(src) != expected:
            raise FormatError('Invalid or changed cached resource: '+rel)
        with src.open('rb') as stream:
            result = write_stream(out, rel, iter(lambda: stream.read(1024*1024), b''))
        result.pop('status', None)
        records.append(result)

    for file in sorted((audit/'scripts').glob('*.json')):
        script = json.loads(file.read_text())
        if script.get('format') != 'vnkit.cartagra-sc3' or script['source']+'.json' != file.name:
            raise FormatError('Invalid script audit')
        source = recovery/'SCRIPT.DAT'/script['source']
        if digest(source) != script['sha256']:
            raise FormatError('Changed source script: '+script['source'])
        rel = 'scripts/'+file.name
        copy_checked(audit, rel, digest(file))
        scripts[script['source']] = {'url':rel, 'sha256':script['sha256'], 'resource_index':script['resource_index']}
        assets['script:'+script['source']] = {'type':'script', 'url':rel}
    if len(scripts) != 100:
        raise FormatError('Expected all 100 audited scripts')
    for kind in ('images', 'audio'):
        manifest = json.loads((media/(kind+'-manifest.json')).read_text())
        for item in manifest['assets']:
            # Thumbnails and UI resources are preserved in recovery, not needed
            # by the current browser scene compositor.
            if item['archive'] in ('BG2.DAT', 'CHARA2.DAT', 'SYSTEM.DAT'):
                continue
            copy_checked(media, item['url'], item['sha256'])
            category = {'BG.DAT':'bg', 'CHARA.DAT':'portrait'}.get(item['archive'],item['type'])
            ident = f"{category}:{item['index']}"
            assets[ident] = {k:item[k] for k in ('type','url','width','height','loopStart','loopEnd') if k in item}
            if item['type'] == 'music':
                assets[ident]['label'] = Path(item['source']).stem.split('-',1)[-1]
    for movie in native['movies']:
        stem = Path(movie['name']).stem
        rel = f'movies/{stem}/{stem}.vp9.mp4'
        meta = json.loads((media/(rel+'.json')).read_text())
        check = json.loads((media/Path(rel).parent/'roundtrip.json').read_text())
        if check['movie_sha256'] != meta['movie_sha256']:
            raise FormatError('Movie roundtrip belongs to another conversion')
        copy_checked(media, rel, meta['movie_sha256'])
        assets[f"video:{movie['index']}"] = {'type':'video','url':rel}
    font_hash = hashlib.sha256(font).hexdigest()
    write_bytes(out, 'font/atlas.png', font_atlas(font))
    write_json(out, 'native.json', native)
    assets['font'] = {'type':'image','url':'font/atlas.png','width':768,'height':2160}
    assets['native'] = {'type':'script','url':'native.json'}
    summary = 'Original-font preview: Unicode text and learning features are not available yet.'
    if review:
        export = {k:review[k] for k in ('format','version','font_sha256','glyphs','review_note','normalization_notes','review_evidence') if k in review}
        records.append(write_json(out, 'font/reviewed-map.json', export))
        assets['glyphMap'] = {'type':'script','url':'font/reviewed-map.json'}
        summary = 'Experimental reader with source-font-reviewed Japanese text. Native presentation remains incomplete.'
    status = 'experimental-reviewed-text' if review else 'experimental-source-font'
    warnings = [summary, 'Native animation, transitions, credits and system menus are incomplete.',
                'Source waits run instantly while executing their state changes.',
                'Original-console comparison and exhaustive optional branch coverage are unverified.',
                'One macro instruction and unsupported auxiliary menu operations remain fail-closed.',
                'Startup/system retain 60 structural parser stops.']
    content = {'format':'vnkit.content','version':1,'id':'cartagra-slpm66231-1.01',
               'title':'Cartagra — 魂ノ苦悩'+('' if review else ' · font preview'),
               'platform':{'id':'ps2','name':'PlayStation 2'},
               'adapter':{'id':'cartagra-ps2','version':VERSION},
               'viewport':{'width':640,'height':448},'assets':assets,
               'runtime':{'id':'cartagra-ps2-sc3','version':1,'scripts':scripts,
                          'native':'native.json','font':'font','font_sha256':font_hash,
                          'executable_sha256':EXE_SHA256,'textMode':'reviewed-unicode' if review else 'original-glyphs'},
               'compatibility':{'status':status,'summary':summary}}
    write_json(out, 'compatibility.json', {'status':status,'playable':bool(review),'warnings':warnings,
                                         'unicode_review':bool(review),'independent_proofread':False})
    write_json(out, 'manifest.json', {'format':'vnkit.manifest','version':1,'tool_version':__version__,
                                    'adapter_version':VERSION,'executable_sha256':EXE_SHA256,
                                    'source':recovered['source'],'identification':recovered['identification'],
                                    'font_sha256':font_hash,'warnings':warnings,'outputs':records})
    write_json(out, 'content.json', content)
    return {'status':status,'out':str(out),'assets':len(assets),'scripts':len(scripts)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--review',type=Path,help='Font-bound, explicitly reviewed Unicode map')
    args = parser.parse_args()
    try:
        print(json.dumps(import_preview(args.work,args.out,args.review),indent=2))
    except (OSError, ValueError, KeyError) as e:
        parser.exit(2,str(e)+'\n')
