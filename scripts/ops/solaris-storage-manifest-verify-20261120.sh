#!/usr/bin/env bash
# Solaris Studio Nov 15: streaming, read-only Storage SHA-256 + size parity.
# Reads encrypted backup locally in Cloud Shell. Never contacts Supabase,
# prints media paths, writes decrypted payloads, or accesses production.
set -Eeuo pipefail
umask 077
BASE="$HOME/solaris-recovery"
KEY="$BASE/recovery-private.key"
command -v age >/dev/null 2>&1 || { echo 'STOP: age is not installed'; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo 'STOP: python3 is not installed'; exit 1; }
test -s "$KEY" || { echo 'STOP: decryption identity missing'; exit 1; }
ST=$(find "$BASE" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$ST" ]; then
  ST=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
fi
test -s "$ST" || { echo 'STOP: encrypted Storage archive missing'; exit 1; }
python3 - "$KEY" "$ST" <<'PY'
import collections
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
import tarfile

key, archive = sys.argv[1:]
proc = subprocess.Popen(
    ["age", "-d", "-i", key, archive],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
)
objects = {}
manifest_bytes = []
unsafe = 0
regular = 0

try:
    with tarfile.open(fileobj=proc.stdout, mode="r|*") as tf:
        for member in tf:
            name = member.name
            segments = name.split("/")
            if not member.isfile() or name.startswith("/") or ".." in segments:
                unsafe += 1
                continue
            normalized = posixpath.normpath(name)
            if normalized in objects:
                raise ValueError("duplicate archive object names")
            regular += 1
            is_manifest = "manifest" in posixpath.basename(name).lower()
            h = hashlib.sha256()
            size = 0
            saved = bytearray() if is_manifest and member.size <= 5_000_000 else None
            stream = tf.extractfile(member)
            if stream is None:
                raise ValueError("cannot read archive file")
            while True:
                data = stream.read(1024 * 1024)
                if not data:
                    break
                size += len(data)
                h.update(data)
                if saved is not None:
                    saved.extend(data)
            if size != member.size:
                raise ValueError("truncated archive member")
            if is_manifest:
                manifest_bytes.append(saved)
            else:
                objects[normalized] = (h.hexdigest(), size)
    proc.stdout.close()
    age_rc = proc.wait()
    if age_rc != 0:
        raise ValueError("age archive authentication/decryption failed")
except Exception as exc:
    if proc.poll() is None:
        proc.kill()
    proc.wait()
    print("FAIL: archive streaming/integrity check:", type(exc).__name__)
    sys.exit(1)

print("Storage TAR regular files:", regular)
print("Object members (excluding manifest):", len(objects))
print("Unsafe entries:", unsafe)
print("Manifest files:", len(manifest_bytes))
if unsafe or len(manifest_bytes) != 1 or manifest_bytes[0] is None:
    print("STOP: unexpected TAR structure or unsafe member")
    sys.exit(1)

try:
    document = json.loads(manifest_bytes[0])
    if not isinstance(document, dict) or not isinstance(document.get("files"), list):
        raise ValueError("manifest JSON does not have files list")
    files = document["files"]
    if not files:
        raise ValueError("manifest has no file records")
    wanted = collections.Counter()
    labels = set()
    expected = []
    for entry in files:
        if not isinstance(entry, dict):
            raise ValueError("manifest record is not an object")
        bucket = entry.get("bucket")
        path = entry.get("path")
        sha = entry.get("sha256")
        length = entry.get("size")
        if not isinstance(bucket, str) or not bucket or not isinstance(path, str) or not path:
            raise ValueError("invalid bucket/path")
        if path.startswith("/") or ".." in path.split("/") or bucket.startswith("/") or ".." in bucket.split("/"):
            raise ValueError("unsafe manifest bucket/path")
        if not isinstance(sha, str):
            raise ValueError("invalid SHA-256 field")
        sha = sha.removeprefix("sha256:").lower()
        if re.fullmatch("[0-9a-f]{64}", sha) is None:
            raise ValueError("SHA-256 is not hex encoded")
        if isinstance(length, bool):
            raise ValueError("invalid size")
        try:
            length = int(length)
        except (ValueError, TypeError):
            raise ValueError("invalid size")
        if length < 0:
            raise ValueError("negative file size")
        label = (bucket, path)
        if label in labels:
            raise ValueError("duplicate bucket/path in manifest")
        labels.add(label)
        wanted[(sha, length)] += 1
        expected.append((bucket, path, sha, length))

    actual = collections.Counter(objects.values())
    if len(files) != len(objects):
        print("Manifest object records:", len(files))
        print("Archive object members:", len(objects))
        print("FAIL: record/member counts differ")
        sys.exit(1)

    difference = wanted - actual
    surplus = actual - wanted
    print("Manifest object records:", len(files))
    print("Manifest SHA-256/size fields valid:", len(files))
    print("Unmatched expected content digests:", sum(difference.values()))
    print("Unreferenced archive content digests:", sum(surplus.values()))
    if difference or surplus:
        print("FAIL: content hash or byte-size parity")
        sys.exit(1)

    bucket_path_mapped = 0
    path_only_mapped = 0
    for bucket, path, sha, size in expected:
        full = posixpath.normpath(bucket.strip("/") + "/" + path.strip("/"))
        valid_full = [
            n for n, meta in objects.items()
            if meta == (sha, size) and (n == full or n.endswith("/" + full))
        ]
        if len(valid_full) == 1:
            bucket_path_mapped += 1
            continue
        simple = posixpath.normpath(path.strip("/"))
        valid_simple = [
            n for n, meta in objects.items()
            if meta == (sha, size) and (n == simple or n.endswith("/" + simple))
        ]
        if len(valid_simple) == 1:
            path_only_mapped += 1

    print("PASS: all", len(files), "manifest hashes and sizes match archived bytes")
    print("Bucket+path mapping confirmed:", bucket_path_mapped, "/", len(files))
    print("Path-only mapping (bucket not proved):", path_only_mapped)
    if bucket_path_mapped == len(files):
        print("PASS: all bucket/path names also match archive layout")
    else:
        print("NOTE: some bucket/path mappings cannot be certified from archive naming")
    print("Storage-service restoration: NOT YET TESTED")
    print("No object names, media bytes, or encryption keys were displayed.")
except (ValueError, TypeError, UnicodeDecodeError, KeyError) as exc:
    print("STOP: manifest structure/validation:", str(exc))
    sys.exit(1)
PY
