import unittest
import importlib.util
from pathlib import Path

from scripts.v3_s14_final_seed import EXPECTED

spec = importlib.util.spec_from_file_location("release_evidence", Path(__file__).with_name("verify-v3-release-acceptance-evidence.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
validate, STAGES, EXTENSIONS, INVARIANTS, FAILURES = (module.validate, module.STAGES, module.EXTENSIONS, module.INVARIANTS, module.FAILURES)

SHA = "a" * 40


def complete():
    return {
        "candidateSha": SHA, "passed": True, "partial": False, "runtimeFailure": False,
        "completedStages": STAGES[:], "completedContestExtensions": EXTENSIONS[:],
        "pendingStages": [], "pendingContestExtensions": [], "blockedContestExtensions": [],
        "implementedInvariants": sorted(INVARIANTS),
        "implementedFailureInjections": sorted(FAILURES),
        "seed": dict(EXPECTED),
        "runIdentity": {"candidateSha": SHA, "editionId": "synthetic-edition", "databaseFingerprint": "synthetic-db"},
        "lifecycle": {"finalState": "archived"},
    }


class EvidenceContract(unittest.TestCase):
    def test_complete(self):
        self.assertEqual(validate(complete(), SHA), [])

    def test_wrong_commit(self):
        self.assertTrue(validate(complete(), "b" * 40))

    def test_partial_or_failed(self):
        for key, value in [("passed", False), ("partial", True), ("runtimeFailure", True)]:
            with self.subTest(key=key):
                evidence = complete()
                evidence[key] = value
                self.assertTrue(validate(evidence, SHA))

    def test_missing_stage_and_browser_extension(self):
        for key in ("completedStages", "completedContestExtensions"):
            with self.subTest(key=key):
                evidence = complete()
                evidence[key].pop()
                self.assertTrue(validate(evidence, SHA))

    def test_missing_security_invariant_and_failure_injection(self):
        for key in ("implementedInvariants", "implementedFailureInjections"):
            with self.subTest(key=key):
                evidence = complete()
                evidence[key].pop()
                self.assertTrue(validate(evidence, SHA))

    def test_missing_database_identity_and_66_countries(self):
        for key in ("editionId", "databaseFingerprint"):
            with self.subTest(key=key):
                evidence = complete()
                evidence["runIdentity"][key] = None
                self.assertTrue(validate(evidence, SHA))
        evidence = complete()
        evidence["seed"]["delegationCount"] = 65
        self.assertTrue(validate(evidence, SHA))

    def test_exact_final_database_composition_rejects_any_changed_count(self):
        # Mutation-test every canonical value, not only the delegation count.
        for name, expected in EXPECTED.items():
            for bad in (expected + 1, str(expected), True):
                with self.subTest(name=name, value=bad):
                    evidence = complete()
                    evidence["seed"][name] = bad
                    errors = validate(evidence, SHA)
                    self.assertTrue(any("invalid exact S14 final seed artifact" in error for error in errors),
                                    (name, bad, errors))

    def test_exact_final_database_composition_rejects_missing_or_extra_fields(self):
        for name in EXPECTED:
            with self.subTest(missing=name):
                evidence = complete()
                del evidence["seed"][name]
                self.assertTrue(validate(evidence, SHA))
        evidence = complete()
        evidence["seed"]["undocumented"] = 0
        self.assertTrue(validate(evidence, SHA))

    def test_seed_must_be_an_object_and_three_shows_exactly(self):
        for malformed in (None, [], "66", 66):
            with self.subTest(value=malformed):
                evidence = complete()
                evidence["seed"] = malformed
                self.assertTrue(validate(evidence, SHA))
        evidence = complete()
        evidence["seed"]["showCount"] = 4
        self.assertTrue(validate(evidence, SHA))

    def test_pending_or_unarchived(self):
        evidence = complete()
        evidence["pendingStages"] = ["stage-10-archive"]
        self.assertTrue(validate(evidence, SHA))
        evidence = complete()
        evidence["lifecycle"]["finalState"] = "results"
        self.assertTrue(validate(evidence, SHA))


if __name__ == "__main__":
    unittest.main()
