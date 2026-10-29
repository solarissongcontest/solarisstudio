#!/usr/bin/env python3
"""Fail closed when the recipient projection exposes operation/ballot internals."""
import json
import sys

FORBIDDEN = {
    "request_hash", "request_fingerprint", "ballot_submission_id",
    "target_country_id", "rankings", "idempotency_key",
}


def safe(value):
    if isinstance(value, dict):
        return not FORBIDDEN.intersection(value) and all(safe(item) for item in value.values())
    if isinstance(value, list):
        return all(safe(item) for item in value)
    return True


try:
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list) or not safe(payload):
        raise ValueError("invalid recipient projection")
except (ValueError, TypeError):
    sys.exit("Activity response is invalid or exposes ballot/operation internals")
