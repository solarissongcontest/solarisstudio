"""Offline negative and positive S14 final seed evidence tests."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

from scripts.v3_s14_final_seed import EXPECTED, validate_final_seed, validate_final_seed_artifact


class FinalSeedProofTests(unittest.TestCase):
    def setUp(self):
        self.valid = [str(v) for v in EXPECTED.values()]

    def test_exact_final_database_counts_are_reported_not_substituted(self):
        self.assertEqual(validate_final_seed(self.valid), EXPECTED)

    def test_any_final_database_composition_count_drift_blocks(self):
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
                with self.assertRaisesRegex(ValueError, f"exactly {len(EXPECTED)}"):
                    validate_final_seed(counts)

    def test_inexact_or_unsafe_numeric_encodings_fail_closed(self):
        for bad in ("", " 66", "66 ", "+66", "-1", "66.0", "066", "６６", "null", "66\n0"):
            with self.subTest(bad=bad):
                modified = self.valid.copy()
                modified[1] = bad
                with self.assertRaisesRegex(ValueError, "nonnegative count"):
                    validate_final_seed(modified)

    def test_66_distinct_countries_have_86_appearances_and_two_entries(self):
        self.assertEqual(
            EXPECTED["participantCount"],
            EXPECTED["semiOneAppearanceCount"]
            + EXPECTED["semiTwoAppearanceCount"]
            + EXPECTED["grandFinalAppearanceCount"]
            + EXPECTED["editionEntryCount"],
        )
        self.assertEqual(EXPECTED["distinctParticipantCountryCount"], 66)
        self.assertEqual(EXPECTED["expectedSyncedEditionEntryCount"], EXPECTED["editionEntryCount"])
        self.assertEqual(EXPECTED["duplicateAppearanceGroupCount"], 0)
        self.assertEqual(EXPECTED["nullCountryCount"], 0)
        self.assertEqual(EXPECTED["semiFinalCountrySetMismatchCount"], 0)


    def test_exact_persisted_artifact_contract(self):
        self.assertEqual(validate_final_seed_artifact(dict(EXPECTED)), EXPECTED)
        for name, expected in EXPECTED.items():
            with self.subTest(name=name, issue="count"):
                changed = dict(EXPECTED)
                changed[name] = expected + 1
                with self.assertRaisesRegex(ValueError, name):
                    validate_final_seed_artifact(changed)
            with self.subTest(name=name, issue="missing"):
                changed = dict(EXPECTED)
                del changed[name]
                with self.assertRaisesRegex(ValueError, "field mismatch"):
                    validate_final_seed_artifact(changed)
            with self.subTest(name=name, issue="boolean"):
                changed = dict(EXPECTED)
                changed[name] = (expected != 0)
                with self.assertRaisesRegex(ValueError, name):
                    validate_final_seed_artifact(changed)
            with self.subTest(name=name, issue="float"):
                changed = dict(EXPECTED)
                changed[name] = float(expected)
                with self.assertRaisesRegex(ValueError, name):
                    validate_final_seed_artifact(changed)
        for malformed in (None, [], "66", {"unexpected": 1}, {**EXPECTED, "unexpected": 0}):
            with self.subTest(malformed=malformed):
                with self.assertRaises(ValueError):
                    validate_final_seed_artifact(malformed)

    def test_cli_emits_the_actual_validated_counts_only(self):
        script = Path(__file__).with_name("v3_s14_final_seed.py")
        success = subprocess.run([sys.executable, str(script), *self.valid], capture_output=True, text=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(success.stdout), EXPECTED)
        self.assertEqual(success.stderr, "")
        modified = self.valid.copy()
        modified[4] = "65"
        failure = subprocess.run([sys.executable, str(script), *modified], capture_output=True, text=True)
        self.assertNotEqual(failure.returncode, 0)
        self.assertEqual(failure.stdout, "")
        self.assertIn("activeHodDelegationCount drift", failure.stderr)


if __name__ == "__main__":
    unittest.main()
