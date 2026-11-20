#!/usr/bin/env bash
# Solaris: read-only comparison of November 15 encrypted manifest object
# bucket IDs and object key sets against metadata-only 2026-11-20 hosted snapshot.
# Prints no object names, bucket names, media, private keys, or signed URLs.
set -Eeuo pipefail
umask 077
BASE="$HOME/solaris-recovery"
KEY="$BASE/recovery-private.key"
if ! command -v age >/dev/null 2>&1; then
  echo '[setup] Installing age following Cloud Shell restart'
  sudo apt-get update -qq && sudo apt-get install -y age || {
    echo 'STOP: cannot install age'; exit 1;
  }
fi
test -s "$KEY" || { echo 'STOP: age identity unavailable'; exit 1; }
ARCHIVE=$(find "$BASE" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
fi
test -s "$ARCHIVE" || { echo 'STOP: encrypted Storage backup not found'; exit 1; }

python3 - "$KEY" "$ARCHIVE" <<'PY'
import collections
import hashlib
import json
import subprocess
import sys
import tarfile

key, archive = sys.argv[1:]
# Derived only from bounded, read-only SQL over storage.buckets and
# storage.objects on 2026-11-20. Each key: SHA256(bucket ID) first 16 hex.
# Each value: (object count, SHA256(join("\n", sorted(SHA256(path) hex)))).
HOSTED = {
    "3cd69f7a19514465": (47, "24029e39da1a68d874c9a08534994aaa8fb248a29b38f91344f99f8dc8df7b08"),
    "8a47ec53ee41941d": (7, "c60525c3a4bb37db1b4f1cfb57a64cd871732282bf369322239913fea13a56b4"),
    "9874ed086020c7de": (54, "b276c92bbe78d77b1db5c3a01edb2f5a610b8ebc9ad8e95ab8f6114669cf4685"),
}
def sha_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

proc = subprocess.Popen(["age", "-d", "-i", key, archive],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
manifest = []
try:
    with tarfile.open(fileobj=proc.stdout, mode="r|*") as tf:
        for member in tf:
            if not member.isfile() or member.name.startswith("/") or ".." in member.name.split("/"):
                raise ValueError("unexpected archive member")
            if "manifest" in member.name.rsplit("/", 1)[-1].lower():
                if member.size > 5_000_000:
                    raise ValueError("manifest too large")
                inp = tf.extractfile(member)
                if inp is None:
                    raise ValueError("unreadable manifest")
                manifest.append(inp.read())
    proc.stdout.close()
    if proc.wait() != 0 or len(manifest) != 1:
        raise ValueError("archive decryption or manifest count failure")
    doc = json.loads(manifest[0])
    items = doc["files"]
    if not isinstance(items, list) or len(items) != 108:
        raise ValueError("unexpected manifest object count")
    per_bucket = collections.defaultdict(list)
    for item in items:
        bucket = item["bucket"]
        path = item["path"]
        if not isinstance(bucket, str) or not isinstance(path, str) or not bucket or not path:
            raise ValueError("invalid manifest record")
        per_bucket[sha_hex(bucket)[:16]].append(sha_hex(path))
    if len(per_bucket) != 3 or set(per_bucket) != set(HOSTED):
        print("FAIL: bucket identity set differs from production")
        sys.exit(1)
    complete = True
    print("Hosted baseline: 2026-11-20, metadata-only snapshot")
    for bucket_id in sorted(HOSTED):
        count, expected_digest = HOSTED[bucket_id]
        keys = sorted(per_bucket[bucket_id])
        digest = sha_hex("\n".join(keys))
        matched = len(keys) == count and digest == expected_digest
        print("Bucket fingerprint:", bucket_id, "| objects:", len(keys),
              "| exact object-key set:", "MATCH" if matched else "MISMATCH")
        complete = complete and matched
    if not complete:
        print("FAIL: bucket/object paths not yet fully reconciled")
        sys.exit(1)
    print("PASS: ALL 108 OBJECT BUCKETS AND KEYS MATCH THE HOSTED METADATA SNAPSHOT")
    print("Object byte SHA-256 parity separately established in previous check.")
    print("Production was not contacted by this script. No names or secrets displayed.")
except Exception as exc:
    if proc.poll() is None:
        proc.kill()
    proc.wait()
    print("STOP:", type(exc).__name__, "during local encrypted-manifest validation")
    sys.exit(1)
PY
