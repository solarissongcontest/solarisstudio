#!/usr/bin/env bash
# Solaris Studio 2026-11-15: isolated S3 object-service restore/round-trip.
# - ALL connections confined to Docker --internal bridge network
# - NO published ports, production credentials, production APIs, host mounts
# - Encrypted original never modified, no decrypted files written on host
# - Restored bytes stored ONLY in disposable S3-compatible SILO container tmpfs
# - Private object paths/keys/passwords never printed
# NOTE: Does NOT certify Supabase Storage RLS, metadata or Auth/Vault.
set -Eeuo pipefail
umask 077

BASE="$HOME/solaris-recovery"
IDENTITY="$BASE/recovery-private.key"
IMAGE_SVC="pgsty/silo:RELEASE.2026-11-12T00-00-00Z"
IMAGE_MC="pgsty/mc:RELEASE.2026-11-12T00-00-00Z"
IMAGE_CURL="curlimages/curl:latest"
NETWORK="solaris-offline-store-$$"
SERVICE="solaris-silo-${BASHPID}"
SERVICE_USER="solarisrestore"
SERVICE_PASSWORD="$(openssl rand -hex 24)"
CREATED_NETWORK=0
CREATED_SERVICE=0
# Reject malformed names before creating any Docker resources.
for docker_name in "$NETWORK" "$SERVICE"; do
  if [[ ! "$docker_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
    echo 'STOP: invalid temporary Docker resource name'
    exit 1
  fi
done

cleanup() {
  if [ "$CREATED_SERVICE" = 1 ]; then
    docker rm -f "$SERVICE" >/dev/null 2>&1 || true
  fi
  if [ "$CREATED_NETWORK" = 1 ]; then
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

stop() { echo "STOP: $*" >&2; exit 1; }
if ! command -v age >/dev/null 2>&1; then
  echo '[setup] Installing age after Cloud Shell restart'
  sudo apt-get update -qq && sudo apt-get install -y age || stop 'cannot install age'
fi
for cmd in age python3 docker sha256sum openssl; do
  command -v "$cmd" >/dev/null 2>&1 || stop "$cmd is unavailable"
done
test -s "$IDENTITY" || stop 'private age identity not found'
ARCHIVE=$(find "$BASE" -maxdepth 6 -type f \
  -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(find "$HOME" -maxdepth 6 -type f \
    -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
fi
test -s "$ARCHIVE" || stop 'November 15 Storage backup not found'
test "$(sha256sum "$ARCHIVE" | cut -c 1-64)" = \
  87eb13d9768c1b7b658fa3289853939aed5216af33979b777e8b4ca2f4b3d980 \
  || stop 'encrypted Storage archive SHA-256 changed'
docker info >/dev/null 2>&1 || stop 'Docker is not running'

echo '[1/4] Preparing temporary pinned S3-compatible Docker images'
for image in "$IMAGE_SVC" "$IMAGE_MC" "$IMAGE_CURL"; do
  docker image inspect "$image" >/dev/null 2>&1 || \
    docker pull "$image" >/dev/null || stop "cannot download required test image: $image"
done

echo '[2/4] Starting an isolated, private S3-compatible service'
docker network create --internal "$NETWORK" >/dev/null \
  || stop 'cannot create private Docker network'
CREATED_NETWORK=1
docker run -d --name "$SERVICE" --network "$NETWORK" \
  --memory 2g --tmpfs /data:rw,size=256m \
  -e "MINIO_ROOT_USER=$SERVICE_USER" \
  -e "MINIO_ROOT_PASSWORD=$SERVICE_PASSWORD" \
  "$IMAGE_SVC" server /data --address ':9000' > /dev/null \
  || stop 'could not launch local object-storage service'
CREATED_SERVICE=1
export MC_HOST_recovery="http://$SERVICE_USER:$SERVICE_PASSWORD@$SERVICE:9000"
export SOLARIS_TEST_NETWORK="$NETWORK"
export SOLARIS_TEST_SERVICE="$SERVICE"
export SOLARIS_TEST_MC_IMAGE="$IMAGE_MC"
export SOLARIS_TEST_CURL_IMAGE="$IMAGE_CURL"

READY=0
for i in $(seq 1 35); do
  if docker run --rm --network "$NETWORK" -e MC_HOST_recovery \
    "$IMAGE_MC" ls recovery > /dev/null 2>&1; then
    READY=1
    break
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$SERVICE" 2>/dev/null || true)" != true ]; then
    break
  fi
  sleep 1
done
if [ "$READY" != 1 ]; then
  echo 'Local object-storage service was not ready.'
  docker inspect -f 'Docker status={{.State.Status}}; exit={{.State.ExitCode}}; OOMKilled={{.State.OOMKilled}}' "$SERVICE" || true
  stop 'isolated S3 service unavailable'
fi

echo '[3/4] Matching private archive contents to authoritative manifest'
echo '[4/4] Restoring and reading back every object through the S3 API'
python3 - "$IDENTITY" "$ARCHIVE" <<'PY'
import collections
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
import tarfile
from urllib.parse import quote

key, archive = sys.argv[1:]
network = os.environ["SOLARIS_TEST_NETWORK"]
service = os.environ["SOLARIS_TEST_SERVICE"]
mc_image = os.environ["SOLARIS_TEST_MC_IMAGE"]
curl_image = os.environ["SOLARIS_TEST_CURL_IMAGE"]

def restore_error(message):
    raise RuntimeError(message)

def decrypt_archive(visitor):
    proc = subprocess.Popen(
        ["age", "-d", "-i", key, archive],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL
    )
    try:
        with tarfile.open(fileobj=proc.stdout, mode="r|*") as tf:
            for m in tf:
                if not m.isfile() or m.issym() or m.islnk():
                    restore_error("unexpected TAR member type")
                if m.name.startswith("/") or ".." in m.name.split("/") or "\x00" in m.name:
                    restore_error("unsafe source TAR member")
                stream = tf.extractfile(m)
                if stream is None:
                    restore_error("could not open source TAR member")
                visitor(m.name, m.size, stream)
        proc.stdout.close()
        if proc.wait() != 0:
            restore_error("age decryption/integrity failed")
    except Exception:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
        raise

def content_digest(stream, want_data=False):
    digest = hashlib.sha256()
    chunks = [] if want_data else None
    size = 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        digest.update(chunk)
        if chunks is not None:
            chunks.append(chunk)
    return digest.hexdigest(), size, (b"".join(chunks) if chunks is not None else None)

objects = collections.Counter()
manifest = []
seen_source_names = set()

def inspect_member(name, stated_size, stream):
    if name in seen_source_names:
        restore_error("duplicated source archive pathname")
    seen_source_names.add(name)
    is_manifest = "manifest" in posixpath.basename(name).lower()
    if is_manifest and stated_size > 5_000_000:
        restore_error("manifest too large for safe verification")
    sha, size, data = content_digest(stream, want_data=is_manifest)
    if size != stated_size:
        restore_error("truncated source TAR member")
    if is_manifest:
        manifest.append(data)
    else:
        objects[(sha, size)] += 1

def mc(*args, data=None, capture=True):
    cmd = ["docker", "run", "--rm", "--network", network,
           "-e", "MC_HOST_recovery", mc_image, *args]
    result = subprocess.run(cmd, input=data, stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        restore_error("local S3 command failed (exit %d)" % result.returncode)
    return result.stdout if capture else b""

def curl_unauthorized(bucket, path):
    url = "http://" + service + ":9000/" + bucket + "/" + quote(path, safe="/")
    result = subprocess.run(
        ["docker", "run", "--rm", "--network", network, curl_image,
         "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20", url],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
    )
    if result.returncode != 0:
        restore_error("anonymous network probe failed")
    return result.stdout.decode("ascii", errors="replace").strip()

decrypt_archive(inspect_member)
if len(manifest) != 1:
    restore_error("expected exactly one manifest")
document = json.loads(manifest[0])
if not isinstance(document, dict) or not isinstance(document.get("files"), list):
    restore_error("unsupported manifest format")
expected_files = document["files"]
if len(expected_files) != 108 or sum(objects.values()) != 108:
    restore_error("expected 108 manifest records and exactly 108 source payloads")

wanted = collections.Counter()
targets = collections.defaultdict(list)
buckets = {}
destination_pairs = set()
for entry in expected_files:
    if not isinstance(entry, dict):
        restore_error("invalid manifest record")
    bucket = entry.get("bucket")
    path = entry.get("path")
    sha = entry.get("sha256")
    size = entry.get("size")
    if not isinstance(bucket, str) or not bucket or not isinstance(path, str) or not path:
        restore_error("invalid manifest bucket or object key")
    if any(c in bucket + path for c in ("\x00", "\n", "\r")) or \
       path.startswith("/") or ".." in path.split("/") or \
       bucket.startswith("/") or "/" in bucket:
        restore_error("unsafe manifest key")
    if not isinstance(sha, str):
        restore_error("invalid manifest digest type")
    sha = sha.removeprefix("sha256:").lower()
    if re.fullmatch(r"[0-9a-f]{64}", sha) is None:
        restore_error("invalid SHA-256")
    if isinstance(size, bool) or not isinstance(size, (int, str)):
        restore_error("invalid size type")
    size = int(size)
    if size < 0 or len(path.encode()) > 1024:
        restore_error("invalid object length")
    if (bucket, path) in destination_pairs:
        restore_error("duplicate manifest bucket/key")
    destination_pairs.add((bucket, path))
    # S3 bucket IDs have stricter naming rules than Supabase's bucket IDs.
    # Names are mapped in THIS disposable S3 test only. Full Supabase bucket
    # identity and RLS verification still require the real Storage service.
    internal_bucket = "solaris-test-" + hashlib.sha256(bucket.encode()).hexdigest()[:24]
    if internal_bucket in buckets.values() and buckets.get(bucket) != internal_bucket:
        restore_error("test bucket mapping collision")
    buckets[bucket] = internal_bucket
    wanted[(sha, size)] += 1
    targets[(sha, size)].append((internal_bucket, path))

if wanted != objects:
    restore_error("manifest digest/size multiset differs from source payloads")
print("PASS: all 108 source payloads match authoritative manifest")
print("Logical Supabase buckets:", len(buckets))
print("Isolated S3 buckets:", len(set(buckets.values())))
for internal_bucket in sorted(set(buckets.values())):
    mc("mb", "recovery/" + internal_bucket, capture=False)
    mc("anonymous", "set", "none", "recovery/" + internal_bucket, capture=False)

uploaded = 0
def upload_member(name, stated_size, stream):
    global uploaded
    if "manifest" in posixpath.basename(name).lower():
        content_digest(stream)
        return
    sha, size, data = content_digest(stream, want_data=True)
    if size != stated_size:
        restore_error("source object bytes truncated during upload")
    dest_list = targets[(sha, size)]
    if not dest_list:
        restore_error("manifest mapping exhausted unexpectedly")
    bucket, path = dest_list.pop()
    mc("pipe", "recovery/" + bucket + "/" + path, data=data, capture=False)
    uploaded += 1
    if uploaded % 25 == 0:
        print("S3 objects restored:", uploaded, "/ 108")

decrypt_archive(upload_member)
if uploaded != 108 or any(targets.values()):
    restore_error("not all manifest destinations were restored")
print("PASS: 108/108 objects uploaded to private isolated S3 service")

retrieved = 0
probe_paths = {}
for entry in expected_files:
    bucket = buckets[entry["bucket"]]
    path = entry["path"]
    payload = mc("cat", "recovery/" + bucket + "/" + path)
    size = int(entry["size"])
    digest = entry["sha256"].removeprefix("sha256:").lower()
    if len(payload) != size or hashlib.sha256(payload).hexdigest() != digest:
        restore_error("read-back digest/size mismatch")
    retrieved += 1
    probe_paths.setdefault(bucket, path)
    if retrieved % 25 == 0:
        print("S3 objects read back and verified:", retrieved, "/ 108")
print("PASS: 108/108 S3 API download hashes and sizes match source manifest")

for bucket, path in probe_paths.items():
    code = curl_unauthorized(bucket, path)
    if code != "403":
        restore_error("anonymous S3 object GET was not denied")
print("PASS: unauthenticated object GET denied for all isolated test buckets")
print("LOCAL S3 OBJECT-RESTORE ROUNDTRIP SUCCESSFUL")
print("Production never contacted. Test containers and object bytes deleted on script exit.")
print("STILL OPEN: original Supabase bucket IDs, public/private access policies,")
print("Auth/RLS, Storage metadata, and isolated Supabase Storage API verification.")
PY
