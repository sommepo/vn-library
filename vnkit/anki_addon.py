"""Build a small original Anki add-on without bundling Anki or AnkiConnect."""
import io
import json
from pathlib import Path
import zipfile
from .anki_bridge import DEFAULTS, origin


def build_addon(reader_origin):
    if origin(reader_origin) != reader_origin:
        raise ValueError('Expected reader origin')
    root = Path(__file__).resolve().parent.parent
    config = {**DEFAULTS, 'reader_origins': [reader_origin]}
    buffer = io.BytesIO()
    files = {'__init__.py': (root/'anki-addon/__init__.py').read_bytes(),
             'bridge.py': (root/'vnkit/anki_bridge.py').read_bytes(),
             'config.json': json.dumps(config, indent=2).encode(),
             'config.md': (root/'anki-addon/config.md').read_bytes(),
             'LICENSE': (root/'LICENSE').read_bytes(),
             'manifest.json': json.dumps({'package':'vn_library_media','name':'VN Library media','human_version':'0.1.0'}).encode()}
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buffer.getvalue()
