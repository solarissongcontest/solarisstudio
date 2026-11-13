import unittest
from scripts.verify_v3_release_acceptance_evidence import validate, STAGES, EXTENSIONS, INVARIANTS, FAILURES

SHA = "a" * 40


def complete():
    return {
        "candidateSha": SHA, "passed": True, "partial": False, "runtimeFailure": False,
        "completedStages": STAGES[:], "completedContestExtensions": EXTENSIONS[:],
        "pendingStages": [], "pendingContestExtensions": [], "blockedContestExtensions": [],
        "implementedInvariants": sorted(INVARIANTS),
        "implementedFailureInjections": sorted(FAILURES),
        "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
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

    def test_pending_or_unarchived(self):
        evidence = complete()
        evidence["pendingStages"] = ["stage-10-archive"]
        self.assertTrue(validate(evidence, SHA))
        evidence = complete()
        evidence["lifecycle"]["finalState"] = "results"
        self.assertTrue(validate(evidence, SHA))


if __name__ == "__main__":
    unittest.main()
