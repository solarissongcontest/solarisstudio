#!/usr/bin/env bash
# Solaris Studio: scoped Nov 15 backup restore into a CLEAN test PostgreSQL cluster.
# Uses Supabase PG17 binaries/extensions, but bypasses Supabase entrypoint init SQL.
# NO PRODUCTION CONNECTION, NO EXPOSED PORTS, NO HOST DATA MOUNTS, NO KEY EXPORT.
set -Eeuo pipefail
umask 077
BASE="$HOME/solaris-recovery"
KEY="$BASE/recovery-private.key"
IMAGE="supabase/postgres:17.11.0.019"
CONTAINER="solaris-clean-test-$$"
REPORT=""
STARTED=0
cleanup() {
  local rc=$?
  trap - EXIT
  if [ "$STARTED" = 1 ]; then
    docker logs "$CONTAINER" >"$REPORT/server.private.log" 2>&1 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  exit "$rc"
}
trap cleanup EXIT
abort() { echo "STOP: $*" >&2; exit 1; }

if ! command -v age >/dev/null 2>&1; then
  echo '[setup] Installing age in this Cloud Shell session'
  sudo apt-get update -qq && sudo apt-get install -y age || abort 'age installation failed'
fi
for cmd in age docker sha256sum tar find; do
  command -v "$cmd" >/dev/null 2>&1 || abort "$cmd is not installed"
done
test -s "$KEY" || abort 'Age private key is missing at expected location (never upload it)'

# Cloud Shell transient files can disappear during a find; search backup folder
# first, and never accept an absent or empty encrypted artifact.
DB=$(find "$BASE" -maxdepth 6 -type f -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true)
ST=$(find "$BASE" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true)
if [ -z "$DB" ]; then DB=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-db-20261115T170928Z.dump*.age' -print -quit 2>/dev/null || true); fi
if [ -z "$ST" ]; then ST=$(find "$HOME" -maxdepth 6 -type f -name 'solaris-storage-20261115T175307Z.tar.age' -print -quit 2>/dev/null || true); fi
test -s "$DB" && test -s "$ST" || abort 'One or both encrypted backups are missing'
test "$(sha256sum "$DB" | cut -c 1-64)" = 995088d139b5cc2fb63c8295cea5dfd8ede2e1c976ab7f6f7f3611b987742fae || abort 'Database backup SHA-256 mismatch'
test "$(sha256sum "$ST" | cut -c 1-64)" = 87eb13d9768c1b7b658fa3289853939aed5216af33979b777e8b4ca2f4b3d980 || abort 'Storage backup SHA-256 mismatch'
REPORT=$(mktemp -d "$BASE/clean-cluster-XXXXXXXX")
echo "Private diagnostics: $REPORT"

docker info >/dev/null 2>&1 || abort 'Docker daemon unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE" >/dev/null || abort 'Supabase PostgreSQL 17 image unavailable'
echo '[1/4] Checking backup archive readability and Storage member bytes'
age -d -i "$KEY" "$DB" | docker run --rm --network none -i "$IMAGE" \
  sh -c 'pg_restore --list; r=$?; cat >/dev/null; exit "$r"' \
  >"$REPORT/archive-toc.private.txt" || abort 'Database archive listing failed'
age -d -i "$KEY" "$ST" | tar -tf - >"$REPORT/storage-list.private.txt" || abort 'Storage TAR listing failed'
age -d -i "$KEY" "$ST" | tar -xOf - >/dev/null || abort 'Storage member stream failed'
echo "PASS: Storage TAR entries $(wc -l < "$REPORT/storage-list.private.txt")"

echo '[2/4] Initializing clean isolated PostgreSQL cluster, without Supabase init SQL'
# Bypass docker-entrypoint.sh, which otherwise pre-creates auth and other schemas.
# initdb creates the postgres DB from the beginning; NEVER DROP DATABASE.
docker run -d --name "$CONTAINER" --network none \
  --memory 3g --tmpfs /var/lib/postgresql/data:rw,size=1g \
  --entrypoint /bin/bash "$IMAGE" -ec '
    chown postgres:postgres /var/lib/postgresql/data
    export PATH="/usr/lib/postgresql/17/bin:$PATH"
    if command -v runuser >/dev/null 2>&1; then
      as_postgres() { runuser -u postgres -- "$@"; }
    elif command -v su >/dev/null 2>&1; then
      as_postgres() { su -s /bin/bash postgres -c "$(printf "%q " "$@")"; }
    else
      echo "No supported user-switch utility (runuser or su) in image" >&2
      exit 1
    fi
    as_postgres initdb -D /var/lib/postgresql/data \
      -U supabase_admin --auth=trust --no-instructions > /tmp/solaris-initdb.log 2>&1 || {
        cat /tmp/solaris-initdb.log >&2; exit 1;
      }
    if command -v runuser >/dev/null 2>&1; then
      exec runuser -u postgres -- postgres -D /var/lib/postgresql/data \
        -c config_file=/etc/postgresql/postgresql.conf \
        -c listen_addresses="" -c cron.launch_active_jobs=off
    else
      exec su -s /bin/bash postgres -c "exec postgres -D /var/lib/postgresql/data -c config_file=/etc/postgresql/postgresql.conf -c listen_addresses= -c cron.launch_active_jobs=off"
    fi
  ' >/dev/null || abort 'Clean PG container failed to start'
STARTED=1
READY=0
for i in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U supabase_admin -d postgres >/dev/null 2>&1; then
    READY=1; break
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != true ]; then break; fi
  sleep 1
done
if [ "$READY" != 1 ]; then
  docker inspect -f 'Container state={{.State.Status}}, exit={{.State.ExitCode}}, OOMKilled={{.State.OOMKilled}}' "$CONTAINER" || true
  abort 'Clean PostgreSQL cluster failed to reach ready state; inspect private server log'
fi
test "$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT rolsuper FROM pg_roles WHERE rolname = 'supabase_admin'")" = t || abort 'Expected isolated superuser role missing'
# Cron must stay disabled; no external effects may be replayed.
CRON=$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT current_setting('cron.launch_active_jobs',true)" || true)
test "$CRON" = off || abort 'Cannot verify scheduled jobs disabled in isolated PostgreSQL'

echo '[3/4] Preparing only schema containers and policy role identities'
# Dummy roles enable policy objects to load, NOT authorization certification.
for ROLE in postgres anon authenticated service_role authenticator \
  supabase_auth_admin supabase_storage_admin supabase_functions_admin \
  dashboard_user pgsodium_keymaker pgsodium_keyholder pgsodium_keyiduser; do
  docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE ROLE $ROLE NOLOGIN" >/dev/null || abort "Cannot create isolated placeholder role $ROLE"
done
archive_defines_schema() {
  grep -Eq "^[[:space:]]*[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+SCHEMA[[:space:]]+-[[:space:]]+$1([[:space:]]|$)" "$REPORT/archive-toc.private.txt"
}
for SCH in public private auth storage televoting extensions; do
  if archive_defines_schema "$SCH"; then
    if [ "$SCH" = public ]; then
      docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
        -c 'DROP SCHEMA IF EXISTS public' >/dev/null || abort 'Could not remove empty public schema'
    fi
  else
    docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE SCHEMA IF NOT EXISTS \"$SCH\"" >/dev/null || abort "Could not create schema $SCH"
  fi
done
grep -Eq ' TABLE televoting televote_aggregations ' "$REPORT/archive-toc.private.txt" || abort 'Televote table definition not in archive'
grep -Eq ' TABLE DATA televoting televote_aggregations ' "$REPORT/archive-toc.private.txt" || abort 'Televote table-data entry not in archive'

echo '[4/4] Restoring application dump into clean isolated database'
if age -d -i "$KEY" "$DB" | docker exec -i "$CONTAINER" sh -c '
  pg_restore -U supabase_admin -d postgres \
    --no-owner --no-acl --exit-on-error --single-transaction \
    >/dev/null 2>/tmp/restore.private.log
  rc=$?
  cat >/dev/null
  cat /tmp/restore.private.log >&2
  exit "$rc"
' 2>"$REPORT/restore.private.log"; then
  echo 'ISOLATED SCOPED DATABASE RESTORE SUCCESSFUL'
  docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 \
    -c "SELECT 'Restored tables=' || count(*) || '; RLS tables=' || count(*) FILTER (WHERE c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','private','televoting','auth','storage')"
  docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 \
    -c "SELECT 'Televote table present=' || (to_regclass('televoting.televote_aggregations') IS NOT NULL)"
  echo 'RESTORE TEST ONLY: owner/ACL, Auth/Vault roots, complete Storage-service restore and V3 migration rehearsal are not certified.'
else
  echo 'ISOLATED RESTORE BLOCKED'
  grep -m 1 -oE '(schema|relation) "[a-zA-Z0-9_.]+" (does not exist|already exists)' "$REPORT/restore.private.log" || \
  grep -m 1 -oE 'extension "[a-zA-Z0-9_]+" is not available' "$REPORT/restore.private.log" || \
  (grep -m 1 -E 'pg_restore: error:|ERROR:' "$REPORT/restore.private.log" | sed -E 's/"[^"]*"/"[hidden]"/g' | cut -c 1-180) || true
  echo "Full private diagnostic: $REPORT/restore.private.log"
  exit 1
fi
echo 'Production was never contacted; disposable container will now be deleted.'
