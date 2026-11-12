#!/usr/bin/env python3
"""Validate final S14 contest seed counts before emitting release evidence.

Pure, offline proof: the caller supplies counts read from its *disposable local*
contest database. This module never connects to a database or network itself.
"""
import json
import re
import sys

EXPECTED = {
    "editionCount": 1,
    "delegationCount": 66,
    "showCount": 3,
    "participantCount": 88,
    "activeHodDelegationCount": 66,
    "semiOneAppearanceCount": 33,
    "semiTwoAppearanceCount": 33,
    "grandFinalAppearanceCount": 20,
    "editionEntryCount": 2,
    "expectedSyncedEditionEntryCount": 2,
    "distinctParticipantCountryCount": 66,
    "duplicateAppearanceGroupCount": 0,
    "nullCountryCount": 0,
    "semiFinalCountrySetMismatchCount": 0,
}


def validate_final_seed(raw_counts):
    if len(raw_counts) != len(EXPECTED):
        raise ValueError(f"S14 final-seed proof needs exactly {len(EXPECTED)} database counts")
    actual = {}
    for (name, expected), raw in zip(EXPECTED.items(), raw_counts):
        if not isinstance(raw, str) or re.fullmatch(r"(?:0|[1-9][0-9]*)", raw) is None:
            raise ValueError(f"S14 final-seed {name} is not a canonical nonnegative count")
        actual[name] = int(raw)
        if actual[name] != expected:
            raise ValueError(f"S14 final-seed {name} drift: expected {expected}, actual {actual[name]}")
    return actual


def validate_final_seed_artifact(seed):
    """Independently verify the persisted JSON evidence's exact seed contract."""
    if type(seed) is not dict:
        raise ValueError("S14 final-seed artifact must be a JSON object")
    if set(seed) != set(EXPECTED):
        raise ValueError(
            "S14 final-seed artifact field mismatch: "
            f"missing={sorted(set(EXPECTED) - set(seed))}, "
            f"unexpected={sorted(set(seed) - set(EXPECTED))}"
        )
    for name, expected in EXPECTED.items():
        value = seed[name]
        if type(value) is not int or value != expected:
            raise ValueError(
                f"S14 final-seed artifact {name} drift: expected integer {expected}, "
                f"actual {value!r}"
            )
    return seed


def main(argv):
    try:
        proof = validate_final_seed(argv)
    except ValueError as exc:
        print(f"S14 final-seed proof BLOCKED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(proof, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
