"""Exact Gyakuten Saiban 3 (AGB-A3JJ) cartridge: static recovery and identification.

Edition facts below are discovered from and checked against the supplied ROM;
see docs/gs3-gba-runtime.md. Shared series logic is in gyakuten_series. Five
commands take more arguments in this edition than in Gyakuten Saiban 2; the
lengths were measured so that every section of every script parses exactly.
"""
from . import gs2_gba
from . import gyakuten_series as series

ROM_SHA1 = '70944b396da3f9ce039cc96bc1661826c37b0aa2'
_C = gs2_gba.COMMANDS
COMMANDS = {
    0x06: (3, _C[0x06][1], _C[0x06][2]),       # sound effect: id and play/stop
    0x3A: (3, _C[0x3A][1], _C[0x3A][2]),
    0x55: (3, 'background_stripe', 'presentation'),
    0x69: (3, _C[0x69][1], _C[0x69][2]),
    0x6B: (4, _C[0x6B][1], _C[0x6B][2]),
}
EDITION = series.Edition(
    key='gs3', adapter_id='gs3-gba', title='逆転裁判3', header=b'GYAKUTEN_SA3A3JJ08', rom_sha1=ROM_SHA1,
    content_id='gs3-agb-a3jj', edition_label='Japanese Game Boy Advance AGB-A3JJ rev 0',
    scenario_table=0x49B38,
    # Episodes 1-5, then two leftover debug scenarios (parsed and audited, never offered).
    scenarios=('0_0', '0_1', '1_0', '1_1', '1_2', '1_3', '1_4', '2_0', '2_1', '2_2', '2_3', '2_4',
               '3_0', '3_1', '4_0', '4_1', '4_2', '4_3', '4_4', '4_5', '4_6', '4_7', '4_8',
               'debug_court', 'debug_investigation'),
    episode_starts=(0, 2, 7, 12, 14),
    # 1,536 glyphs: the last seven (1529-1535) are used only by script parts loaded over the
    # main script, which the static decode does not reach.
    font_offset=0x1F31CC, glyphs=1536,
    font_sha256='bc198f04dbaf2f9d94b4d0fd684e913d4a7a1da7e2e5021d25975a33e93891ce',
    commands=COMMANDS,
    # Investigation scripts the loader (code at 0x1EE9C-0x1EFF0) decompresses instead of
    # the table entry. Ten further blocks there are partial (loaded with a section base)
    # and are not decoded statically; the reader reads their text from RAM.
    extra_scripts=(0x701E20, 0x71ECFC, 0x725090, 0x741E88, 0x75B1F4, 0x762B20, 0x7A07B4, 0x7BEDC8, 0x7C9EA0),
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
