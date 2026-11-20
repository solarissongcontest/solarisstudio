#!/usr/bin/env bash
# LOCAL-ONLY Solaris Studio recovery check. Never connects to production.
set -euo pipefail
umask 077
# Cloud Shell system packages are ephemeral across environment restarts.
# Fail closed rather than letting pg_restore misdiagnose an empty pipe.
if ! command -v age >/dev/null 2>&1; then
  echo '[0/5] age missing in this Cloud Shell session; installing it'
  command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1 || {
    echo 'ERROR: sudo/apt-get unavailable; cannot install age automatically'
    exit 1
  }
  sudo apt-get update -qq && sudo apt-get install -y age || {
    echo 'ERROR: age installation failed; database backup untouched'
    exit 1
  }
fi
command -v age >/dev/null 2>&1 || { echo 'ERROR: age unavailable'; exit 1; }
B="$HOME/solaris-recovery"
K="$B/recovery-private.key"
# A live Cloud Shell HOME has transient .gemini lockfiles which can vanish
# mid-find. Search the backup folder first, ignore only traversal warnings,
# and still fail closed below if either real backup is missing.
D=$(find "$B" -maxdepth 6 -type f -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true)
S=$(find "$B" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$D" ]; then D=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true); fi
if [ -z "$S" ]; then S=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true); fi
test -s "$K" && test -s "$D" && test -s "$S" || { echo 'ERROR: missing key or encrypted backup'; exit 1; }
echo '[1/5] Checking backup fingerprints'
test "$(sha256sum "$D" | cut -c 1-64)" = 995088d139b5cc2fb63c8295cea5dfd8ede2e1c976ab7f6f7f3611b987742fae || { echo 'DB fingerprint mismatch'; exit 1; }
test "$(sha256sum "$S" | cut -c 1-64)" = 87eb13d9768c1b7b658fa3289853939aed5216af33979b777e8b4ca2f4b3d980 || { echo 'Storage fingerprint mismatch'; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker unavailable'; exit 1; }
docker image inspect supabase/postgres:17.11.0.002 >/dev/null 2>&1 || docker pull supabase/postgres:17.11.0.002 >/dev/null
R=$(mktemp -d "$B/recovery-mobile-XXXXXXXX")
echo "Private logs in: $R"
echo '[2/5] Checking database archive'
age -d -i "$K" "$D" | docker run --rm --network none -i supabase/postgres:17.11.0.002 sh -c 'pg_restore --list; r=$?; cat >/dev/null; exit "$r"' >"$R/archive-toc.private.txt"
echo '[3/5] Checking Storage archive and full contents'
age -d -i "$K" "$S" | tar -tf - >"$R/storage-names.private.txt"
age -d -i "$K" "$S" | tar -xOf - >/dev/null
echo "Storage entries: $(wc -l < "$R/storage-names.private.txt")"
C="solaris-mobile-restore-$$"
trap 'docker rm -f "$C" >/dev/null 2>&1 || true' EXIT
echo '[4/5] Starting fresh network-isolated Supabase PostgreSQL 17.11'
docker run --rm -d --name "$C" --network none -e POSTGRES_HOST_AUTH_METHOD=trust supabase/postgres:17.11.0.002 >/dev/null
READY=0
for i in $(seq 1 50); do
  if docker exec "$C" pg_isready -U postgres >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = 1 || { echo 'Isolated PostgreSQL not ready'; exit 1; }
# pg_cron only installs in the cluster's postgres database, so do not
# create/use a separate solaris_restore database here. This Docker cluster
# is fresh and --network none; it cannot reach the hosted Supabase instance.
test "$(docker exec "$C" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c 'SELECT current_database()')" = postgres || {
  echo 'ERROR: not connected to isolated postgres database'; exit 1;
}
echo 'Using disposable postgres database (pg_cron requirement)'
echo '[5/5] Preparing the fresh database from the backup TOC'
# The dump may omit CREATE SCHEMA for provider-managed schemas. Create only
# schema containers, never fake missing tables or rows. The source backup
# must supply every application table and its data.
archive_declares_schema() {
  local schema="$1"
  grep -Eq "^[[:space:]]*[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+SCHEMA[[:space:]]+-[[:space:]]+$schema([[:space:]]|$)" "$R/archive-toc.private.txt"
}
for schema in public private auth storage televoting extensions vault; do
  if archive_declares_schema "$schema"; then
    # Archive owns the schema DDL; never drop initialized Supabase schemas.
    :
  else
    docker exec "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE SCHEMA IF NOT EXISTS \"$schema\"" >/dev/null
    echo "Created missing schema container '$schema' in isolated database only"
  fi
done
echo '[5/5] Attempting transactional restore WITHOUT --clean'
# --clean is for overwriting existing objects; this database is fresh.
# On empty destinations, cleanup can fail before archive tables are created.
# --single-transaction aborts everything on any restore error.
if age -d -i "$K" "$D" | docker exec -i "$C" sh -c 'pg_restore -U postgres -d postgres --no-owner --no-acl --exit-on-error --single-transaction >/dev/null 2>/tmp/restore.log; r=$?; cat >/dev/null; cat /tmp/restore.log >&2; exit "$r"' 2>"$R/restore.private.log"; then
  echo 'ISOLATED DATABASE RESTORE SUCCESSFUL (ownership/ACL and Supabase services not certified)'
  docker exec "$C" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
    -c "select 'Restored tables=' || count(*) || ', RLS-enabled=' || count(*) filter (where c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','televoting','auth','storage')"
  docker exec "$C" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
    -c "select 'televoting.televote_aggregations present=' || (to_regclass('televoting.televote_aggregations') is not null)"
else
  echo 'ISOLATED RESTORE NOT COMPLETED'
  echo 'Cause (limited sanitized diagnostic):'
  grep -m 1 -oE '(schema|relation) "[A-Za-z0-9_.]+" (does not exist|already exists)' "$R/restore.private.log" || \
  grep -m 1 -oE 'extension "[A-Za-z0-9_]+" is not available' "$R/restore.private.log" || \
  (grep -m 1 -E '(pg_restore: error:|ERROR:)' "$R/restore.private.log" | sed -E 's/"[^"]*"/"[hidden]"/g' | cut -c 1-180) || true
  echo "Full PRIVATE diagnostic log: $R/restore.private.log"
  exit 1
fi
echo 'Production unchanged. Still requires Storage service, role/Auth/Vault and migration rehearsal certification.'
