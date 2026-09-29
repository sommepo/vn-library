"""Local CUE/BIN import for the two exact PS1 sound-novel editions.

Recovery, conversion and reader assembly have separate resumable directories.
Native presentation limits remain explicit; this does not enable ISO-only upload.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from ..disc import FormatError, write_json
from . import kamaitachi_ps1, otogirisou_ps1
from .chunsoft_reader import build
from .memoriesoff_media import ROOT, tools


def sound_variants(exe, scripts):
    """Selectors come from source commands and the exact native kind table."""
    variants = {}
    for script in scripts:
        for command in script['commands']:
            op, args = command['op'], command['args']
            if op in (0x30, 0x32):
                at = 2 if op == 0x32 else 0
                value = args[at] + 256 * args[at + 1]
                variant = (value - 1000) // 1000
            elif op in (0x35, 0x36):
                value, variant = args[1] + 256 * args[2], args[0]
            else:
                continue
            if not 1000 <= value < 65535 or value == 9999 or not variant:
                continue
            logical = value % 1000
            if logical >= 192:
                raise FormatError('Sound selector outside native kind table')
            if exe[2048 + 0x5b04c + logical * 2] == 0:
                variants.setdefault(str(logical), set()).add(variant)
    return {key: sorted(value) for key, value in sorted(variants.items())}


def import_game(source, out, work=None):
    source, out = Path(source), Path(out)
    work = Path(work or out.parent / (out.name + '-work'))
    adapter = next((a for a in (kamaitachi_ps1, otogirisou_ps1)
                    if a.detect(source)['supported']), None)
    if adapter is None:
        raise FormatError('Unsupported PS1 sound-novel edition')
    tool = Path(os.environ.get('VNKIT_CHUNSOFT_VGMTRANS',
                ROOT / 'private/otogirisou/tooling/exact-vab/vgmtrans-shell')).resolve()
    if not tool.is_file():
        raise FormatError('Original-bank conversion needs the documented exact-VAB VGMTrans build; see docs/chunsoft-ps1-runtime.md')
    review = None
    if adapter is otogirisou_ps1:
        from .otogirisou_charset import bundled_review
        review = bundled_review()
        if review_path := os.environ.get('VNKIT_OTOGIRISOU_FONT_REVIEW'):
            if not Path(review_path).is_file():
                raise FormatError('Configured Otogirisou font review does not exist')
            review = json.loads(Path(review_path).read_text())
    _, env = tools()

    def run(module, *args):
        subprocess.run([sys.executable, '-u', '-m', 'vnkit.adapters.' + module,
                        *map(str, args)], env=env, check=True, timeout=3600)

    recovery, artwork = work / 'recovery-v1', work / 'artwork-v3'
    music, sounds, movies = work / 'music-v2', work / 'sound-v2', work / 'movies-v2'
    executable = recovery / 'original' / adapter.EXECUTABLE
    if adapter is kamaitachi_ps1:
        from .kamaitachi_media import convert
        from .kamaitachi_script import parse
        from .chunsoft_ps1 import unpack_ike
        adapter.recover(source, recovery, all_members=True)
        scripts_dir, scripts = work / 'scripts-v1', []
        for path in sorted((recovery / 'stored/SCE').glob('*.bin')):
            data = path.read_bytes()
            if data[2:5] == b'ike':
                data, _ = unpack_ike(data)
            script = parse(data, int(path.stem, 16))
            scripts.append(script)
            write_json(scripts_dir, f'{script["id"]:02}.json', script)
        convert(recovery, artwork)
        run('kamaitachi_audio', recovery, '--out', music, '--vgmtrans', tool)
        variants = work / 'sound-variants.json'
        write_json(work, variants.name, sound_variants(executable.read_bytes(), scripts))
        media = [music / 'music.json']
        for name, extra in [('sound-v2', []), ('sound-pairs-v2', ['--paired']),
                            ('sound-variants-v2', ['--variants', variants]),
                            ('sound-pair-variants-v2', ['--paired', '--variants', variants])]:
            run('kamaitachi_sound', '--recovery', recovery, '--executable', executable,
                '--out', work / name, '--vgmtrans', tool, *extra)
            media.append(work / name / 'sounds.json')
        content = build('kamaitachi', executable, artwork, media, out, scripts=scripts_dir)
    else:
        from .otogirisou_media import convert
        adapter.recover(source, recovery)
        cdimg = recovery / 'original/CDIMG.BIN'
        convert(executable.read_bytes(), cdimg.read_bytes(), artwork, review)
        run('otogirisou_audio', '--exe', executable, '--cdimg', cdimg,
            '--out', music, '--vgmtrans', tool)
        run('otogirisou_sound', '--executable', executable, '--cdimg', cdimg,
            '--out', sounds, '--vgmtrans', tool)
        run('otogirisou_movie', '--cue', source, '--out', movies)
        content = build('otogirisou', executable, artwork,
                        [music / 'music.json', sounds / 'sounds.json', movies / 'movies.json'],
                        out, cdimg=cdimg)
    return {'status': 'incomplete-runtime', 'gameId': content['id'], 'out': str(out),
            'assets': len(content['assets']), 'warnings': [content['compatibility']['summary']]}
