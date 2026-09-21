"""Private ELF probes are optional; public tests contain no game binary/text."""
from pathlib import Path
import unittest
from vnkit.adapters.clannad_expression import probe
from vnkit.disc import FormatError

ELF = Path(__file__).resolve().parents[1] / 'private/clannad/disc/SLPM_663.02'

class ConditionProbeTests(unittest.TestCase):
    def test_unknown_executable_rejected(self):
        with self.assertRaises(FormatError):
            probe(b'original synthetic bytes', '(0==0)')

    @unittest.skipUnless(ELF.is_file(), 'Requires the user-owned CLANNAD ELF; never bundled')
    def test_bounded_native_condition_evaluator(self):
        raw = ELF.read_bytes()
        self.assertEqual(probe(raw, '(0==0)')['value'], 1)
        self.assertEqual(probe(raw, '(0==1)')['value'], 0)
        result = probe(raw, '(F[1089]==2)', {'F': {1089: 2}})
        self.assertEqual(result['value'], 1)
        self.assertIn(0x371ab8 + 1089 * 2, result['variable_reads'])
        self.assertEqual(probe(raw, '(F[1089]==2)', {'F': {1089: 1}})['value'], 0)
        # Original synthetic unknown symbolic name, not a transcript from the game.
        for value in (0, 1):
            result = probe(raw, f'(＠合成試験=={value})')
            self.assertEqual(result['value'], 1 - value)
            self.assertEqual(result['variable_reads'], [])
            self.assertLess(result['steps'], 20000)
