"""Deterministic release, constructed without consulting a broad working-tree glob."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile
from .disc import write_bytes

ROOT = Path(__file__).resolve().parent.parent
TOP = ['README.md', 'AGENTS.md', 'LICENSE', '.gitignore', '.dockerignore', 'Dockerfile', 'compose.yaml']
EXACT = ['web/media/nova-mistero.mp3', 'scripts/windows-reader.pyw', 'scripts/vgmtrans-remember11-pressure.patch', 'scripts/audio-tools.lock.json', 'third_party/vgmtrans-filename-match.patch']
TREES = {
    'vnkit': {'.py'}, 'web': {'.mjs', '.js', '.html', '.css', '.md'},
    'scripts': {'.py', '.mjs', '.js', '.sh'}, 'tests': {'.py', '.mjs', '.js'},
    'docs': {'.md'}, 'third_party': {'.txt', '.md'}, '.agents/skills/vn-import': {'.md'},
    'windows': {'.cs', '.ps1', '.cmd', '.json', '.md'},
}
FIXTURE_FILES = {'README.md', 'build.py', 'content.json', 'chime.wav', 'music.wav', 'voice-test.wav',
                 'dawn.svg', 'forest.svg', 'guide.svg', 'night.svg', 'shore.svg'}


def release_path(relative):
    """Check every component, including selected roots and top-level files."""
    path = ROOT
    for component in Path(relative).parts:
        path /= component
        if path.is_symlink():
            raise ValueError(f'Release rejects symlink: {path}')
    return path

def build(output):
    paths = [path for p in TOP + EXACT if (path := release_path(p)).is_file()]
    for name, extensions in TREES.items():
        folder = release_path(name)
        for p in sorted(folder.rglob('*')):
            if p.is_symlink():
                raise ValueError(f'Release rejects symlink: {p}')
            if p.is_file() and '__pycache__' not in p.parts and p.suffix in extensions:
                paths.append(p)
    for name in sorted(FIXTURE_FILES):
        path = release_path('fixtures/synthetic/' + name)
        if path.is_file():
            paths.append(path)
    manifest = {}
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for p in sorted(set(paths)):
                name = str(p.relative_to(ROOT))
                data = p.read_bytes()
                manifest[name] = hashlib.sha256(data).hexdigest()
                add(archive, 'vnkit/' + name, data)
            add(archive, 'vnkit/PACKAGE-MANIFEST.json', (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode())
    out = Path(output)
    record = write_bytes(out.parent, out.name, buffer.getvalue())
    return {'package': str(out.resolve()), 'files': len(manifest), 'sha256': record['sha256'],
            'policy': 'Code/docs plus original synthetic fixture only; no private directory or original discs.'}

def add(archive, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mtime = 0
    info.mode = 0o644
    archive.addfile(info, io.BytesIO(data))
