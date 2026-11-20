#!/usr/bin/env bash
# Read-only bucket identity summary from privately encrypted 15-Nov Storage backup.
# Prints SHA-256 bucket-ID prefixes + per-bucket object counts only; no paths,
# object contents, bucket names, or cryptographic secrets are ever printed.
set -Eeuo pipefail
umask 077
B="$HOME/solaris-recovery"
K="$B/recovery-private.key"
test -s "$K" || { echo "STOP: private age identity unavailable"; exit 1; }
if ! command -v age >/dev/null 2>&1; then
  echo "[setup] Installing missing age package"
  sudo apt-get update -qq && sudo apt-get install -y age || {
    echo "STOP: cannot install age"; exit 1;
  }
fi
test -x "$(command -v age)" || { echo "STOP: age unavailable"; exit 1; }
ST=$(find "$B" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$ST" ]; then
  ST=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
fi
test -s "$ST" || { echo "STOP: expected encrypted November 15 Storage backup not found"; exit 1; }
python3 - "$K" "$ST" <<'PY'
import collections
import hashlib
import json
import subprocess
import sys
import tarfile

key, archive = sys.argv[1:]
p = subprocess.Popen(["age", "-d", "-i", key, archive],
                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
manifests = []
try:
    with tarfile.open(fileobj=p.stdout, mode="r|*") as tf:
        for member in tf:
            name = member.name
            if not member.isfile() or name.startswith("/") or ".." in name.split("/"):
                raise ValueError("unsafe TAR entry")
            if "manifest" in name.rsplit("/", 1)[-1].lower():
                if member.size > 5_000_000:
                    raise ValueError("manifest exceeds safety limit")
                f = tf.extractfile(member)
                if f is None:
                    raise ValueError("unreadable manifest")
                manifests.append(f.read())
    p.stdout.close()
    if p.wait() != 0:
        raise ValueError("age archive decryption did not complete")
    if len(manifests) != 1:
        raise ValueError("archive does not have exactly one manifest")
    doc = json.loads(manifests[0])
    rows = doc["files"]
    if not isinstance(rows, list):
        raise ValueError("manifest files not a list")
    counts = collections.Counter()
    for row in rows:
        bucket = row["bucket"]
        if not isinstance(bucket, str) or not bucket:
            raise ValueError("invalid bucket ID in manifest")
        counts[bucket] += 1
    if len(rows) != 108 or len(counts) != 3:
        raise ValueError("unexpected record or bucket count")
    print("Nov 15 archived objects:", len(rows))
    print("Nov 15 archived populated buckets:", len(counts))
    for name, count in sorted(counts.items(), key=lambda p: hashlib.sha256(p[0].encode()).hexdigest()):
        fingerprint = hashlib.sha256(name.encode("utf-8")).hexdigest()[:16]
        print("bucket hash prefix:", fingerprint, "object count:", count)
    print("READ-ONLY BUCKET IDENTITY SUMMARY COMPLETE")
    print("No bucket names, object paths, keys or media bytes were printed.")
except Exception as exc:
    if p.poll() is None:
        p.kill()
    p.wait()
    print("STOP:", type(exc).__name__, "during private archive inspection")
    sys.exit(1)
PY
