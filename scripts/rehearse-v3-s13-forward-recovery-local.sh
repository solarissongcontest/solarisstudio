#!/usr/bin/env bash
# Rehearses S13 FORWARD RECOVERY CANDIDATE in disposable 127.0.0.1 PostgreSQL 17.
set -euo pipefail
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == YES ]] || { echo 'LOCAL rehearsal opt-in required' >&2; exit 2; }
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || { echo 'LOCAL target required' >&2; exit 2; }
[[ "${SOLARIS_LOCAL_DB_PORT:-}" =~ ^[0-9]{4,5}$ ]] || exit 2
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOSTADDR; do
  [[ -z "${!key:-}" ]] || { echo "Blocked inherited $key" >&2; exit 2; }
done
command -v psql >/dev/null
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="solaris_v3_s13_local_$$"
export PGHOST=127.0.0.1 PGHOSTADDR=127.0.0.1 PGPORT="$SOLARIS_LOCAL_DB_PORT" PGUSER=postgres
export PGPASSWORD="${SOLARIS_LOCAL_DB_PASSWORD:-postgres}" PGSSLMODE=disable PGCONNECT_TIMEOUT=5
unset PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS
args=(psql -w -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PGPORT" -U postgres)
master() { "${args[@]}" -d postgres "$@"; }
run() { "${args[@]}" -d "$db" "$@"; }
created=no
probe_db=""
cleanup() {
  if [[ -n "$probe_db" ]]; then
    master -c "drop database $probe_db with (force)" >/dev/null
  fi
  [[ "$created" == yes ]] || return 0
  master -c "drop database $db with (force)" >/dev/null
}
trap cleanup EXIT
run_in_db() {
  local selected_db="$1"
  shift
  "${args[@]}" -d "$selected_db" "$@"
}
master -c 'do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='"'"'anon'"'"') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'authenticated'"'"') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'service_role'"'"') then create role service_role nologin; end if;
end $roles$;' >/dev/null
master -c "create database $db" >/dev/null
created=yes
fixture="$root/docs/v3/recovery-candidates/fixtures/s13-production-dependency-subset-20261107.sql"
candidate="$root/docs/v3/recovery-candidates/forward-only-s13-foundation.sql"
[[ -f "$fixture" && -f "$candidate" ]] || exit 2
run -f "$fixture" >/dev/null

# Negative preflight cases must ABORT without silently applying any S13 DDL.
# Each uses a disposable clone of exactly the same observed dependency fixture.
expect_preflight_rejection() {
  local name="$1"
  local expected="$2"
  local expected_tables=0
  local output
  probe_db="${db}_${name}"
  master -c "create database $probe_db template $db" >/dev/null
  case "$name" in
    nohelper)
      run_in_db "$probe_db" -c "drop function private.studio2_request_is_service_role()" >/dev/null;;
    nogrant)
      run_in_db "$probe_db" -c "revoke usage on schema private from service_role" >/dev/null;;
    partialtable)
      run_in_db "$probe_db" -c "create table private.v3_migration_contracts(sentinel integer)" >/dev/null
      expected_tables=1;;
    partialrpc)
      run_in_db "$probe_db" -c "create function public.v3_register_migration_contract(text,integer,text,boolean,text,text)
        returns jsonb language sql as \$stub\$select '{}'::jsonb\$stub\$" >/dev/null;;
    *)
      echo "Invalid local negative scenario: $name" >&2; exit 2;;
  esac
  if output="$(run_in_db "$probe_db" -f "$candidate" 2>&1)"; then
    echo "Unsafe S13 candidate accepted negative preflight: $name" >&2; exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    echo "Unexpected S13 preflight failure in $name: $output" >&2; exit 1
  fi
  local count
  count="$(run_in_db "$probe_db" -c "select count(*) from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and
    c.relkind='r' and c.relname in ('v3_migration_contracts','v3_schema_compatibility',
    'v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs')")"
  [[ "$count" == "$expected_tables" ]] || {
    echo "S13 negative preflight left unintended tables for $name ($count)" >&2; exit 1;
  }
  master -c "drop database $probe_db with (force)" >/dev/null
  probe_db=""
}
expect_preflight_rejection nohelper 'authority helper absent'
expect_preflight_rejection nogrant 'lacks private schema usage'
expect_preflight_rejection partialtable 'target already exists'
expect_preflight_rejection partialrpc 'target already exists'

# Positive deployment rehearsal against the production-observed dependency subset.
run -f "$candidate" >/dev/null
tables="$(run -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relkind='r' and c.relname in
('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history',
'v3_backfill_jobs','v3_migration_parity_runs')")"
[[ "$tables" == 5 ]] || { echo "Expected 5 S13 tables, found $tables" >&2; exit 1; }
funcs="$(run -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('v3_schema_compatibility','v3_register_migration_contract','v3_claim_backfill',
'v3_checkpoint_backfill','v3_fail_backfill','v3_record_migration_parity',
'v3_set_schema_compatibility')")"
[[ "$funcs" == 7 ]] || { echo "Expected 7 S13 RPCs, found $funcs" >&2; exit 1; }
acl="$(run -c "select has_function_privilege('service_role','public.v3_register_migration_contract(text,integer,text,boolean,text,text)','EXECUTE')::text
||'|'||has_function_privilege('anon','public.v3_register_migration_contract(text,integer,text,boolean,text,text)','EXECUTE')::text
||'|'||has_function_privilege('authenticated','public.v3_register_migration_contract(text,integer,text,boolean,text,text)','EXECUTE')::text")"
[[ "$acl" == 'true|false|false' ]] || { echo "Unexpected ACL: $acl" >&2; exit 1; }

# Production-matched private-schema USAGE must NOT turn into private-table
# access or private helper execution for anon/authenticated/service_role.
privileged="$(run -c "select
 (has_schema_privilege('anon','private','USAGE'))::text || '|' ||
 (has_schema_privilege('authenticated','private','USAGE'))::text || '|' ||
 (has_schema_privilege('service_role','private','USAGE'))::text || '|' ||
 (has_function_privilege('service_role','private.studio2_request_is_service_role()','EXECUTE'))::text")"
[[ "$privileged" == "true|true|true|false" ]] || {
  echo "Private schema/helper privilege mismatch: $privileged" >&2; exit 1;
}
if run -c "set role authenticated; select * from private.v3_migration_contracts limit 1" >/dev/null 2>&1; then
  echo 'Authenticated browser role gained direct S13 registry read' >&2; exit 1
fi
if run -c "set role service_role; insert into private.v3_migration_contracts
 (migration_key,schema_version,rollback_mode,destructive,reason)
 values ('v3.s13.unsafe-direct-write',1,'forward_fix_only',false,'Forbidden')" >/dev/null 2>&1; then
  echo 'Service role gained direct unguarded S13 registry write' >&2; exit 1
fi
# Even a SQL service_role execution context is not authority if the request
# JWT is explicitly a browser role. (Local postgres session_user is artificial.)
if run -c "select set_config('request.jwt.claim.role','authenticated',false);
  set role service_role;
  select public.v3_register_migration_contract(
    'v3.s13.unauthorized-claim',1,'forward_fix_only',false,null,'Forbidden')" >/dev/null 2>&1; then
  echo 'S13 registry accepted browser JWT under service_role SQL execution' >&2; exit 1
fi

# The forward recovery must start at the STRICT canonical registration state.
# Reapplying the bundled SQL must refuse a preexisting S13 state, without changing it.
if run -f "$candidate" >/dev/null 2>&1; then
  echo 'Forward recovery unexpectedly re-ran over an existing S13 foundation' >&2; exit 1
fi
still="$(run -c "select count(*) from private.v3_migration_contracts")"
[[ "$still" == 2 ]] || { echo "Preexisting-table replay mutated registry: $still" >&2; exit 1; }
if run -c "select public.v3_register_migration_contract('20261019113000_v3_s6_notification_reconciliation',1,'forward_fix_only',false,null,'Local-only synthetic alias test')" >/dev/null 2>&1; then
  echo 'Strict registry still accepts filename-shaped aliases' >&2; exit 1
fi
replayed="$(run -c "select public.v3_register_migration_contract('v3.s13.strict-registration-restore',1,'forward_fix_only',false,null,'Restore strict semantic migration-key validation after the bounded S6 notification alias window.') ->> 'replayed'")"
[[ "$replayed" == true ]] || { echo 'Strict registration replay failed' >&2; exit 1; }
if run -c "set role anon; select public.v3_register_migration_contract('v3.s13.denied-test',1,'forward_fix_only',false,null,'Unauthorized')" >/dev/null 2>&1; then
 echo 'Anonymous user can register migration contracts' >&2; exit 1
fi
allowed="$(run -c "select set_config('request.jwt.claim.role','service_role',false);
select public.v3_register_migration_contract('v3.s13.local-positive-test',1,'forward_fix_only',false,null,'Local synthetic authorization check') ->> 'migrationKey'" | tail -n1)"
[[ "$allowed" == 'v3.s13.local-positive-test' ]] || { echo 'Service context cannot register' >&2; exit 1; }
echo 'PASS: S13 forward candidate against production-observed PG17.11 dependency subset, 4 preflight-negative tests, ACL/RPC negative authorization, strict keys, rollback and no-op replay refusal'
echo 'LIMITATION: this reproduces the observed S13 prerequisites only, NOT full hosted schema/data or release safety'
