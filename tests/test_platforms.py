import unittest
from vnkit.platforms import content_platform


class PlatformTests(unittest.TestCase):
    def test_explicit_and_legacy_metadata(self):
        self.assertEqual(content_platform({'id': 'clannad-slpm66302-1.01'})['id'], 'ps2')
        self.assertEqual(content_platform({'id': 'unrecognised', 'adapter': {'id': 'clannad-ps2'}})['id'], 'unknown')
        self.assertEqual(content_platform({'platform': {'id': 'pc98', 'name': 'PC-9800'}})['id'], 'pc98')
        self.assertEqual(content_platform({'platform': {'id': '../ps2'}})['id'], 'unknown')
