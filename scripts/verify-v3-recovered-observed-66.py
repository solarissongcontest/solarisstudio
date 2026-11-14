#!/usr/bin/env python3
"""Fail-closed OFFLINE evidence-consistency gate for recovered-observed PG17.11.

This checker cannot attest to the truth of its input: evidence must be emitted by
independent, real SQL, local API and browser probes against one recovered DB.
Passing this contract is NOT a live 66-country rehearsal or release certification.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

SHA40 = re.compile(r"[a-f0-9]{40}\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
LOCAL_URL = re.compile(r"http://(?:127\.0\.0\.1|localhost):[0-9]{2,5}/?\Z")
STAGES = [
    "stage-1-setup",
    "stage-2-delegation-onboarding",
    "stage-3-confirmations",
    "stage-4-entries",
    "stage-5-running-orders",
    "stage-6-jury",
    "stage-7-public-voting",
    "stage-8-results",
    "stage-9-publication",
    "grand-final-qualifier-bridge",
    "grand-final-voting",
    "grand-final-results",
    "grand-final-publication",
    "stage-10-archive",
]
NEGATIVE_SCENARIOS = [
    "account-switch-denial",
    "wrong-edition-denial",
    "changed-vote-results-cas-conflict",
    "frozen-result-publication-version",
    "failed-stage-same-db-retry",
    "duplicate-idempotent-request",
    "unpublished-jury-secrecy",
    "legacy-client-compatibility",
    "cross-role-denial",
    "concurrent-operation-conflict",
]
REQUIRED_ARTIFACTS = {
    "observed-owner-recovery-proof.json",
    "s14-full-contest.json",
    "playwright-s14-grand-final-summary.json",
    "playwright-s14-grand-final-results-summary.json",
}


class EvidenceError(ValueError):
    """Evidence absent, inconsistent, or unsafe."""


def require(test, message):
    if not test:
        raise EvidenceError(message)


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def artifact_files(manifest, root):
    seen = set()
    found = {}
    descriptors = manifest.get("artifacts")
    require(isinstance(descriptors, list), "artifacts must be a list")
    for item in descriptors:
        require(isinstance(item, dict), "artifact descriptor must be an object")
        name, expected = item.get("name"), item.get("sha256")
        require(isinstance(name, str) and name in REQUIRED_ARTIFACTS,
                "unrecognized artifact name")
        require(name not in seen, "duplicate artifact name: " + name)
        require(isinstance(expected, str) and SHA256.fullmatch(expected),
                "artifact has no valid SHA256: " + name)
        seen.add(name)
        path = root / name
        require(path.is_file() and not path.is_symlink(),
                "artifact absent or symlink: " + name)
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        require(actual == expected, "artifact checksum mismatch: " + name)
        found[name] = load_json(path)
        require(isinstance(found[name], dict), "artifact JSON must be an object: " + name)
    require(seen == REQUIRED_ARTIFACTS,
            "missing mandatory artifacts: " + ", ".join(sorted(REQUIRED_ARTIFACTS - seen)))
    return found


def verify(manifest, root, expected_sha):
    require(isinstance(manifest, dict), "manifest must be an object")
    require(manifest.get("schemaVersion") == 1, "unsupported evidence schemaVersion")
    require(manifest.get("kind") == "recovered-observed",
            "clean-source and recovered-observed evidence must remain separate")
    require(manifest.get("passed") is True, "recovered-observed run has no affirmative PASS")
    require("cleanSourceEvidence" not in manifest,
            "clean-source evidence cannot be mixed into recovered-observed evidence")
    require(isinstance(expected_sha, str) and SHA40.fullmatch(expected_sha),
            "expected candidate SHA is invalid")
    require(manifest.get("candidateSha") == expected_sha, "manifest candidate SHA mismatch")

    execution = manifest.get("execution")
    require(isinstance(execution, dict), "missing execution evidence")
    require(execution.get("dbOrigin") == "observed-pg17.11-recovered",
            "wrong fixture origin; clean-source cannot substitute")
    require(execution.get("network") == "none", "recovered runtime must be networkless")
    require(execution.get("publishedPorts") == 0,
            "recovered runtime published ports")
    require(execution.get("hostedConnections") == 0,
            "hosted database connections are prohibited")
    require(isinstance(execution.get("apiUrl"), str) and
            LOCAL_URL.fullmatch(execution["apiUrl"]), "API URL must be literal loopback")
    require(execution.get("sourceSha") == expected_sha, "runtime source SHA mismatch")
    require(execution.get("dbResetAfterRecovery") is False,
            "database was reset after recovery")
    require(execution.get("sameRecoveredDatabaseForAllStages") is True,
            "single recovered database not affirmed")

    db = manifest.get("database")
    require(isinstance(db, dict), "missing database evidence")
    identity, fingerprint = db.get("identity"), db.get("fingerprint")
    require(isinstance(identity, str) and len(identity) >= 16,
            "missing stable recovered database identity")
    require(isinstance(fingerprint, str) and len(fingerprint) >= 16,
            "missing recovered database session fingerprint")
    require(db.get("serverVersion") == "17.11", "database version must be PG17.11")
    require(db.get("schemaOrigin") == "observed-recovery",
            "database schema is not the observed restored schema")
    require(db.get("syntheticRestoreOnly") is False,
            "synthetic restore cannot be the contest database")
    require(isinstance(db.get("observedCatalogDigest"), str) and
            SHA256.fullmatch(db["observedCatalogDigest"]),
            "missing observed catalog digest")

    probes = manifest.get("runtimeProbes")
    require(isinstance(probes, list) and len(probes) == 3,
            "three independent DB, API and browser target probes required")
    require(all(isinstance(p, dict) for p in probes) and
            [p.get("kind") for p in probes] == ["direct-sql", "api", "browser"],
            "missing SQL/API/browser connection proof")
    for p in probes:
        require(p.get("databaseIdentity") == identity,
                "SQL/API/browser used different database identity")
        require(p.get("sourceSha") == expected_sha,
                "SQL/API/browser source SHA mismatch")
        require(p.get("result") == "pass", "SQL/API/browser target probe did not pass")

    stages = manifest.get("stages")
    require(isinstance(stages, list) and all(isinstance(s, dict) for s in stages) and
            [s.get("id") for s in stages] == STAGES,
            "all 14 ordered lifecycle/Grand Final stages must be present")
    for stage in stages:
        require(stage.get("result") == "pass",
                "lifecycle stage failed: " + stage["id"])
        require(stage.get("databaseIdentity") == identity,
                "lifecycle stage changed recovered database: " + stage["id"])
        require(stage.get("sourceSha") == expected_sha,
                "lifecycle stage source SHA mismatch")
        require(stage.get("recoveredSchema") is True,
                "stage used unproven schema: " + stage["id"])

    negatives = manifest.get("negativeScenarios")
    require(isinstance(negatives, list) and all(isinstance(n, dict) for n in negatives) and
            [n.get("id") for n in negatives] == NEGATIVE_SCENARIOS,
            "all ordered negative acceptance scenarios are mandatory")
    for case in negatives:
        require(case.get("result") == "pass",
                "negative test failed: " + case["id"])
        require(case.get("databaseIdentity") == identity,
                "negative test used another database: " + case["id"])
        require(case.get("sourceSha") == expected_sha,
                "negative test used another source SHA")
    retry = negatives[NEGATIVE_SCENARIOS.index("failed-stage-same-db-retry")]
    require(retry.get("beforeDatabaseIdentity") == identity and
            retry.get("afterDatabaseIdentity") == identity,
            "recovery retry did not use the same recovered database")
    require(retry.get("failedAttemptObserved") is True and retry.get("retryCompleted") is True,
            "recovery retry requires both observed failure and subsequent success")

    restore = manifest.get("separateSyntheticRestore")
    require(isinstance(restore, dict), "synthetic restore evidence missing")
    require(restore.get("result") == "pass",
            "separate synthetic restore evidence missing")
    require(isinstance(restore.get("databaseIdentity"), str) and
            len(restore["databaseIdentity"]) >= 16 and
            restore["databaseIdentity"] != identity,
            "synthetic restore may not masquerade as contest database")
    require(restore.get("sourceSha") == expected_sha,
            "synthetic restore source SHA mismatch")
    require(manifest.get("finalState") == "archived",
            "contest did not finish in canonical Archive")
    require(manifest.get("productionBackupVerified") is False,
            "synthetic evidence cannot certify production backup")
    require(manifest.get("productionMutation") is False,
            "production mutation is prohibited")
    require(manifest.get("hostedEquivalenceCertified") is False,
            "incomplete observed fixture may not certify hosted equivalence")

    artifacts = artifact_files(manifest, root)
    recovery = artifacts["observed-owner-recovery-proof.json"]
    require(recovery.get("sourceSha") == expected_sha,
            "recovery-proof source SHA mismatch")
    require(recovery.get("postgresVersion") == "17.11",
            "recovery proof must be PG17.11")
    require(recovery.get("network") == "none" and
            recovery.get("portsPublished") is False,
            "recovery proof exposed network")
    require(recovery.get("recoveryOperator", {}).get("superuser") is False,
            "recovery proof used superuser operator")
    require(recovery.get("separateLocalRestoreVerified") is True,
            "separate local restore not demonstrated")
    require(recovery.get("productionBackupVerified") is False and
            recovery.get("hostedEquivalenceCertified") is False,
            "unwarranted production certification in recovery proof")
    ordered = recovery.get("orderedStages")
    require(isinstance(ordered, list) and len(ordered) == 7 and
            all(isinstance(x, dict) for x in ordered) and
            [x.get("order") for x in ordered] == list(range(1, 8)),
            "exactly seven ordered PG17.11 recovery stages expected")
    require(all(isinstance(x.get("sha256"), str) and SHA256.fullmatch(x["sha256"])
                for x in ordered), "recovery stage has missing SQL hash")

    s14 = artifacts["s14-full-contest.json"]
    require(s14.get("candidateSha") == expected_sha and
            s14.get("passed") is True and s14.get("partial") is False,
            "S14 result is not exact-SHA complete PASS")
    require(s14.get("seed", {}).get("delegationCount") == 66,
            "S14 seed is not 66 delegations")
    require(s14.get("lifecycle", {}).get("finalState") == "archived",
            "S14 state not archived")
    require(s14.get("runIdentity", {}).get("databaseFingerprint") == fingerprint,
            "S14 evidence originated from a different local database")
    expected_stages = [x for x in STAGES if not x.startswith("grand-final-")]
    expected_extensions = [x for x in STAGES if x.startswith("grand-final-")]
    require(s14.get("completedStages") == expected_stages and
            s14.get("completedContestExtensions") == expected_extensions,
            "S14 complete-stage evidence missing or out of order")
    for name in ("playwright-s14-grand-final-summary.json",
                 "playwright-s14-grand-final-results-summary.json"):
        browser = artifacts[name]
        require(browser.get("candidateSha") == expected_sha,
                "browser summary candidate SHA mismatch: " + name)
        require(browser.get("recoveredDatabaseIdentity") == identity,
                "browser summary did not prove recovered DB target: " + name)
        require(browser.get("passed") is True,
                "browser summary failed: " + name)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--artifacts-dir", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    args = parser.parse_args(argv)
    try:
        require(args.evidence.is_file() and not args.evidence.is_symlink(),
                "missing evidence file")
        verify(load_json(args.evidence), args.artifacts_dir.resolve(), args.sha)
    except (EvidenceError, ValueError, KeyError, TypeError, OSError,
            json.JSONDecodeError) as exc:
        print("RECOVERED-OBSERVED 66-COUNTRY: FAIL CLOSED: " + str(exc),
              file=sys.stderr)
        return 1
    print("RECOVERED-OBSERVED 66-COUNTRY: EVIDENCE CONTRACT PASS (not production certification)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
