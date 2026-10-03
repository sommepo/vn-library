"""Private native import of Gyakuten Saiban 3 (AGB-A3JJ); see gyakuten_series.build."""
from . import gs3_gba, gyakuten_series as series


def build(source, output, charset_path=None, names_path=None):
    return series.build(gs3_gba.EDITION, source, output, charset_path, names_path)


def import_game(source, output, work=None):
    return build(source, output)
