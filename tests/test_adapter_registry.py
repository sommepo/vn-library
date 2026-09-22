import unittest

from vnkit.adapters.registry import ADAPTERS, adapter_ids, adapter_spec, gui_adapter


class AdapterRegistryTests(unittest.TestCase):
    def test_registered_modules_match_their_declared_ids(self):
        for spec in ADAPTERS:
            self.assertEqual(spec.load().ADAPTER_ID, spec.adapter_id)

    def test_gui_records_are_explicit_and_have_unique_game_ids(self):
        game_ids = [spec.gui_game_id for spec in ADAPTERS if spec.gui_playable]
        self.assertEqual(len(game_ids), len(set(game_ids)))
        self.assertEqual(gui_adapter('clannad-ps2').gui_game_id, 'clannad-slpm66302-1.01')
        self.assertEqual(gui_adapter('remember11-ps2').gui_game_id, 'remember11-slpm65550-1.02')
        self.assertEqual(gui_adapter('clannad-ps2').setup_guide, 'clannad-import.md')
        self.assertEqual(gui_adapter('remember11-ps2').setup_guide, 'remember11-import.md')
        never7 = gui_adapter('never7-ps2')
        self.assertEqual(never7.gui_game_id, 'never7-slps25256-1.01')
        self.assertEqual(never7.preflight_profile, gui_adapter('remember11-ps2').preflight_profile)
        self.assertEqual(never7.max_unsupported_sites, 0)
        self.assertEqual(len(game_ids), 3)
        self.assertTrue(all(spec.edition_label for spec in ADAPTERS if spec.gui_playable))
        self.assertIsNone(gui_adapter('pia-ps2'))

    def test_lookup_and_cli_ids_share_one_registration_source(self):
        self.assertEqual(adapter_ids(), tuple(spec.adapter_id for spec in ADAPTERS))
        self.assertIs(adapter_spec('never7-ps2'), ADAPTERS[-1])
        self.assertIsNone(adapter_spec('not-an-adapter'))


if __name__ == '__main__':
    unittest.main()
