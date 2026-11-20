#!/usr/bin/env bash
# Solaris Studio: READ-ONLY custom PostgreSQL archive TOC audit.
# Reads encrypted Nov-15 DB backup inside owner's Cloud Shell, never prod.
# Prints aggregate counts only, never object names, role names or secret values.
# No database is started, modified, or restored. TOC is removed on exit.
set -Eeuo pipefail
umask 077

B="$HOME/solaris-recovery"
K="$B/recovery-private.key"
IMAGE="supabase/postgres:17.11.0.019"

if ! command -v age >/dev/null 2>&1; then
  echo '[setup] Installing age after Cloud Shell restart'
  sudo apt-get update -qq && sudo apt-get install -y age || {
    echo 'STOP: age installation failed'; exit 1;
  }
fi
for cmd in age docker python3 sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "STOP: required tool unavailable: $cmd"; exit 1;
  }
done
test -s "$K" || { echo 'STOP: decryption key not found'; exit 1; }

DB=$(find "$B" -maxdepth 6 -type f \
  -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true)
if [ -z "$DB" ]; then
  DB=$(find "$HOME" -maxdepth 6 -type f \
    -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true)
fi
test -s "$DB" || { echo 'STOP: encrypted November 15 DB archive not found'; exit 1; }
ACTUAL=$(sha256sum "$DB" | cut -d' ' -f1)
test "$ACTUAL" = '995088d139b5cc2fb63c8295cea5dfd8ede2e1c976ab7f6f7f3611b987742fae' || {
  echo 'STOP: database ciphertext SHA-256 differs from verified archive'; exit 1;
}

docker info >/dev/null 2>&1 || { echo 'STOP: Docker unavailable'; exit 1; }
# Cloud Shell may discard previously downloaded Docker images.
# Pull only the exact PostgreSQL 17.11 image tag used in the verified restore.
# Network access is required only for this Docker image download; the
# pg_restore reader below runs with --network none and does not access prod.
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo '[setup] Downloading missing PostgreSQL 17.11 image'
  docker pull "$IMAGE" >/dev/null || {
    echo 'STOP: required PostgreSQL image could not be downloaded'; exit 1;
  }
fi
docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo 'STOP: PostgreSQL image is still unavailable'; exit 1;
}
TOC=$(mktemp "$B/role-acl-toc-private-XXXXXXXX")
cleanup() { rm -f -- "$TOC"; }
trap cleanup EXIT

echo '[1/2] Decrypting archive into a network-isolated pg_restore TOC reader'
# Entire archive streams through the isolated client; TOC only goes to a
# local 0600 temporary file. No raw table or role names are printed.
# pg_restore --list can stop reading the input after the archive TOC.
# Consume the remainder of the age stream so age can finish authentication
# cleanly; otherwise Bash pipefail treats an early SIGPIPE as an archive failure.
set +e
age -d -i "$K" "$DB" |
  docker run --rm --network none -i "$IMAGE" \
    sh -c 'pg_restore --list; r=$?; cat >/dev/null; exit "$r"' > "$TOC"
PIPE_RESULTS=("${PIPESTATUS[@]}")
set -e
if [ "${PIPE_RESULTS[0]}" -ne 0 ] || [ "${PIPE_RESULTS[1]}" -ne 0 ]; then
  echo "STOP: TOC reader failed (decryption exit ${PIPE_RESULTS[0]}; pg_restore exit ${PIPE_RESULTS[1]})"
  exit 1
fi

echo '[2/2] Reporting metadata counts; deleting private TOC at exit'
python3 - "$TOC" <<'PY'
import collections
import re
import sys
from pathlib import Path

toc = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
if not re.search(r'^;\s*Format:\s*CUSTOM\s*$', toc, re.M):
    raise SystemExit('STOP: expected custom PostgreSQL archive TOC')
if not re.search(r'^;\s*Dumped from database version:\s*17\.11(?:\s|$)', toc, re.M):
    raise SystemExit('STOP: unexpected source PostgreSQL version')

kinds = (
  'DEFAULT ACL', 'TABLE DATA', 'SEQUENCE SET', 'MATERIALIZED VIEW',
  'FK CONSTRAINT', 'TABLE ATTACH', 'ACL', 'TABLE', 'POLICY',
  'SCHEMA', 'FUNCTION', 'PROCEDURE', 'EXTENSION', 'TRIGGER', 'INDEX',
)
counts = collections.Counter()
tables = collections.Counter()
data = collections.Counter()
owners = set()
misc = 0
for line in toc.splitlines():
    if not line or line.startswith(';'):
        continue
    match = re.match(r'^\d+;\s+\d+\s+\d+\s+(.+)$', line)
    if not match:
        raise SystemExit('STOP: archive TOC contains unexpected entry')
    body = match.group(1)
    kind = next((k for k in kinds if body.startswith(k + ' ')), 'OTHER')
    counts[kind] += 1
    if kind in ('TABLE','TABLE DATA'):
        match2 = re.match(r'^TABLE(?: DATA)?\s+(\S+)\s+(\S+)\s+(\S+)',body)
        if not match2:
            raise SystemExit('STOP: unreadable table TOC entry')
        schema, _object, owner = match2.groups()
        if kind == 'TABLE': tables[schema] += 1
        else: data[schema] += 1
        owners.add(owner)
    if kind == 'OTHER':
        misc += 1

wanted = ['auth','private','public','storage','televoting']
print('Custom archive version: PostgreSQL 17.11')
print('Application TABLE definitions:', sum(tables[k] for k in wanted))
print('Application TABLE DATA entries:', sum(data[k] for k in wanted))
print('ACL entries:', counts['ACL'])
print('DEFAULT ACL entries:', counts['DEFAULT ACL'])
print('POLICY entries:', counts['POLICY'])
print('TRIGGER entries:', counts['TRIGGER'])
print('Unique TABLE owner names in TOC:', len(owners))
print('Vault TABLE definitions in scoped dump:', tables['vault'])
print('Migration-ledger TABLE definitions in scoped dump:', tables['supabase_migrations'])
for schema in wanted:
    print(schema + ':', tables[schema], 'table definitions;',
          data[schema], 'table-data entries')
if sum(tables[k] for k in wanted) != 225:
    print('STOP: archive table-scope unexpected; do not certify role recovery')
    sys.exit(1)
if counts['ACL'] == 0 and counts['DEFAULT ACL'] == 0:
    print('FINDING: original GRANT/ACL statements not represented as TOC ACL entries')
else:
    print('FINDING: archive advertises some ACL entries; not yet tested as restored grants')
print('NOTE: even ACL entries do NOT capture PostgreSQL global roles,')
print('passwords, role membership, Auth provider configuration or Vault encryption roots.')
print('READ-ONLY TOC AUDIT COMPLETE; ownership/role recovery NOT CERTIFIED.')
PY
