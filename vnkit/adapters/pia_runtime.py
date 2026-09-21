"""Prepare private, executable SCRP content from this edition's recovered files.

This is a runtime package, not a linearisation of the scenario text. Scripts keep
their source instructions, relocation tables and stable offsets. Only explicit
runtime resources are exposed by the reader; raw extraction remains private.
"""
from __future__ import annotations
import argparse
import json
import os
import struct
import subprocess
from pathlib import Path
from vnkit.disc import FormatError, sha256_file, write_bytes, write_json
from vnkit.elf import Elf32
from .pia_media import _png, read_mlh
from .pia_ps2 import GAME_ID, TITLE, font_glyph_evidence

VERSION = '0.2.0'


def recover_layouts(extracted, mappings):
    """DAT fields consumed by _NchrDecodeNonBlock and _NevDecodeNonBlock."""
    resources = {'background': {}, 'cg': {}, 'sprite': {}, 'voice': {}, 'sound': {}, 'music': {}}
    by_container = {}
    for mapping in mappings:
        source = mapping['source']
        by_container.setdefault((source['archive'], source['member']), []).append(mapping)
    warnings = []
    for (archive, container), entries in by_container.items():
        kind = {'NBG.NFP': 'background', 'NEV.NFP': 'cg', 'NCHR.NFP': 'sprite'}.get(archive)
        if not kind:
            continue
        members = read_mlh((extracted / archive / container).read_bytes())
        dat = next((m['data'] for m in members if m['name'].upper().endswith('.DAT')), None)
        lookup = {m['source']['inner_name'].upper().removesuffix('.NBP'): m for m in entries}
        def name(at):
            return dat[at:at+16].split(b'\0')[0].decode('ascii').upper()
        def number(at):
            return struct.unpack_from('<i', dat, at)[0]
        base = name(0) if dat else container.removesuffix('.MLH')
        if base not in lookup:
            warnings.append({'archive': archive, 'container': container, 'reason': f'DAT base image {base} unavailable'})
            continue
        body = lookup[base]
        layout = {'asset': body['id'], 'width': body['image']['width'], 'height': body['image']['height'], 'layers': []}
        def layer(stem, x, y, role):
            if not stem:
                return
            image = lookup.get(stem)
            if not image:
                warnings.append({'archive': archive, 'container': container, 'reason': f'DAT {role} image {stem} unavailable'})
                return
            height = image['image']['height']
            if height % 3:
                warnings.append({'archive': archive, 'container': container, 'reason': f'{role} atlas height is not three frames'})
                return
            layout['layers'].append({'asset': image['id'], 'x': x, 'y': y, 'role': role,
                'width': image['image']['width'], 'height': height // 3, 'atlasFrames': 3, 'frame': 0})
        if kind == 'sprite' and dat and len(dat) >= 96:
            layout['indent'] = number(0x4c)
            layer(name(0x20), number(0x50), number(0x54), 'eye')
            layer(name(0x30), number(0x58), number(0x5c), 'mouth')
        elif kind == 'cg' and dat and len(dat) >= 0x1c:
            count = number(0x18)
            if 0 <= count <= 6 and (not count or 0x98 + (count - 1) * 124 <= len(dat)):
                for index in range(count):
                    offset = index * 124
                    layer(name(0x5c + offset), number(0x84 + offset), number(0x88 + offset), 'eye')
                    layer(name(0x6c + offset), number(0x90 + offset), number(0x94 + offset), 'mouth')
            else:
                warnings.append({'archive': archive, 'container': container, 'reason': 'Unsupported DAT overlay dimensions'})
        resources[kind][container.removesuffix('.MLH').upper()] = layout
    return resources, warnings


def copy_resource(source, output, relative):
    """Link immutable derived assets, with exact-content resume and no overwrite."""
    target = output / relative
    if target.is_symlink() or source.is_symlink():
        raise FormatError(f'Refusing symlink resource: {relative}')
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if not target.is_file() or sha256_file(target) != sha256_file(source):
            raise FileExistsError(f'refusing to overwrite different file: {target}')
    else:
        try:
            os.link(source, target)
        except OSError:
            from vnkit.disc import write_stream
            with source.open('rb') as stream:
                write_stream(output, relative, iter(lambda: stream.read(1024 * 1024), b''))


def build(analysis, extracted, output, audio=None, movie=None, music=None, upgrade_from=None):
    analysis, extracted, output = map(Path, (analysis, extracted, output))
    manifest = json.loads((analysis / 'manifest.json').read_text())
    if manifest.get('game_id') != GAME_ID or manifest.get('adapter') != 'pia-ps2':
        raise FormatError('Runtime packaging requires the verified SLPS-25222 v1.04 import')
    elf = Elf32((extracted / 'SLPS_252.22').read_bytes())
    from .pia_native_data import extract_native_data
    native_data = extract_native_data(elf)
    native_data['sourceImageContainers'] = {kind: sorted(p.stem.upper() for p in (extracted / archive).glob('*.MLH'))
        for kind, archive in [('background', 'NBG.NFP'), ('cg', 'NEV.NFP'), ('sprite', 'NCHR.NFP')]}
    # main clears the entire Grb block (0x1001f8..0x100208), including
    # GetSysGameClear's byte0x20f508. No memory-card record is imported.
    def literal(address):
        return elf.at(address, 32).split(b'\0')[0].decode('cp932')
    startup = {'familyName': literal(0x1f79e8), 'firstName': literal(0x1f79f0),
               'uniformType': 1, 'systemGameClear': 0}
    resources, layout_warnings = recover_layouts(extracted, manifest['asset_mappings'])
    assets = {}
    for mapping in manifest['asset_mappings']:
        copy_resource(analysis / mapping['path'], output, mapping['path'])
        assets[mapping['id']] = {'type': 'image', 'url': mapping['path'],
                                 'width': mapping['image']['width'], 'height': mapping['image']['height']}
    if audio:
        audio = Path(audio)
        audio_map = json.loads((audio / 'voice-candidates.json').read_text())
        for stem, item in audio_map['assets'].items():
            ident = 'NVAM.NFP:' + item['member']
            relative = 'assets/voice/' + item['wav']
            copy_resource(audio / item['wav'], output, relative)
            assets[ident] = {'type': 'voice', 'url': relative, 'duration': item['duration_seconds'],
                             'playbackRate': item['playback_rate'], 'sha256': item['wav_sha256']}
            resources['voice'][stem] = ident
        # Named VAS effects use the same proven sound-driver format as voices.
        for record in sorted(audio.rglob('PIASE*.audio.json')):
            item = json.loads(record.read_text())
            stem = record.name.removesuffix('.audio.json')
            source = record.parent / (stem + '.wav')
            if not source.is_file():
                continue
            ident = f'NVAM.NFP:{stem}.VAS'
            relative = f'assets/sound/{stem}.wav'
            copy_resource(source, output, relative)
            assets[ident] = {'type': 'sound', 'url': relative, 'playbackRate': item['playback_rate']}
            resources['sound'][stem] = ident
    if movie:
        movie = Path(movie)
        sources = []
        for filename, codec in [('OPENNING.vp9.mp4', 'vp09.00.10.08,flac'), ('OPENNING.mp4', 'avc1.64001f,flac')]:
            metadata = json.loads((movie / (filename + '.json')).read_text())
            if metadata.get('audio_roundtrip_verified') is not True:
                raise FormatError('Movie audio has not passed source PCM roundtrip validation')
            relative = 'assets/movie/' + filename
            copy_resource(movie / filename, output, relative)
            ident = 'movie:' + filename
            assets[ident] = {'type': 'video', 'url': relative, 'sha256': metadata['movie_sha256']}
            sources.append({'url': relative, 'type': f'video/mp4; codecs="{codec}"'})
        primary = 'movie:OPENNING.vp9.mp4'
        assets[primary]['sources'] = sources
        resources['movie'] = {'OPENNING': primary}
    if music:
        resources['ambient'] = {}
        for record in sorted(Path(music).glob('*.music.json')):
            item = json.loads(record.read_text())
            if item.get('format') != 'vnkit.pia-music' or item.get('version') != 1:
                raise FormatError(f'Unsupported music record: {record.name}')
            filename = item['filename']
            if Path(filename).name != filename or not filename.endswith('.flac'):
                raise FormatError(f'Unsafe music filename: {filename}')
            source = record.parent / filename
            if sha256_file(source) != item['output_sha256']:
                raise FormatError(f'Music fingerprint mismatch: {filename}')
            stem = source.stem.upper()
            kind = 'music' if stem.startswith('BGM') else 'ambient'
            ident, relative = 'NMUS:' + stem, 'assets/music/' + filename
            copy_resource(source, output, relative)
            sequence = item['sequence']
            assets[ident] = {'type': 'music' if kind == 'music' else 'sound', 'url': relative,
                'sha256': item['output_sha256'], 'loopStart': sequence.get('loop_start'),
                'loopEnd': sequence.get('loop_end'), 'warnings': item['warnings'],
                'source': item['source'], 'sourceSha256': item['source_sha256']}
            resources[kind][stem] = ident
    scripts = {}
    for path in sorted((analysis / 'analysis/scripts').glob('*.SPC.json')):
        parsed = json.loads(path.read_text())
        if parsed['failures'] or any('decode_error' in s for s in parsed['strings']):
            raise FormatError(f'{path.name}: source parse/decode failure')
        # Retain every instruction and relocation; omit verbose raw string bytes
        # already fingerprinted and preserved in the separate analysis import.
        compact = {key: parsed[key] for key in ['source', 'sha256', 'code_size', 'stack_bytes',
                   'local_number_variables', 'local_string_variables', 'chunks', 'instructions']}
        compact['strings'] = [{key: s[key] for key in ['id', 'code_offset', 'offset', 'text', 'raw_hex']} for s in parsed['strings']]
        name = parsed['source']
        relative = f'runtime/scripts/{name}.json'
        write_bytes(output, relative, json.dumps(compact, ensure_ascii=False, separators=(',', ':')).encode())
        scripts[name] = {'url': relative, 'sha256': parsed['sha256']}
        assets[f'script:{name}'] = {'type': 'script', 'url': relative}
    if 'OPEN01.SPC' not in scripts:
        raise FormatError('Executable-evidenced entry OPEN01.SPC is missing')
    font = (extracted / 'NETC.NFP/FNT24X25.NFT').read_bytes()
    glyph_info, _ = font_glyph_evidence(font)
    glyphs = {}
    for glyph in glyph_info['glyphs']:
        pixels = bytearray()
        for byte in font[glyph['font_offset']:glyph['font_offset'] + 150]:
            for shift in (6, 4, 2, 0):
                pixels.extend((255, 255, 255, ((byte >> shift) & 3) * 85))
        ident = f'font:{glyph["sjis_hex"]}'
        relative = f'assets/font/{glyph["sjis_hex"]}.png'
        write_bytes(output, relative, _png(24, 25, 4, bytes(pixels)))
        assets[ident] = {'type': 'image', 'url': relative, 'width': 24, 'height': 25}
        glyphs[chr(int(glyph['cp932_codepoint'][2:], 16))] = ident
    content = {'format': 'vnkit.content', 'version': 1, 'id': GAME_ID + '-runtime1', 'title': TITLE, 'replaces': [GAME_ID],
               'adapter': {'id': 'pia-ps2', 'version': VERSION}, 'nativeData': native_data, 'startup': startup,
               'resources': resources,
               'runtime': {'id': 'pia-ps2-scrp', 'version': 1, 'entry': 'OPEN01.SPC', 'scripts': scripts},
               'viewport': {'width': 640, 'height': 480}, 'glyphs': glyphs, 'assets': assets,
               'compatibility': {'status': 'experimental', 'label': 'PS2 · experimental script execution',
                 'summary': 'Original SCRP execution and extracted assets. Unsupported state or control calls stop with their source location. Full-game and original-console equivalence remain unverified.'}}
    if upgrade_from:
        previous_path = Path(upgrade_from) / 'content.json'
        previous = json.loads(previous_path.read_text())
        old_hashes = {name: s['sha256'] for name, s in previous.get('runtime', {}).get('scripts', {}).items()}
        new_hashes = {name: s['sha256'] for name, s in scripts.items()}
        if previous.get('id') != content['id'] or old_hashes != new_hashes or previous['runtime']['version'] != content['runtime']['version']:
            raise FormatError('Cannot preserve saves across different source programs/runtime versions')
        # Preserve the legacy whole-content signature only for this verified source.
        script = 'import fs from "node:fs"; import {signature} from "./web/engine.mjs"; console.log(signature(JSON.parse(fs.readFileSync(process.argv[1],"utf8"))));'
        old_signature = subprocess.check_output(['node', '--input-type=module', '-e', script, str(previous_path.resolve())], text=True).strip()
        content['compatibleSaveSignatures'] = sorted(set(previous.get('compatibleSaveSignatures', []) + [old_signature]))
    report = {'status': 'experimental', 'faithful_port': False, 'adapter_version': VERSION,
              'entrypoint': 'OPEN01.SPC, selected by _NopeningCtrl in the supplied executable',
              'scripts_packaged': len(scripts), 'images': len(manifest['asset_mappings']), 'layout_warnings': layout_warnings,
              'coverage': 'See docs/pia-runtime.md and private execution test evidence; packaging is not route coverage.',
              'limitations': ['Only source-evidenced VM/native behavior is implemented; unsupported control/state stops.',
                              'Native work/minigames and full-game route coverage remain unverified.',
                              'Original PS2 execution comparison has not been performed.']}
    write_json(output, 'compatibility.json', report)
    content['compatibility']['reportUrl'] = f'/content/{content["id"]}/compatibility.json'
    write_json(output, 'content.json', content)
    write_json(output, 'manifest.json', {'format_version': 1, 'tool': 'vnkit', 'adapter': 'pia-ps2',
               'adapter_version': VERSION, 'game_id': GAME_ID, 'runtime_game_id': content['id'],
               'source': manifest['source'], 'settings': {'encoding': 'strict cp932', 'artwork_upscale': False,
               'runtime': 'source SCRP instructions; no text linearisation'}, 'scripts': scripts,
               'assets': assets, 'custom_glyphs': glyph_info, 'status': 'experimental'})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--analysis', type=Path, required=True)
    parser.add_argument('--extracted', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--audio', type=Path, help='Directory produced by pia_audio --scripts')
    parser.add_argument('--movie', type=Path, help='Directory produced by pia_movie')
    parser.add_argument('--music', type=Path, help='Directory produced by pia_music')
    parser.add_argument('--upgrade-from', type=Path, help='Preserve legacy save compatibility after verifying unchanged source scripts')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.analysis, args.extracted, args.out, args.audio, args.movie, args.music, args.upgrade_from), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, f'pia-runtime: {error}\n')


if __name__ == '__main__':
    main()
