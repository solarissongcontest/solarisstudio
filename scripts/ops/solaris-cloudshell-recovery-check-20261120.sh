#!/usr/bin/env bash
# LOCAL-ONLY Solaris Studio recovery check. Never connects to production.
set -euo pipefail
umask 077
B="$HOME/solaris-recovery"
K="$B/recovery-private.key"
D=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit)
S=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit)
test -s "$K" && test -s "$D" && test -s "$S" || { echo 'ERROR: missing key or encrypted backup'; exit 1; }
echo '[1/5] Checking backup fingerprints'
test "$(sha256sum "$D" | cut -c 1-64)" = 995088d139b5cc2fb63c8295cea5dfd8ede2e1c976ab7f6f7f3611b987742fae || { echo 'DB fingerprint mismatch'; exit 1; }
test "$(sha256sum "$S" | cut -c 1-64)" = 87eb13d9768c1b7b658fa3289853939aed5216af33979b777e8b4ca2f4b3d980 || { echo 'Storage fingerprint mismatch'; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker unavailable'; exit 1; }
docker image inspect postgres:17 >/dev/null 2>&1 || docker pull postgres:17 >/dev/null
R=$(mktemp -d "$B/recovery-mobile-XXXXXXXX")
echo "Private logs in: $R"
echo '[2/5] Checking database archive'
age -d -i "$K" "$D" | docker run --rm --network none -i postgres:17 sh -c 'pg_restore --list >/dev/null; r=$?; cat >/dev/null; exit "$r"'
echo '[3/5] Checking Storage archive and full contents'
age -d -i "$K" "$S" | tar -tf - >"$R/storage-names.private.txt"
age -d -i "$K" "$S" | tar -xOf - >/dev/null
echo "Storage entries: $(wc -l < "$R/storage-names.private.txt")"
C="solaris-mobile-restore-$$"
trap 'docker rm -f "$C" >/dev/null 2>&1 || true' EXIT
echo '[4/5] Starting fresh network-isolated PostgreSQL 17'
docker run --rm -d --name "$C" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
READY=0
for i in $(seq 1 50); do
  if docker exec "$C" pg_isready -U postgres >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1 || { echo 'Isolated PostgreSQL not ready'; exit 1; }
docker exec "$C" createdb -U postgres -T template0 solaris_restore
echo '[5/5] Attempting isolated transactional restore'
if age -d -i "$K" "$D" | docker exec -i "$C" sh -c 'pg_restore -U postgres -d solaris_restore --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction >/dev/null 2>/tmp/restore.log; r=$?; cat >/dev/null; cat /tmp/restore.log >&2; exit "$r"' 2>"$R/restore.private.log"; then
  echo 'ISOLATED DATABASE RESTORE SUCCESSFUL'
  docker exec "$C" psql -U postgres -d solaris_restore -At -c "select 'Restored tables: ' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','televoting','auth','storage','vault')"
else
  echo 'RESTORE FAILED; first redacted error:'
  grep -m 1 -E '(pg_restore: error:|ERROR:)' "$R/restore.private.log" | sed -E 's/"[^"]*"/"[hidden]"/g' | cut -c 1-180 || true
  echo "Full private log: $R/restore.private.log"
  exit 1
fi
echo 'Production unchanged. Still requires Storage service, role/Auth/Vault and migration rehearsal certification.'