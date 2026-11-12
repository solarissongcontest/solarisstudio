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
command -v python3 >/dev/null
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
reference_db=""
fault_sql=""
cleanup() {
  if [[ -n "$fault_sql" ]]; then rm -f -- "$fault_sql"; fi
  if [[ -n "$probe_db" ]]; then
    master -c "drop database $probe_db with (force)" >/dev/null
  fi
  if [[ -n "$reference_db" ]]; then
    master -c "drop database $reference_db with (force)" >/dev/null
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
    helperbody)
      run_in_db "$probe_db" -c "create or replace function private.studio2_request_is_service_role()
        returns boolean language sql stable set search_path=pg_catalog as \$drift\$ select true \$drift\$" >/dev/null;;
    helperacl)
      run_in_db "$probe_db" -c "grant execute on function private.studio2_request_is_service_role() to authenticated" >/dev/null;;
    helperowner)
      run_in_db "$probe_db" -c "alter function private.studio2_request_is_service_role() owner to authenticated" >/dev/null;;
    partialtable)
      run_in_db "$probe_db" -c "create table private.v3_migration_contracts(sentinel integer)" >/dev/null
      expected_tables=1;;
    partialrpc)
      run_in_db "$probe_db" -c "create function public.v3_register_migration_contract(text,integer,text,boolean,text,text)
        returns jsonb language sql as \$stub\$select '{}'::jsonb\$stub\$" >/dev/null;;
    partialindex)
      run_in_db "$probe_db" -c "create table private.v3_backfill_jobs_status_idx(sentinel integer)" >/dev/null;;
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
  # Retry after a failed preflight in the SAME disposable DB with a new psql session.
  if [[ "$name" == partialrpc ]]; then
    run_in_db "$probe_db" -c "drop function public.v3_register_migration_contract(text,integer,text,boolean,text,text)" >/dev/null
    run_in_db "$probe_db" -f "$candidate" >/dev/null
    retry_count="$(run_in_db "$probe_db" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
      ('v3_schema_compatibility','v3_register_migration_contract','v3_claim_backfill',
       'v3_checkpoint_backfill','v3_fail_backfill','v3_record_migration_parity',
       'v3_set_schema_compatibility')")"
    [[ "$retry_count" == 7 ]] || { echo "S13 retry did not recover 7 RPCs: $retry_count" >&2; exit 1; }
  fi
  master -c "drop database $probe_db with (force)" >/dev/null
  probe_db=""
}
expect_preflight_rejection nohelper 'authority helper absent'
expect_preflight_rejection nogrant 'lacks private schema usage'
expect_preflight_rejection helperbody 'authority helper differs from reviewed catalog'
expect_preflight_rejection helperacl 'authority helper differs from reviewed catalog'
expect_preflight_rejection helperowner 'authority helper differs from reviewed catalog'
expect_preflight_rejection partialtable 'target already exists'
expect_preflight_rejection partialrpc 'target already exists'
expect_preflight_rejection partialindex 'target already exists'

# Compare the recovered schema to the canonical original three-stage S13
# source sequence on the SAME production-observed dependency fixture.
# We compare pg_catalog object definitions, privileges, indexes and constraints,
# NOT production rows or migration-history identifiers.
reference_db="${db}_canonical"
master -c "create database $reference_db template $db" >/dev/null
base="$root/supabase/migrations"
for source_sql in \
  "$base/20261019111000_v3_s13_migration_hardening.sql" \
  "$base/20261019112900_v3_s13_migration_registration_context.sql" \
  "$base/20261019113300_v3_s13_strict_registration_restore.sql"; do
  [[ -f "$source_sql" ]] || exit 2
  run_in_db "$reference_db" -f "$source_sql" >/dev/null
done

# Positive deployment rehearsal against the production-observed dependency subset.
run -f "$candidate" >/dev/null

catalog_fingerprint() {
  local database="$1"
  run_in_db "$database" -c "with evidence(record) as (
    select 'rpc|' || n.nspname || '.' || p.proname || '|' ||
      pg_get_function_identity_arguments(p.oid) || '|' ||
      pg_get_functiondef(p.oid) || '|' || coalesce(p.proacl::text,'') ||
      '|' || p.prosecdef::text || '|' || p.provolatile::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('v3_schema_compatibility','v3_register_migration_contract','v3_claim_backfill',
       'v3_checkpoint_backfill','v3_fail_backfill','v3_record_migration_parity',
       'v3_set_schema_compatibility')
    union all
    select 'table|' || c.relname || '|' || c.relrowsecurity::text ||
      '|' || coalesce(c.relacl::text,'') || '|' || pg_get_userbyid(c.relowner)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname in
      ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history',
       'v3_backfill_jobs','v3_migration_parity_runs')
    union all
    select 'column|' || c.relname || '.' || a.attname || '|' ||
      a.attnum::text || '|' || format_type(a.atttypid,a.atttypmod) ||
      '|' || a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin,d.adrelid),'') ||
      '|' || a.attidentity::text || '|' || a.attgenerated::text
    from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname='private' and c.relkind='r' and a.attnum>0 and not a.attisdropped
      and c.relname in
      ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history',
       'v3_backfill_jobs','v3_migration_parity_runs')
    union all
    select 'constraint|' || c.relname || '.' || k.conname || '|' ||
      pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid=k.conrelid
      join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname in
      ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history',
       'v3_backfill_jobs','v3_migration_parity_runs')
    union all
    select 'index|' || c.relname || '|' || pg_get_indexdef(c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind in ('i','I') and
      (c.relname like 'v3_migration_%' or c.relname like 'v3_backfill_%' or
       c.relname like 'v3_schema_compatibility%')
  )
  select md5(string_agg(record,E'\\n' order by record)) from evidence"
}
# An aborted preflight never reaches DDL. Independently prove transaction loss
# AFTER DDL, and AFTER RPC/ACL/registry changes, on fresh observed-subset DBs.
# The sentinel is SYNTHETIC regression data/security, not claimed hosted data.
interruption_fingerprint() {
  run_in_db "$1" -c "with evidence(record) as (
    select 'schema|' || nspname || '|' || pg_get_userbyid(nspowner) || '|' || coalesce(nspacl::text,'')
      from pg_namespace where nspname in ('public','private')
    union all
    select 'relation|' || n.nspname || '.' || c.relname || '|' || c.relkind::text || '|' ||
      pg_get_userbyid(c.relowner) || '|' || coalesce(c.relacl::text,'') || '|' ||
      c.relrowsecurity::text || '|' || c.relforcerowsecurity::text
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
    union all
    select 'column|' || n.nspname || '.' || c.relname || '.' || a.attname || '|' ||
      a.attnum::text || '|' || format_type(a.atttypid,a.atttypmod) || '|' || a.attnotnull::text ||
      '|' || coalesce(pg_get_expr(d.adbin,d.adrelid),'') || '|' || a.attidentity::text || '|' || a.attgenerated::text
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped
    union all
    select 'function|' || pg_get_functiondef(p.oid) || '|' || pg_get_userbyid(p.proowner) || '|' || coalesce(p.proacl::text,'')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
    union all
    select 'constraint|' || n.nspname || '.' || c.relname || '|' || k.conname || '|' || pg_get_constraintdef(k.oid)
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private')
    union all
    select 'index|' || pg_get_indexdef(c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('i','I')
    union all
    select 'trigger|' || pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and not t.tgisinternal
    union all
    select 'policy|' || p.polname || '|' || p.polcmd::text || '|' || p.polpermissive::text || '|' ||
      p.polroles::text || '|' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || '|' || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
      from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private')
    union all
    select 'default-acl|' || pg_get_userbyid(d.defaclrole) || '|' || n.nspname || '|' || d.defaclobjtype::text || '|' || d.defaclacl::text
      from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private')
    union all
    select 'sentinel|' || to_jsonb(s)::text from public.s13_local_preserved s
  ) select md5(string_agg(record,E'\\n' order by record)) from evidence"
}

for interruption in after_tables before_commit; do
  probe_db="${db}_${interruption}"
  master -c "create database $probe_db" >/dev/null
  run_in_db "$probe_db" -f "$fixture" >/dev/null
  run_in_db "$probe_db" <<'SQL' >/dev/null
create table public.s13_local_preserved(id integer primary key, payload text not null);
insert into public.s13_local_preserved values (1, 'synthetic-existing-record'), (2, 'synthetic-private-record');
alter table public.s13_local_preserved enable row level security;
grant select on public.s13_local_preserved to authenticated;
create policy s13_local_read on public.s13_local_preserved for select to authenticated using (id=1);
create function private.s13_local_preservation_guard() returns trigger language plpgsql set search_path=pg_catalog as $guard$
begin raise exception 'Synthetic S13 baseline guard'; end
$guard$;
revoke all on function private.s13_local_preservation_guard() from public, anon, authenticated, service_role;
create trigger s13_local_preservation_guard before update or delete on public.s13_local_preserved
for each row execute function private.s13_local_preservation_guard();
SQL
  before_interruption="$(interruption_fingerprint "$probe_db")"
  fault_sql="$(mktemp)"
  # Edit only a temporary copy. The reviewed candidate stays byte-for-byte intact.
  python3 - "$candidate" "$fault_sql" "$interruption" <<'PY'
from pathlib import Path
import sys
source, output, point = sys.argv[1:]
sql = Path(source).read_text()
marker = "create or replace function public.v3_schema_compatibility(" if point == "after_tables" else "\ncommit;"
assert sql.count(marker) == 1, "S13 interruption marker changed; review fixture"
# The canonical core inserts migration-hardening before the first RPC DDL.
expected_rpcs, expected_records = (0, 1) if point == "after_tables" else (7, 2)
fault = f"""
do $local_s13_interrupt$
declare v_tables integer; v_rpcs integer; v_records integer;
begin
  select count(*) into v_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname like 'v3_%';
  select count(*) into v_rpcs from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'v3_%';
  select count(*) into v_records from private.v3_migration_contracts;
  if v_tables <> 5 or v_rpcs <> {expected_rpcs} or v_records <> {expected_records} then
    raise exception 'S13 interruption did not reach intended effects: %, %, %', v_tables, v_rpcs, v_records;
  end if;
  raise notice 'S13_LOCAL_INTERRUPTION_REACHED_{point}';
  perform pg_terminate_backend(pg_backend_pid());
end $local_s13_interrupt$;
"""
Path(output).write_text(sql.replace(marker, fault + marker, 1))
PY
  if interrupted_output="$(run_in_db "$probe_db" -f "$fault_sql" 2>&1)"; then
    echo "S13 interrupted session unexpectedly succeeded: $interruption" >&2; exit 1
  fi
  [[ "$interrupted_output" == *"S13_LOCAL_INTERRUPTION_REACHED_${interruption}"* &&
     "$interrupted_output" == *"terminating connection due to administrator command"* ]] || {
    echo "Unexpected S13 interruption outcome: $interrupted_output" >&2; exit 1;
  }
  rm -f -- "$fault_sql"
  fault_sql=""
  # New connections must see the original catalog/ACLs, RLS, trigger and row.
  after_interruption="$(interruption_fingerprint "$probe_db")"
  [[ "$before_interruption" == "$after_interruption" ]] || {
    echo "S13 interrupted transaction left committed effects: $interruption" >&2; exit 1;
  }
  run_in_db "$probe_db" -f "$candidate" >/dev/null
  [[ "$(catalog_fingerprint "$probe_db")" == "$(catalog_fingerprint "$db")" ]] || {
    echo "S13 original-candidate retry did not recover canonical objects: $interruption" >&2; exit 1;
  }
  [[ "$(run_in_db "$probe_db" -c "set role authenticated; select string_agg(payload,',' order by id) from public.s13_local_preserved")" == 'synthetic-existing-record' ]] || {
    echo 'S13 recovery changed baseline read policy/data' >&2; exit 1;
  }
  if guard_output="$(run_in_db "$probe_db" -c "update public.s13_local_preserved set payload='forbidden' where id=1" 2>&1)"; then
    echo 'S13 recovery removed existing baseline write guard' >&2; exit 1
  fi
  [[ "$guard_output" == *'Synthetic S13 baseline guard'* ]] || {
    echo "Unexpected baseline write rejection: $guard_output" >&2; exit 1;
  }
  [[ "$(run_in_db "$probe_db" -c 'select count(*) from private.v3_migration_contracts')" == 2 ]] || exit 1
  echo "PASS: S13 $interruption session loss rolled back; original recovery retried; baseline guard/data preserved"
  master -c "drop database $probe_db with (force)" >/dev/null
  probe_db=""
done

recovered_hash="$(catalog_fingerprint "$db")"
canonical_hash="$(catalog_fingerprint "$reference_db")"
[[ -n "$recovered_hash" && "$recovered_hash" == "$canonical_hash" ]] || {
  echo "S13 recovered object definition / ACL / constraint / index PARITY FAILED" >&2
  echo "Recovery: $recovered_hash; original source: $canonical_hash" >&2
  exit 1
}
# The transient migration-context audit registration is intentionally not
# claimed as executed by the forward-only candidate.
recovery_keys="$(run -c "select string_agg(migration_key,',' order by migration_key)
  from private.v3_migration_contracts")"
canonical_keys="$(run_in_db "$reference_db" -c "select string_agg(migration_key,',' order by migration_key)
  from private.v3_migration_contracts")"
[[ "$recovery_keys" == "v3.s13.migration-hardening,v3.s13.strict-registration-restore" ]] || {
  echo "Unexpected forward-only S13 recovery audit registry: $recovery_keys" >&2; exit 1;
}
[[ "$canonical_keys" == "v3.s13.migration-hardening,v3.s13.migration-registration-context,v3.s13.strict-registration-restore" ]] || {
  echo "Unexpected original staged-S13 audit registry: $canonical_keys" >&2; exit 1;
}
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

# Explicit original-source ACL/RLS posture: these five private S13 tables have
# no RLS policy, so no caller role may have direct CRUD table grants.
for s13_table in v3_migration_contracts v3_schema_compatibility \
  v3_schema_compatibility_history v3_backfill_jobs v3_migration_parity_runs; do
  for s13_role in anon authenticated service_role; do
    direct_acl="$(run -c "select
      has_table_privilege('$s13_role','private.$s13_table','SELECT')::text || '|' ||
      has_table_privilege('$s13_role','private.$s13_table','INSERT')::text || '|' ||
      has_table_privilege('$s13_role','private.$s13_table','UPDATE')::text || '|' ||
      has_table_privilege('$s13_role','private.$s13_table','DELETE')::text")"
    [[ "$direct_acl" == 'false|false|false|false' ]] || {
      echo "Private S13 ACL drift: $s13_role / $s13_table = $direct_acl" >&2; exit 1
    }
  done
done
s13_rls="$(run -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='private' and c.relkind='r'
 and c.relname in ('v3_migration_contracts','v3_schema_compatibility',
 'v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs')
 and (c.relrowsecurity or exists(select 1 from pg_policy p where p.polrelid=c.oid))")"
[[ "$s13_rls" == 0 ]] || {
 echo "Historical S13 RLS parity changed; review source authority: $s13_rls" >&2; exit 1
}

# The forward recovery must start at the STRICT canonical registration state.
# An already-present S13 foundation MUST be a non-mutating rejected retry.
# An unguarded successful rerun could replace privileged function definitions.
before_catalog="$(catalog_fingerprint "$db")"
before_registry="$(run -c "select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by migration_key),''))
  from private.v3_migration_contracts t")"
before_compat="$(run -c "select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by singleton),''))
  from private.v3_schema_compatibility t")"
if run -f "$candidate" >/dev/null 2>&1; then
  echo 'Forward recovery unexpectedly re-ran over an existing S13 foundation' >&2; exit 1
fi
after_catalog="$(catalog_fingerprint "$db")"
after_registry="$(run -c "select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by migration_key),''))
  from private.v3_migration_contracts t")"
after_compat="$(run -c "select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by singleton),''))
  from private.v3_schema_compatibility t")"
[[ "$before_catalog" == "$after_catalog" &&
   "$before_registry" == "$after_registry" &&
   "$before_compat" == "$after_compat" ]] || {
  echo 'S13 already-present retry altered catalog or registry/compatibility state' >&2
  exit 1
}
still="$(run -c "select count(*) from private.v3_migration_contracts")"
[[ "$still" == 2 ]] || { echo "Preexisting-table replay mutated registry: $still" >&2; exit 1; }
if run -c "select public.v3_register_migration_contract('20261019113000_v3_s6_notification_reconciliation',1,'forward_fix_only',false,null,'Local-only synthetic alias test')" >/dev/null 2>&1; then
  echo 'Strict registry still accepts filename-shaped aliases' >&2; exit 1
fi
replayed="$(run -c "select public.v3_register_migration_contract('v3.s13.strict-registration-restore',1,'forward_fix_only',false,null,'Restore strict semantic migration-key validation after the bounded S6 notification alias window.') ->> 'replayed'")"
[[ "$replayed" == true ]] || { echo 'Strict registration replay failed' >&2; exit 1; }
# Semantic version conflicts must be rejected without overwriting historical keys.
if version_conflict="$(run -c "select set_config('request.jwt.claim.role','service_role',false);
  select public.v3_register_migration_contract(
  'v3.s13.strict-registration-restore',2,'forward_fix_only',false,null,
  'Restore strict semantic migration-key validation after the bounded S6 notification alias window.')" 2>&1)"; then
  echo 'S13 accepted conflicting migration contract version' >&2; exit 1
fi
[[ "$version_conflict" == *'Migration contract semantic conflict'* ]] || {
  echo "S13 unexpected migration conflict result: $version_conflict" >&2; exit 1
}
strict_version="$(run -c "select schema_version from private.v3_migration_contracts
  where migration_key='v3.s13.strict-registration-restore'")"
[[ "$strict_version" == 1 ]] || { echo "S13 version was overwritten: $strict_version" >&2; exit 1; }

# Backfill worker retries must not silently change definition versions.
run -c "select set_config('request.jwt.claim.role','service_role',false);
  select public.v3_register_migration_contract(
  'v3.s13.local-version-probe',1,'forward_fix_only',false,
  'v3.s13.local-version-probe','Disposable local backfill version check')" >/dev/null
run -c "select set_config('request.jwt.claim.role','service_role',false);
  select public.v3_claim_backfill(
  'v3.s13.local-version-probe',1,10,'local-worker',60,null)" >/dev/null
if backfill_conflict="$(run -c "select set_config('request.jwt.claim.role','service_role',false);
  select public.v3_claim_backfill(
  'v3.s13.local-version-probe',2,10,'local-worker',60,null)" 2>&1)"; then
  echo 'S13 accepted conflicting backfill definition version' >&2; exit 1
fi
[[ "$backfill_conflict" == *'Backfill definition version conflict'* ]] || {
  echo "S13 unexpected backfill conflict result: $backfill_conflict" >&2; exit 1
}
backfill_version="$(run -c "select definition_version::text || '|' || status
  from private.v3_backfill_jobs where backfill_key='v3.s13.local-version-probe'")"
[[ "$backfill_version" == '1|running' ]] || {
  echo "S13 version conflict mutated backfill: $backfill_version" >&2; exit 1
}

if run -c "set role anon; select public.v3_register_migration_contract('v3.s13.denied-test',1,'forward_fix_only',false,null,'Unauthorized')" >/dev/null 2>&1; then
 echo 'Anonymous user can register migration contracts' >&2; exit 1
fi
allowed="$(run -c "select set_config('request.jwt.claim.role','service_role',false);
select public.v3_register_migration_contract('v3.s13.local-positive-test',1,'forward_fix_only',false,null,'Local synthetic authorization check') ->> 'migrationKey'" | tail -n1)"
[[ "$allowed" == 'v3.s13.local-positive-test' ]] || { echo 'Service context cannot register' >&2; exit 1; }
echo 'PASS: S13 forward candidate on observed PG17.11 dependencies; canonical 7-RPC + 5-table DDL/ACL/index/constraint parity; 8 drift-negative cases; strict security / replay denial'
echo 'LIMITATION: this tests only observed S13 dependencies, NOT full production schema/data. Original transient registration-context audit key is intentionally not claimed by this candidate.'
