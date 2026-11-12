"""Offline negative and positive S14 final seed evidence tests."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

from scripts.v3_s14_final_seed import EXPECTED, validate_final_seed


class FinalSeedProofTests(unittest.TestCase):
    def setUp(self):
        self.valid = [str(v) for v in EXPECTED.values()]

    def test_exact_final_database_counts_are_reported_not_substituted(self):
        self.assertEqual(validate_final_seed(self.valid), EXPECTED)

    def test_changed_edition_delegation_show_participant_or_hod_count_blocks(self):
        for index, (name, expected) in enumerate(EXPECTED.items()):
            for changed in (0, expected + 1):
                if changed == expected:
                    continue
                with self.subTest(name=name, changed=changed):
                    modified = self.valid.copy()
                    modified[index] = str(changed)
                    with self.assertRaisesRegex(ValueError, name):
                        validate_final_seed(modified)

    def test_absent_or_extra_counts_fail_closed(self):
        for counts in ([], self.valid[:-1], self.valid + ["1"]):
            with self.subTest(counts=counts):
                with self.assertRaisesRegex(ValueError, "exactly five"):
                    validate_final_seed(counts)

    def test_inexact_or_unsafe_numeric_encodings_fail_closed(self):
        for bad in ("", " 66", "66 ", "+66", "-1", "66.0", "066", "６６", "null", "66\n0"):
            with self.subTest(bad=bad):
                modified = self.valid.copy()
                modified[1] = bad
                with self.assertRaisesRegex(ValueError, "nonnegative count"):
                    validate_final_seed(modified)

    def test_cli_emits_the_actual_validated_counts_only(self):
        script = Path(__file__).with_name("v3_s14_final_seed.py")
        success = subprocess.run([sys.executable, str(script), *self.valid], capture_output=True, text=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(success.stdout), EXPECTED)
        self.assertEqual(success.stderr, "")
        modified = self.valid.copy()
        modified[-1] = "65"
        failure = subprocess.run([sys.executable, str(script), *modified], capture_output=True, text=True)
        self.assertNotEqual(failure.returncode, 0)
        self.assertEqual(failure.stdout, "")
        self.assertIn("activeHodDelegationCount drift", failure.stderr)


if __name__ == "__main__":
    unittest.main()
