#!/usr/bin/env bash
# Solaris Studio: LOCAL archive-owner/ACL replay and role-scoped read-only probes.
# Preserves archived owner/ACL metadata in a disposable isolated PG17 environment.
# NO PRODUCTION CONNECTION, NO EXPOSED PORTS, NO HOST DATA MOUNTS, NO KEY EXPORT.
set -Eeuo pipefail
umask 077
BASE="$HOME/solaris-recovery"
KEY="$BASE/recovery-private.key"
IMAGE="supabase/postgres:17.11.0.019"
CONTAINER="solaris-role-acl-test-${BASHPID}"
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
REPORT=$(mktemp -d "$BASE/role-acl-test-XXXXXXXX")
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

echo '[3/4] Preparing restricted archive-owner/ACL role identities'
# PostgreSQL custom dumps include owner labels and ACL commands but NOT
# global role definitions, role passwords or membership edges. The seed names
# here are only publicly known standard Supabase role identities and known
# provider-managed role classes observed in the owner-hosted PG17 catalog.
# ALL identities are disabled for LOGIN in this networkless test. No membership
# edges are invented, so full effective-role certification remains OPEN.
python3 - "$REPORT/archive-toc.private.txt" > "$REPORT/roles.private.sql" <<'PYROLE'
import re, sys
from pathlib import Path

toc = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
known = set("""
anon authenticated authenticator service_role dashboard_user postgres pgbouncer
cli_login_postgres supabase_admin supabase_auth_admin supabase_etl_admin
supabase_functions_admin supabase_privileged_role supabase_read_only_user
supabase_realtime_admin supabase_replication_admin supabase_storage_admin
pgsodium_keymaker pgsodium_keyholder pgsodium_keyiduser
""".split())
# Only TABLE definition records provide the owner evidence we need here.
# pg_restore TOC entries for indexes, ACLs, triggers and functions often end
# with *object identifiers*, not role names. Counting those as owners falsely
# reports dozens of invented roles and breaks this safe local rehearsal.
# The verified 15-Nov archive contains 225 application TABLE definitions
# PLUS one supabase_migrations migration-ledger TABLE, counted separately.
# Other archive objects (indexes, ACLs, triggers) are not role identities.
from collections import Counter
owners = set()
table_schemas = Counter()
application_schemas = {'auth', 'private', 'public', 'storage', 'televoting'}
valid_role = re.compile(r'[A-Za-z_][A-Za-z_0-9$]{0,62}\Z')
for line in toc.splitlines():
    m = re.match(r'^\d+;\s+\d+\s+\d+\s+TABLE\s+(.+)$', line)
    if not m:
        continue
    rest = m.group(1)
    if rest.startswith(('DATA ', 'ATTACH ')):
        continue
    parts = rest.split()
    if len(parts) < 3:
        raise SystemExit('STOP: malformed TABLE TOC entry; no roles generated')
    schema = parts[0]
    candidate = parts[-1]
    if not valid_role.fullmatch(candidate):
        raise SystemExit('STOP: unusual TABLE owner field; no roles generated')
    table_schemas[schema] += 1
    owners.add(candidate)
application_count = sum(table_schemas[x] for x in application_schemas)
migration_count = table_schemas['supabase_migrations']
all_tables = sum(table_schemas.values())
# The privately verified Nov-15 archive contains 10 other TABLE entries
# in provider-managed/additional schemas. They were excluded from the 225
# application-table count in the independent TOC audit. They remain subject
# to the original, fail-closed owner/ACL restore, not silently discarded.
other_count = all_tables - application_count - migration_count
if (application_count != 225 or migration_count != 1 or
        other_count != 10 or all_tables != 236 or
        not owners or len(owners) > 50):
    print('STOP: unexpected TABLE inventory: application=%d, ledger=%d, other=%d, total=%d' %
          (application_count, migration_count, other_count, all_tables), file=sys.stderr)
    raise SystemExit(1)
print('TABLE owner inventory verified: application=225, ledger=1, other=10, total=236', file=sys.stderr)
roles = sorted(known | owners)
if len(roles) > 75: raise SystemExit("STOP: role inventory is too large")
for role in roles:
    if role.startswith("pg_"): continue
    if role == "supabase_admin": continue  # initdb superuser already exists
    lit = role.replace("'", "''")
    # Only the observed hosted service_role and postgres identities bypass RLS;
    # all other roles have minimal NOLOGIN/NOBYPASSRLS local attributes.
    bypass = "BYPASSRLS" if role in ("service_role","postgres") else "NOBYPASSRLS"
    print('DO $role_seed$ BEGIN IF NOT EXISTS'
          " (SELECT 1 FROM pg_roles WHERE rolname = '%s') THEN "
          "EXECUTE 'CREATE ROLE ' || quote_ident('%s') || ' NOLOGIN %s'; "
          "END IF; END $role_seed$;" % (lit, lit, bypass))
PYROLE
docker exec -i "$CONTAINER" psql -X -q -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 -f - < "$REPORT/roles.private.sql" \
  > "$REPORT/role-seed.private.log" 2>&1 || abort 'Local role seed failed (see private log)'
echo 'Restricted local role placeholders prepared; membership recovery remains OPEN'
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

echo '[4/4] Applying original archive ownership and ACL entries in isolated PostgreSQL'
if age -d -i "$KEY" "$DB" | docker exec -i "$CONTAINER" sh -c '
  pg_restore -U supabase_admin -d postgres \
    --exit-on-error --single-transaction \
    >/dev/null 2>/tmp/restore.private.log
  rc=$?
  cat >/dev/null
  cat /tmp/restore.private.log >&2
  exit "$rc"
' 2>"$REPORT/restore.private.log"; then
  echo 'ISOLATED ARCHIVE OWNER/ACL RESTORE APPLIED'
  # Counts are metadata-only. Never print actual rows or raw function bodies.
  docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "
    WITH x AS (
      SELECT c.oid,c.relacl,c.relowner,c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','private','televoting','auth','storage') AND c.relkind='r'
    )
    SELECT 'Restored tables=' || count(*) ||
           '; RLS tables=' || count(*) FILTER(WHERE relrowsecurity) ||
           '; tables with explicit ACL=' || count(*) FILTER(WHERE relacl IS NOT NULL) ||
           '; table-owner role identities=' || count(DISTINCT relowner)
      FROM x" || abort 'Restored catalog inventory failed'
  RESTORED_COUNTS=$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At \
    -v ON_ERROR_STOP=1 -c "
      SELECT count(*)::text || '|' ||
             count(*) FILTER (WHERE c.relrowsecurity)::text
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind='r'
         AND n.nspname IN ('public','private','televoting','auth','storage')")
  test "$RESTORED_COUNTS" = '225|202' \
    || abort 'Unexpected restored table/RLS counts; refusing permission certificate'
  POLICY_COUNT=$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','private','televoting','auth','storage')")
  test "$POLICY_COUNT" = 265 || abort "Unexpected policy count after role/ACL replay: $POLICY_COUNT"
  echo "RLS policies present: $POLICY_COUNT / 265"
  DEFAULT_ACL_COUNT=$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At \
    -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_default_acl") \
    || abort 'Restored default ACL catalog check failed'
  test "$DEFAULT_ACL_COUNT" = 27 \
    || abort "Expected 27 restored DEFAULT ACL entries; got $DEFAULT_ACL_COUNT"
  echo "DEFAULT ACL entries present: $DEFAULT_ACL_COUNT / 27"

  # Compare the local table-owner/ACL/RLS fingerprints with the bounded
  # 2026-11-20 production METADATA baseline. This backup is Nov 15, so a
  # difference is dated drift, never a reason to modify production or falsely
  # claim failed file integrity. The actual GRANT/ALTER OWNER replay itself
  # must have succeeded transactionally before this comparison runs.
  HOSTED_MATCHES=0
  HOSTED_DRIFTS=0
  while IFS='|' read -r SCHEMA OWNER_DIGEST; do
    case "$SCHEMA" in
      auth) EXPECTED_DIGEST='8f329f2a8c9d5912237cae44373b17b5e9d37c195a852ef8420f28fbad18536f' ;;
      private) EXPECTED_DIGEST='9d7d119f0d4a6caa086f0d8a83c173388f7858aa21611188105745ef4cb92087' ;;
      public) EXPECTED_DIGEST='868f63c6f61ad87edc56ea03f1d362906c9d9c0e78c71af3efbc3e93be83e981' ;;
      storage) EXPECTED_DIGEST='d0703297d0e3fb86340d92dfee386c98b9a48815ea93117e5c2d67a3e505ee8e' ;;
      televoting) EXPECTED_DIGEST='ad19940a504a5cc06fe7ec7ebf9f45c38c3e61c0ed44c310851bd734b648bad0' ;;
      *) abort 'Unexpected schema returned from owner/ACL catalog comparison' ;;
    esac
    if [ "$OWNER_DIGEST" = "$EXPECTED_DIGEST" ]; then
      echo "Hosted Nov20 vs Nov15 replay $SCHEMA owner/ACL/RLS: MATCH"
      HOSTED_MATCHES=$((HOSTED_MATCHES + 1))
    else
      echo "Hosted Nov20 vs Nov15 replay $SCHEMA owner/ACL/RLS: DIFFERENT (dated drift/role change requires review)"
      HOSTED_DRIFTS=$((HOSTED_DRIFTS + 1))
    fi
  done < <(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At \
    -v ON_ERROR_STOP=1 -c "
    SELECT n.nspname || '|' ||
           encode(sha256(convert_to(string_agg(
             c.relname || '|' || pg_get_userbyid(c.relowner) || '|' ||
             coalesce(c.relacl::text,'<default>') || '|' ||
             c.relrowsecurity::text || '|' ||
             c.relforcerowsecurity::text,
             E'\n' ORDER BY c.relname),'UTF8')),'hex')
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('auth','private','public','storage','televoting')
      AND c.relkind IN ('r','p')
    GROUP BY n.nspname ORDER BY n.nspname;")
  test "$((HOSTED_MATCHES + HOSTED_DRIFTS))" = 5 || abort 'Incomplete schema digest comparison'
  echo "Dated hosted-owner/ACL digest matches: $HOSTED_MATCHES / 5"
  echo 'NOTE: 2026-11-15 backup vs 2026-11-20 hosted drift cannot certify CURRENT ownership parity.'

  # Safely probe effective privilege and row-security activation while
  # impersonating nonprivileged roles. Fake JWT subject never corresponds
  # to a real user. No private rows are printed.
  for ROLE in anon authenticated; do
    PROBE=$(docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -At \
      -v ON_ERROR_STOP=1 -c "
        BEGIN;
        SET LOCAL ROLE $ROLE;
        SET LOCAL row_security = on;
        SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
        SELECT set_config('request.jwt.claim.role','$ROLE',true);
        SELECT CASE WHEN row_security_active('public.editions'::regclass)
                    THEN 'RLS_ON' ELSE 'RLS_OFF' END;
        SELECT CASE WHEN has_table_privilege(current_user,'auth.users','SELECT')
                    THEN 'AUTH_READ_UNSAFE' ELSE 'AUTH_READ_DENIED' END;
        SELECT CASE WHEN has_table_privilege(current_user,'auth.sessions','SELECT')
                    THEN 'SESSION_READ_UNSAFE' ELSE 'SESSION_READ_DENIED' END;
        SELECT CASE WHEN has_table_privilege(current_user,'public.editions','SELECT')
                    THEN 'PUBLIC_EDITION_READ_GRANTED' ELSE 'PUBLIC_EDITION_READ_MISSING' END;
        ROLLBACK;") || abort "Role-scoped catalog authorization probe failed for $ROLE"
    [[ "$PROBE" == *RLS_ON* ]] || abort "RLS not active for $ROLE"
    [[ "$PROBE" == *AUTH_READ_DENIED* && "$PROBE" == *SESSION_READ_DENIED* ]] || abort "Auth private-table grants unsafe for $ROLE"
    [[ "$PROBE" == *PUBLIC_EDITION_READ_GRANTED* ]] || abort "Expected public edition grant missing for $ROLE"
    echo "PASS: $ROLE role: RLS active, Auth tables not readable, edition read granted"
  done

  # Exercise an actual SELECT under both roles. These requests are limited
  # to a boolean and never print rows or make changes. An RLS expression
  # failing at runtime is a test failure rather than a false-positive PASS.
  for ROLE in anon authenticated; do
    docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -qAt \
      -v ON_ERROR_STOP=1 -c "
        BEGIN READ ONLY;
        SET LOCAL ROLE $ROLE;
        SET LOCAL row_security = on;
        SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
        SELECT set_config('request.jwt.claim.role','$ROLE',true);
        SELECT EXISTS(SELECT 1 FROM public.editions);
        ROLLBACK;" >"$REPORT/$ROLE-editions-read.private.log" 2>&1 \
      || abort "Isolated public edition RLS read failed for $ROLE; see private log"
    echo "PASS: $ROLE can execute read-only, RLS-governed public edition query"
  done

  # A real forbidden SELECT should fail with PostgreSQL permission SQLSTATE,
  # not just a table-privilege lookup. Log remains private, never published.
  for ROLE in anon authenticated; do
    if docker exec "$CONTAINER" psql -X -U supabase_admin -d postgres -qAt \
      -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "
        BEGIN READ ONLY;
        SET LOCAL ROLE $ROLE;
        SELECT 1 FROM auth.users LIMIT 0;" \
      >"$REPORT/$ROLE-auth-denial.private.log" 2>&1; then
      abort "UNSAFE: $ROLE could directly query auth.users"
    fi
    grep -Eq '42501|permission denied' "$REPORT/$ROLE-auth-denial.private.log" \
      || abort "Auth denial did not return expected privilege error for $ROLE"
    echo "PASS: $ROLE direct auth.users SELECT is denied by PostgreSQL"
  done
  echo 'ISOLATED OWNER/ACL REPLAY AND SCOPED AUTHORIZATION PROBES SUCCESSFUL'
  echo 'NOT CERTIFIED: global-role memberships/flags, Auth/Vault encryption roots,'
  echo 'full row-level authority matrix, exact hosted parity, migration deployment.'
else
  echo 'ISOLATED OWNER/ACL REPLAY BLOCKED'
  if grep -Eiq 'role .* does not exist' "$REPORT/restore.private.log"; then
    echo 'Blocked by an archived role absent from the restricted local role fixture'
  elif grep -Eiq 'extension .* is not available|could not open extension control' "$REPORT/restore.private.log"; then
    echo 'Blocked by a missing local PostgreSQL extension'
  elif grep -Eiq 'permission denied|must be owner' "$REPORT/restore.private.log"; then
    echo 'Blocked by local permissions/ownership prerequisite'
  elif grep -Eiq 'already exists' "$REPORT/restore.private.log"; then
    echo 'Blocked by an existing local object in the clean archive restore'
  else
    echo 'Blocked by a PostgreSQL restore error; details are private'
  fi
  echo 'Full private diagnostics were kept in the local recovery folder; do not share them.'
  exit 1
fi
echo 'Production was never contacted; disposable container will now be deleted.'
