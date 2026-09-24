"""Explicit platform metadata, with an exact-ID bridge for old imports.

Never infer a platform from an adapter/runtime name. This bridge does not grant
an unknown edition support; it only labels imports made before metadata existed.
"""
LEGACY_PS2 = frozenset({
    'clannad-slpm66302-1.01', 'remember11-slpm65550-1.02',
    'remember11-slpm65550-1.0', 'never7-slps25256-1.01',
})


def content_platform(content):
    value = content.get('platform')
    if isinstance(value, dict) and isinstance(value.get('id'), str):
        ident = value['id']
        if ident and len(ident) < 40 and all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in ident):
            return {'id': ident, 'name': str(value.get('name', ident))[:80]}
    if content.get('id') in LEGACY_PS2:
        return {'id': 'ps2', 'name': 'PlayStation 2'}
    return {'id': 'unknown', 'name': 'Unspecified platform'}
