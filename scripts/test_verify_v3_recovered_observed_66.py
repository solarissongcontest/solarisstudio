"""Pure offline negative acceptance tests for recovered-observed evidence claims."""
import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-v3-recovered-observed-66.py")
spec = importlib.util.spec_from_file_location("recovered66", SCRIPT)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
SHA = "a" * 40
DB = "pg-control-verified-hosted-observed-db-0082"
OTHER = "pg-control-other-synthetic-restoration-0101"
FINGERPRINT = "recovery_operator_baseline:2026-11-14 10:00:00Z"
DIGEST = "b" * 64


def fixture():
    recovery = {
        "sourceSha": SHA, "postgresVersion": "17.11", "network": "none",
        "portsPublished": False,
        "recoveryOperator": {"role": "postgres", "superuser": False,
                             "bypassRls": True},
        "separateLocalRestoreVerified": True, "productionBackupVerified": False,
        "hostedEquivalenceCertified": False,
        "orderedStages": [
            {"order": i, "path": f"/tmp/local-candidate-{i}.sql",
             "sha256": DIGEST} for i in range(1, 8)
        ],
    }
    s14 = {
        "schemaVersion": 3, "candidateSha": SHA, "passed": True,
        "partial": False, "runtimeFailure": False,
        "seed": dict(verifier.FINAL_SEED_EXPECTED),
        "lifecycle": {"finalState": "archived"},
        "runIdentity": {"databaseFingerprint": FINGERPRINT,
                        "candidateSha": SHA, "editionId": "14000000-0000-4000-8000-000000000001"},
        "pendingStages": [], "pendingContestExtensions": [], "blockedContestExtensions": [],
        "implementedInvariants": sorted(verifier.S14_INVARIANTS),
        "implementedFailureInjections": sorted(verifier.S14_FAILURES),
        "completedStages": [s for s in verifier.STAGES
                            if not s.startswith("grand-final-")],
        "completedContestExtensions": [s for s in verifier.STAGES
                                       if s.startswith("grand-final-")],
    }
    browser = {"candidateSha": SHA, "recoveredDatabaseIdentity": DB,
               "passed": True,
               "stats": {"expected": 1, "skipped": 0, "unexpected": 0, "flaky": 0}}
    artifacts = {
        "observed-owner-recovery-proof.json": recovery,
        "s14-full-contest.json": s14,
        "playwright-s14-grand-final-summary.json": browser,
        "playwright-s14-grand-final-results-summary.json": copy.deepcopy(browser),
    }
    manifest = {
        "schemaVersion": 1, "kind": "recovered-observed",
        "candidateSha": SHA, "passed": True,
        "execution": {
            "dbOrigin": "observed-pg17.11-recovered", "network": "none",
            "publishedPorts": 0, "hostedConnections": 0,
            "apiUrl": "http://127.0.0.1:54321", "sourceSha": SHA,
            "dbResetAfterRecovery": False,
            "sameRecoveredDatabaseForAllStages": True,
        },
        "database": {
            "identity": DB, "fingerprint": FINGERPRINT,
            "serverVersion": "17.11",
            "schemaOrigin": "observed-recovery",
            "syntheticRestoreOnly": False, "observedCatalogDigest": DIGEST,
        },
        "runtimeProbes": [
            {"kind": k, "databaseIdentity": DB, "sourceSha": SHA,
             "result": "pass"} for k in ("direct-sql", "api", "browser")
        ],
        "stages": [
            {"id": s, "result": "pass", "databaseIdentity": DB,
             "sourceSha": SHA, "recoveredSchema": True}
            for s in verifier.STAGES
        ],
        "negativeScenarios": [
            {"id": s, "result": "pass", "databaseIdentity": DB,
             "sourceSha": SHA}
            for s in verifier.NEGATIVE_SCENARIOS
        ],
        "separateSyntheticRestore": {
            "result": "pass", "databaseIdentity": OTHER, "sourceSha": SHA
        },
        "finalState": "archived",
        "productionBackupVerified": False, "productionMutation": False,
        "hostedEquivalenceCertified": False, "artifacts": [],
    }
    retry = next(s for s in manifest["negativeScenarios"]
                 if s["id"] == "failed-stage-same-db-retry")
    retry.update(beforeDatabaseIdentity=DB, afterDatabaseIdentity=DB,
                 failedAttemptObserved=True, retryCompleted=True)
    for case in manifest["negativeScenarios"]:
        if case["id"] in ("wrong-show-denial", "unpublished-televote-secrecy"):
            case.update(readbackConfirmed=True, readbackDatabaseIdentity=DB,
                        beforeStateHash=DIGEST, afterStateHash=DIGEST)
            if case["id"] == "wrong-show-denial":
                case["writeRejected"] = True
            else:
                case.update(publicReadAttempted=True, publicBallotRevealed=False,
                            publicTotalsRevealed=False)
    return manifest, artifacts


def save(root, manifest, artifacts):
    manifest["artifacts"] = []
    for name, value in artifacts.items():
        content = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
        (root / name).write_bytes(content)
        manifest["artifacts"].append({
            "name": name, "sha256": hashlib.sha256(content).hexdigest()
        })


class RecoveryEvidenceGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.manifest, self.artifacts = fixture()
        save(self.root, self.manifest, self.artifacts)

    def assertRejects(self, fragment):
        with self.assertRaises(verifier.EvidenceError) as caught:
            verifier.verify(self.manifest, self.root, SHA)
        self.assertIn(fragment, str(caught.exception))

    def test_full_structural_fixture_passes(self):
        self.assertTrue(verifier.verify(self.manifest, self.root, SHA))

    def test_clean_source_substitution_rejected(self):
        self.manifest["kind"] = "clean-source"
        self.assertRejects("separate")

    def test_clean_source_evidence_must_not_mix(self):
        self.manifest["cleanSourceEvidence"] = {"passed": True}
        self.assertRejects("mixed")

    def test_wrong_source_sha_rejected(self):
        self.manifest["candidateSha"] = "f" * 40
        self.assertRejects("SHA mismatch")

    def test_database_reset_rejected(self):
        self.manifest["execution"]["dbResetAfterRecovery"] = True
        self.assertRejects("reset")

    def test_non_local_api_rejected(self):
        self.manifest["execution"]["apiUrl"] = "https://example.supabase.co"
        self.assertRejects("loopback")

    def test_port_exposure_rejected(self):
        self.manifest["execution"]["publishedPorts"] = 5432
        self.assertRejects("published ports")

    def test_api_different_database_rejected(self):
        self.manifest["runtimeProbes"][1]["databaseIdentity"] = OTHER
        self.assertRejects("different database")

    def test_browser_different_database_rejected(self):
        self.manifest["runtimeProbes"][2]["databaseIdentity"] = OTHER
        self.assertRejects("different database")

    def test_wrong_version_rejected(self):
        self.manifest["database"]["serverVersion"] = "17.6"
        self.assertRejects("PG17.11")

    def test_no_recovered_fixture_rejected(self):
        self.manifest["execution"]["dbOrigin"] = "clean-source"
        self.assertRejects("wrong fixture origin")

    def test_missing_grand_final_stage_rejected(self):
        self.manifest["stages"].pop(11)
        self.assertRejects("14 ordered")

    def test_stage_different_db_rejected(self):
        self.manifest["stages"][5]["databaseIdentity"] = OTHER
        self.assertRejects("stage changed")

    def test_changed_vote_cas_cannot_be_omitted(self):
        self.manifest["negativeScenarios"].pop(2)
        self.assertRejects("negative acceptance")

    def test_failed_stage_retry_requires_same_db(self):
        self.manifest["negativeScenarios"][4]["afterDatabaseIdentity"] = OTHER
        self.assertRejects("same recovered database")

    def test_retry_must_observe_failure(self):
        self.manifest["negativeScenarios"][4]["failedAttemptObserved"] = False
        self.assertRejects("both observed failure")

    def test_synthetic_restore_is_separate(self):
        self.manifest["separateSyntheticRestore"]["databaseIdentity"] = DB
        self.assertRejects("may not masquerade")

    def test_production_certification_unavailable(self):
        self.manifest["productionBackupVerified"] = True
        self.assertRejects("production backup")

    def test_artifact_hash_mismatch_rejected(self):
        path = self.root / "s14-full-contest.json"
        path.write_bytes(path.read_bytes() + b"tampering")
        self.assertRejects("checksum mismatch")

    def test_s14_clean_database_fingerprint_rejected(self):
        self.artifacts["s14-full-contest.json"]["runIdentity"][
            "databaseFingerprint"] = "another-db:boot"
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("S14 evidence originated")

    def test_browser_artifact_without_recovered_db_proof_rejected(self):
        self.artifacts["playwright-s14-grand-final-summary.json"].pop(
            "recoveredDatabaseIdentity")
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("browser summary did not prove")

    def test_recovery_proof_requires_seven_stages(self):
        self.artifacts["observed-owner-recovery-proof.json"][
            "orderedStages"].pop()
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("seven ordered")

    def test_missing_artifact_rejected(self):
        self.manifest["artifacts"].pop()
        self.assertRejects("missing mandatory artifacts")

    def test_external_file_path_rejected(self):
        self.manifest["artifacts"][0]["name"] = "../../home/.env"
        self.assertRejects("unrecognized artifact name")

    def test_json_output_gate_fail_closed(self):
        self.manifest["passed"] = None
        self.assertRejects("affirmative PASS")

    def test_s14_missing_mandatory_invariant_rejected(self):
        self.artifacts["s14-full-contest.json"]["implementedInvariants"].pop()
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("S14 missing mandatory implementedInvariants")

    def test_s14_missing_failure_injection_rejected(self):
        self.artifacts["s14-full-contest.json"]["implementedFailureInjections"].pop()
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("S14 missing mandatory implementedFailureInjections")

    def test_s14_pending_phase_rejected(self):
        self.artifacts["s14-full-contest.json"]["pendingStages"] = ["stage-10-archive"]
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("S14 has pending or blocked")

    def test_s14_missing_edition_identity_rejected(self):
        self.artifacts["s14-full-contest.json"]["runIdentity"]["editionId"] = ""
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("different local database or edition")

    def test_s14_runtime_failure_rejected(self):
        self.artifacts["s14-full-contest.json"]["runtimeFailure"] = True
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("not exact-SHA complete PASS")

    def test_s14_insufficient_show_count_rejected(self):
        self.artifacts["s14-full-contest.json"]["seed"]["showCount"] = 2
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("S14 final-seed artifact invalid")

    def test_browser_skipped_test_rejected(self):
        self.artifacts["playwright-s14-grand-final-summary.json"]["stats"]["skipped"] = 1
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("skipped/failed/flaky")

    def test_browser_no_tests_rejected(self):
        self.artifacts["playwright-s14-grand-final-summary.json"]["stats"]["expected"] = 0
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("zero tests")

    def test_browser_flaky_test_rejected(self):
        self.artifacts["playwright-s14-grand-final-summary.json"]["stats"]["flaky"] = 1
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("skipped/failed/flaky")

    def test_production_mutation_rejected(self):
        self.manifest["productionMutation"] = True
        self.assertRejects("production mutation")

    def test_all_canonical_seed_counts_reject_drift(self):
        for name, expected in verifier.FINAL_SEED_EXPECTED.items():
            with self.subTest(field=name):
                changed = dict(verifier.FINAL_SEED_EXPECTED)
                changed[name] = expected + 1
                self.artifacts["s14-full-contest.json"]["seed"] = changed
                save(self.root, self.manifest, self.artifacts)
                self.assertRejects("S14 final-seed artifact invalid")

    def test_canonical_seed_missing_and_extra_fields_rejected(self):
        for variant in ("missing", "extra"):
            with self.subTest(variant=variant):
                changed = dict(verifier.FINAL_SEED_EXPECTED)
                if variant == "missing":
                    changed.pop("participantCount")
                else:
                    changed["unsupportedExtraCount"] = 1
                self.artifacts["s14-full-contest.json"]["seed"] = changed
                save(self.root, self.manifest, self.artifacts)
                self.assertRejects("S14 final-seed artifact invalid")

    def test_canonical_seed_boolean_or_float_rejected(self):
        for value in (True, 66.0):
            with self.subTest(value=value):
                changed = dict(verifier.FINAL_SEED_EXPECTED)
                changed["delegationCount"] = value
                self.artifacts["s14-full-contest.json"]["seed"] = changed
                save(self.root, self.manifest, self.artifacts)
                self.assertRejects("S14 final-seed artifact invalid")

    def test_wrong_show_denial_mandatory(self):
        self.manifest["negativeScenarios"] = [
            x for x in self.manifest["negativeScenarios"] if x["id"] != "wrong-show-denial"]
        self.assertRejects("negative acceptance scenarios")

    def test_unpublished_televote_secrecy_mandatory(self):
        self.manifest["negativeScenarios"] = [
            x for x in self.manifest["negativeScenarios"]
            if x["id"] != "unpublished-televote-secrecy"]
        self.assertRejects("negative acceptance scenarios")

    def test_wrong_show_denial_requires_rejected_write(self):
        self.manifest["negativeScenarios"][-2]["writeRejected"] = False
        self.assertRejects("wrong-show write was not rejected")

    def test_wrong_show_denial_requires_same_database_readback(self):
        self.manifest["negativeScenarios"][-2]["readbackDatabaseIdentity"] = OTHER
        self.assertRejects("same recovered database readback")

    def test_wrong_show_denial_requires_unchanged_state_hash(self):
        self.manifest["negativeScenarios"][-2]["afterStateHash"] = "c" * 64
        self.assertRejects("negative case state changed")

    def test_televote_secrecy_requires_actual_read_attempt(self):
        self.manifest["negativeScenarios"][-1]["publicReadAttempted"] = False
        self.assertRejects("unpublished Televote data was not proven private")

    def test_televote_secrecy_refuses_public_ballot_read(self):
        self.manifest["negativeScenarios"][-1]["publicBallotRevealed"] = True
        self.assertRejects("unpublished Televote data was not proven private")

    def test_televote_secrecy_refuses_public_totals_read(self):
        self.manifest["negativeScenarios"][-1]["publicTotalsRevealed"] = True
        self.assertRejects("unpublished Televote data was not proven private")

    def test_televote_secrecy_requires_unchanged_state(self):
        self.manifest["negativeScenarios"][-1]["afterStateHash"] = "c" * 64
        self.assertRejects("negative case state changed")

    def test_browser_expected_count_cannot_be_boolean(self):
        self.artifacts["playwright-s14-grand-final-summary.json"]["stats"]["expected"] = True
        save(self.root, self.manifest, self.artifacts)
        self.assertRejects("zero tests")

    def test_direct_cli_runs_without_pythonpath_override(self):
        manifest_path = self.root / "evidence.json"
        manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "--evidence", str(manifest_path),
             "--artifacts-dir", str(self.root), "--sha", SHA],
            cwd=SCRIPT.parent.parent, capture_output=True, text=True, check=False)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("EVIDENCE CONTRACT PASS", process.stdout)

    def test_direct_cli_fails_closed_when_artifact_tampered(self):
        manifest_path = self.root / "evidence.json"
        manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        artifact_path = self.root / "s14-full-contest.json"
        artifact_path.write_bytes(artifact_path.read_bytes() + b"unauthorized change")
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "--evidence", str(manifest_path),
             "--artifacts-dir", str(self.root), "--sha", SHA],
            cwd=SCRIPT.parent.parent, capture_output=True, text=True, check=False)
        self.assertEqual(process.returncode, 1)
        self.assertIn("FAIL CLOSED", process.stderr)
        self.assertIn("checksum mismatch", process.stderr)


if __name__ == "__main__":
    unittest.main()
