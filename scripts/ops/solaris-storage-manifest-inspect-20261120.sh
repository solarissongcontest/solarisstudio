#!/usr/bin/env bash
# Read-only inspection of November 15 encrypted Storage TAR format.
# Never contacts production, reveals filenames/keys, or extracts media to disk.
set -Eeuo pipefail
umask 077
B="$HOME/solaris-recovery"
KEY="$B/recovery-private.key"
test -s "$KEY" || { echo "STOP: age key unavailable"; exit 1; }
command -v age >/dev/null || { echo "STOP: age command missing"; exit 1; }
ST=$(find "$B" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$ST" ]; then
  ST=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
fi
test -s "$ST" || { echo "STOP: encrypted Storage backup unavailable"; exit 1; }
python3 - "$KEY" "$ST" <<'PY'
import os, sys, io, json, tarfile, subprocess
key, archive = sys.argv[1:]
p = subprocess.Popen(["age", "-d", "-i", key, archive], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
total = 0
regular = 0
manifest_candidates = []
nonregular = 0
unsafe = 0
total_bytes = 0
try:
    with tarfile.open(fileobj=p.stdout, mode="r|*") as tf:
        for member in tf:
            total += 1
            path_parts = member.name.split("/")
            if member.name.startswith("/") or ".." in path_parts or member.issym() or member.islnk():
                unsafe += 1
            if not member.isfile():
                nonregular += 1
                continue
            regular += 1
            total_bytes += member.size
            candidate = "manifest" in os.path.basename(member.name).lower()
            data = bytearray() if candidate and member.size <= 5_000_000 else None
            stream = tf.extractfile(member)
            if stream is None:
                raise ValueError("TAR entry cannot be read")
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                if data is not None:
                    data.extend(chunk)
            if candidate:
                manifest_candidates.append(data)
    p.stdout.close()
    exitcode = p.wait()
    if exitcode:
        raise ValueError("age decryption or integrity failed")
except Exception as exc:
    p.kill() if p.poll() is None else None
    p.wait()
    print("STORAGE INSPECTION FAILED:", type(exc).__name__)
    sys.exit(1)

print("Storage TAR entries:", total)
print("Regular files:", regular)
print("Other TAR entries:", nonregular)
print("Total regular-file payload bytes:", total_bytes)
print("Unsafe names or links:", unsafe)
print("Manifest candidates:", len(manifest_candidates))
if unsafe:
    print("STOP: archive contains paths or links requiring security review")
    sys.exit(1)
for n, payload in enumerate(manifest_candidates, 1):
    if payload is None:
        print("Manifest", n, "too large for safe automatic format inspection")
        continue
    try:
        doc = json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        print("Manifest", n, "is not UTF-8 JSON")
        continue
    print("Manifest", n, "JSON type:", type(doc).__name__)
    entries = None
    if isinstance(doc, list):
        entries = doc
    elif isinstance(doc, dict):
        known = ("objects", "files", "entries", "items")
        print("Known record collections:", ", ".join(k for k in known if isinstance(doc.get(k), list)) or "none")
        for k in known:
            if isinstance(doc.get(k), list):
                entries = doc[k]
                break
        if entries is None:
            print("Top-level dictionary entries:", len(doc))
    if entries is not None:
        print("Manifest record count:", len(entries))
        if entries and isinstance(entries[0], dict):
            safe_fields = {"name", "path", "key", "bucket", "bucket_id", "size", "bytes", "sha256", "hash", "checksum", "content_hash", "etag"}
            print("Recognized record fields:", ", ".join(sorted(safe_fields.intersection(entries[0].keys()))) or "none")
print("READ-ONLY INSPECTION COMPLETE. File names, media, and key not displayed.")
print("NOTE: Manifest hash parity and isolated Storage-service restore are NOT yet certified.")
PY
