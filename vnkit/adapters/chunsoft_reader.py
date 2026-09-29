"""Assemble private Chunsoft PS1 readers from verified local media.

This builder does not admit a candidate to Add game or claim native fidelity.
All native resources required by the bounded reader are explicitly catalogued.
"""
import json
from pathlib import Path
from ..disc import FormatError, write_bytes, write_json, write_stream, sha256_file


def safe_path(root, value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise FormatError('Invalid reader resource path')
    relative = Path(value)
    if relative.is_absolute() or any(part.startswith('.') for part in relative.parts):
        raise FormatError('Unsafe reader resource path')
    path = root / relative
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise FormatError('Reader resource escaped its source')
    return path


def build(game, executable, artwork, media, output, *, scripts=None, cdimg=None):
    from . import kamaitachi_ps1, otogirisou_ps1
    adapter = {'kamaitachi': kamaitachi_ps1, 'otogirisou': otogirisou_ps1}.get(game)
    if adapter is None or sha256_file(executable) != adapter.EXE_SHA256:
        raise FormatError('Unsupported reader executable')
    out, art = Path(output), Path(artwork)
    assets, files = {}, []

    def copy(source, url, digest=None):
        if Path(source).is_symlink() or digest is not None and sha256_file(source) != digest:
            raise FormatError('Reader source hash mismatch')
        with Path(source).open('rb') as stream:
            row = write_stream(out, url, iter(lambda: stream.read(1024**2), b''))
        row.pop('status', None); files.append(row)
        return row['sha256']

    for manifest_path in [art / 'artwork.json', *map(Path, media)]:
        manifest = json.loads(manifest_path.read_text())
        for key, row in manifest['assets'].items():
            if key in assets:
                raise FormatError('Duplicate reader asset')
            source = safe_path(manifest_path.parent, row['url'])
            # Separate conversion directories may share cache-relative names.
            url = f'media/{manifest_path.parent.name}/{row["url"]}'
            digest = copy(source, url, row['sha256'])
            assets[key] = {k: v for k, v in row.items() if k in
                          ('type','width','height','x','y','duration','loopStart','loopEnd','cue')}
            assets[key].update(url=url, sha256=digest)
    runtime = {'id': adapter.ADAPTER_ID, 'version': 1,
               'executable_sha256': adapter.EXE_SHA256, 'executable': 'runtime/source.bin',
               'font': 'runtime/font.json'}
    for key, source, url in [('source', Path(executable), runtime['executable']),
                             ('font', art/'font.json', runtime['font'])]:
        assets['runtime:'+key] = {'type': 'script', 'url': url, 'sha256': copy(source, url)}
    if game == 'kamaitachi':
        if scripts is None:
            raise FormatError('Kamaitachi scripts required')
        runtime['scripts'] = {}
        for source in sorted(Path(scripts).glob('[0-9][0-9].json')):
            data = json.loads(source.read_text())
            if data['format'] != 'vnkit.kamaitachi-script':
                raise FormatError('Invalid Kamaitachi source script')
            key, url = str(data['id']), f'scripts/{data["id"]:02}.json'
            digest = copy(source, url)
            runtime['scripts'][key] = {'url': url, 'sha256': data['sha256']}
            assets['script:'+key] = {'type': 'script', 'url': url, 'sha256': digest}
        if len(runtime['scripts']) != 42:
            raise FormatError('Incomplete Kamaitachi script set')
    else:
        from .otogirisou_data import CDIMG_SHA256
        if cdimg is None or sha256_file(cdimg) != CDIMG_SHA256:
            raise FormatError('Otogirisou CDIMG identity mismatch')
        runtime.update(cdimg='runtime/cdimg.bin', cdimg_sha256=CDIMG_SHA256)
        assets['runtime:cdimg'] = {'type': 'script', 'url': runtime['cdimg'],
                                   'sha256': copy(cdimg, runtime['cdimg'], CDIMG_SHA256)}
    content = {'format': 'vnkit.content', 'version': 1, 'id': game+'-'+adapter.EXECUTABLE.lower().replace('_','').replace('.',''),
               'title': adapter.TITLE, 'platform': {'id': 'ps1', 'name': 'PlayStation'},
               'viewport': {'width': 320, 'height': 240}, 'presentation': {'textLayout': 'full-scene'},
               'adapter': {'id': adapter.ADAPTER_ID, 'version': '0.3.0'},
               'runtime': runtime, 'assets': assets,
               'compatibility': {'status': 'experimental', 'summary':
                   'Source-driven reader. Original full-scene text and choices; native effects, audio controls and auxiliary menus remain incomplete.'}}
    write_json(out, 'content.json', content)
    write_json(out, 'compatibility.json', content['compatibility'])
    write_json(out, 'manifest.json', {'format': 'vnkit.import-manifest', 'version': 1,
                                    'adapter': content['adapter'], 'files': files})
    return content
