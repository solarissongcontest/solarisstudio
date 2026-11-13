#!/usr/bin/env python3
"""Fail-closed validation of a single, persistent S14 contest rehearsal artifact.

This is evidence validation, not a replacement for the database-backed S14 driver.
"""
import argparse
import json
import re
import sys
from pathlib import Path

STAGES = [
    "stage-1-setup", "stage-2-delegation-onboarding", "stage-3-confirmations",
    "stage-4-entries", "stage-5-running-orders", "stage-6-jury",
    "stage-7-public-voting", "stage-8-results", "stage-9-publication",
    "stage-10-archive",
]
EXTENSIONS = [
    "grand-final-qualifier-bridge", "grand-final-voting",
    "grand-final-results", "grand-final-publication",
]
INVARIANTS = {
    "confirmation-no-effective-duplicates", "entry-valid-revision",
    "media-accepted-revision", "jury-single-final-ballot",
    "televote-canonical-ballot", "result-reproducible",
    "publication-final-version", "tasks-canonical", "notifications-reconcilable",
}
FAILURES = {
    "network-after-commit", "db-timeout-before-commit", "duplicate-request",
    "worker-crash", "realtime-disconnect", "stale-client",
    "two-organizers", "supabase-outage",
}


def validate(evidence, sha):
    errors = []
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        errors.append("candidate SHA is not a lowercase 40-character Git SHA")
    if evidence.get("candidateSha") != sha:
        errors.append("candidate SHA mismatch")
    for key, value in (("passed", True), ("partial", False), ("runtimeFailure", False)):
        if evidence.get(key) is not value:
            errors.append(f"{key} must be {value}")
    for key, expected in (("completedStages", STAGES), ("completedContestExtensions", EXTENSIONS)):
        if evidence.get(key) != expected:
            errors.append(f"{key} must exactly match complete ordered lifecycle")
    for key in ("pendingStages", "pendingContestExtensions", "blockedContestExtensions"):
        if evidence.get(key) != []:
            errors.append(f"{key} must be empty")
    for key, expected in (("implementedInvariants", INVARIANTS), ("implementedFailureInjections", FAILURES)):
        actual = evidence.get(key)
        if not isinstance(actual, list) or not expected.issubset(set(map(str, actual))):
            errors.append(f"{key} missing mandatory checks: {sorted(expected - set(map(str, actual or [])))}")
    seed = evidence.get("seed")
    if not isinstance(seed, dict) or seed.get("editionCount") != 1 or seed.get("delegationCount") != 66 or seed.get("showCount", 0) < 3:
        errors.append("synthetic seed must include exactly 1 edition, 66 delegations and >=3 shows")
    identity = evidence.get("runIdentity")
    if not isinstance(identity, dict) or identity.get("candidateSha") != sha or not identity.get("editionId") or not identity.get("databaseFingerprint"):
        errors.append("missing same-contest identity and database fingerprint")
    if evidence.get("lifecycle", {}).get("finalState") != "archived":
        errors.append("final edition state must be archived")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--browser-summary", type=Path, action="append", default=[])
    args = parser.parse_args()
    if not args.evidence.is_file():
        parser.error(f"required evidence missing: {args.evidence}")
    try:
        evidence = json.loads(args.evidence.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        parser.error(f"invalid evidence: {exc}")
    errors = validate(evidence, args.sha)
    for path in args.browser_summary:
        if not path.is_file():
            errors.append(f"required browser summary missing: {path}")
            continue
        try:
            summary = json.loads(path.read_text(encoding="utf-8"))
            stats = summary["stats"]
            if (stats.get("expected", 0) < 1 or stats.get("skipped", 0) != 0
                    or stats.get("unexpected", 0) != 0 or stats.get("flaky", 0) != 0):
                errors.append(f"browser summary contains no passing tests or skipped/failed/flaky tests: {path}")
        except (ValueError, OSError, KeyError, TypeError, AttributeError) as exc:
            errors.append(f"invalid browser summary {path}: {exc}")
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: complete 66-delegation stateful S14 evidence at {args.sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
