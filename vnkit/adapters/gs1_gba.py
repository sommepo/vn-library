"""Exact Gyakuten Saiban (AGB-ASBJ) cartridge: static recovery and identification.

Edition facts below are discovered from and checked against the supplied ROM;
see docs/gs1-gba-runtime.md. Shared series logic is in gyakuten_series.
"""
from . import gyakuten_series as series

ROM_SHA1 = '15c0e3389709bb275c42e99ed25212d09e49e361'
EDITION = series.Edition(
    key='gs1', adapter_id='gs1-gba', title='逆転裁判', header=b'GYAKUTEN_SAIASBJ08', rom_sha1=ROM_SHA1,
    content_id='gs1-agb-asbj', edition_label='Japanese Game Boy Advance AGB-ASBJ rev 0',
    # Episode 1 is one court part; episodes 2-4 alternate investigation and court parts.
    scenario_table=0x18740,
    scenarios=('0_0', '1_0', '1_1', '1_2', '1_3', '2_0', '2_1', '2_2', '2_3', '2_4', '2_5',
               '3_0', '3_1', '3_2', '3_3', '3_4', '3_5'),
    episode_starts=(0, 1, 5, 11),
    font_offset=0x1D312C, glyphs=1351,
    font_sha256='5ceaa0cf4f5430e4dfe1ef57e239f8dcd606d89fe7c82113fb12852723cb1cac',
)
ADAPTER_ID = EDITION.adapter_id
ADAPTER_VERSION = EDITION.adapter_version


def identify(path):
    return series.identify(EDITION, path)


def detect(path):
    return series.detect(EDITION, path)


def inspect(path, fingerprint=False):
    return series.inspect(EDITION, path)


def extract(source, destination):
    return series.recover(EDITION, source, destination)
