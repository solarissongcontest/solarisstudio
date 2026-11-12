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
}


def validate_final_seed(raw_counts):
    if len(raw_counts) != len(EXPECTED):
        raise ValueError("S14 final-seed proof needs exactly thirteen database counts")
    actual = {}
    for (name, expected), raw in zip(EXPECTED.items(), raw_counts):
        if not isinstance(raw, str) or re.fullmatch(r"(?:0|[1-9][0-9]*)", raw) is None:
            raise ValueError(f"S14 final-seed {name} is not a canonical nonnegative count")
        actual[name] = int(raw)
        if actual[name] != expected:
            raise ValueError(f"S14 final-seed {name} drift: expected {expected}, actual {actual[name]}")
    return actual


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
