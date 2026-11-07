#!/usr/bin/env bash
# Runs ORIGINAL S13 SQL only against a disposable 127.0.0.1 PostgreSQL database.
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
cleanup() {
  [[ "$created" == yes ]] || return 0
  master -c "drop database $db with (force)" >/dev/null
}
trap cleanup EXIT
master -c 'do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='"'"'anon'"'"') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'authenticated'"'"') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'service_role'"'"') then create role service_role nologin; end if;
end $roles$;' >/dev/null
master -c "create database $db" >/dev/null
created=yes
run -c "create schema private;
create function private.studio2_request_is_service_role() returns boolean
language sql stable as \$predicate\$
 select coalesce(current_setting('request.jwt.claim.role',true) = 'service_role',false)
\$predicate\$;" >/dev/null
base="$root/supabase/migrations"
framework="$base/20261019111000_v3_s13_migration_hardening.sql"
context="$base/20261019112900_v3_s13_migration_registration_context.sql"
strict="$base/20261019113300_v3_s13_strict_registration_restore.sql"
for f in "$framework" "$context" "$strict"; do [[ -f "$f" ]] || exit 2; done

run -f "$framework" >/dev/null
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

run -f "$context" >/dev/null
for pair in \
 '20261019113000_v3_s6_notification_reconciliation:v3.s6.notification-reconciliation' \
 '20261019113100_v3_s6_notification_reactivation:v3.s6.notification-reactivation' \
 '20261019113200_v3_s6_notification_failure_visibility:v3.s6.notification-failure-visibility'; do
  source_key="${pair%%:*}"; expected="${pair#*:}"
  actual="$(run -c "select public.v3_register_migration_contract('$source_key',1,'forward_fix_only',false,null,'Local-only synthetic alias test') ->> 'migrationKey'")"
  [[ "$actual" == "$expected" ]] || { echo "Alias mismatch: $actual" >&2; exit 1; }
done
run -f "$strict" >/dev/null
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
echo 'PASS: S13 original SQL: 5 tables, 7 RPCs, ACL, bounded alias window, strict restore, idempotence, role-denial'
echo 'LIMITATION: isolated synthetic DB is not hosted-equivalent and does not authorize production deployment'
