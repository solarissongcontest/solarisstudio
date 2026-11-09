#!/usr/bin/env bash
# S9/S10 staged forward-effect candidates against disposable 127.0.0.1 PG17.
# Source DB metadata is used for a minimal schema SHAPE only, not production rows.
set -euo pipefail
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == "YES" ]] || { echo "Local opt-in required" >&2; exit 2; }
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == "local" ]] || { echo "Local verification target required" >&2; exit 2; }
[[ "${SOLARIS_LOCAL_DB_PORT:-}" =~ ^[0-9]{4,5}$ ]] || exit 2
(( SOLARIS_LOCAL_DB_PORT >= 1024 && SOLARIS_LOCAL_DB_PORT <= 65535 )) || exit 2
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOSTADDR PGHOST; do
  [[ -z "${!key:-}" ]] || { echo "Blocked inherited $key" >&2; exit 2; }
done
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST=127.0.0.1 PGHOSTADDR=127.0.0.1 PGPORT="$SOLARIS_LOCAL_DB_PORT" PGUSER=postgres
export PGPASSWORD="${SOLARIS_LOCAL_DB_PASSWORD:-postgres}" PGSSLMODE=disable PGCONNECT_TIMEOUT=5
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE
command -v psql >/dev/null
db="solaris_v3_s9s10_local_$$"
psql_args=(psql -w -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PGPORT" -U postgres)
run() { "${psql_args[@]}" -d "$db" "$@"; }
admin() { "${psql_args[@]}" -d postgres "$@"; }
created=no
cleanup() {
  [[ "$created" == yes ]] || return 0
  admin -c "drop database $db with (force)" >/dev/null
}
trap cleanup EXIT

# Test roles only. Never any hosted Supabase account or service secrets.
admin -c 'do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='"'"'anon'"'"') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'authenticated'"'"') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='"'"'service_role'"'"') then create role service_role nologin; end if;
end $roles$;' >/dev/null
admin -c "create database $db" >/dev/null
created=yes

fixture="$root/docs/v3/recovery-candidates/fixtures/s9-s10-production-ledger-subset-20261107.sql"
index_stage="$root/docs/v3/recovery-candidates/forward-only-s9-indexes-concurrent-local.sql"
s9="$root/docs/v3/recovery-candidates/forward-only-s9-observability-local.sql"
s10="$root/docs/v3/recovery-candidates/forward-only-s10-sli-local.sql"
for path in "$fixture" "$index_stage" "$s9" "$s10"; do [[ -f "$path" ]] || exit 2; done
run -f "$fixture" >/dev/null

expect_reject() {
  local file="$1" message="$2"
  local output
  if output="$(run -f "$file" 2>&1)"; then
    echo "Unsafe candidate accepted invalid dependency state: $file" >&2; exit 1
  fi
  [[ "$output" == *"$message"* ]] || {
    echo "Unexpected failure while checking $file: $output" >&2; exit 1;
  }
}

# The S10 projection must never install without its S9 source and S13 owner.
expect_reject "$s10" "S10 blocked: canonical S9 projection missing"
# CREATE INDEX CONCURRENTLY must execute outside an explicit transaction and
# before the small S9 RPC-install transaction. A second pass must fail closed.
run -f "$index_stage" >/dev/null
expect_reject "$index_stage" "S9 index stage blocked: existing index/object"
run -f "$s9" >/dev/null
expect_reject "$s10" "S10 blocked: canonical S13 registry missing"

# Rehearse original S13 sources on this SEPARATE disposable test DB to provide
# a real registry, not a fake S13 function. This does not amend live history.
migrations="$root/supabase/migrations"
run -f "$migrations/20261019111000_v3_s13_migration_hardening.sql" >/dev/null
run -f "$migrations/20261019112900_v3_s13_migration_registration_context.sql" >/dev/null
run -f "$migrations/20261019113300_v3_s13_strict_registration_restore.sql" >/dev/null
run -f "$s10" >/dev/null

# Fail closed on accidental reapplication of the same object names.
expect_reject "$s9" "S9 blocked:"
expect_reject "$s10" "S10 blocked: existing SLI function"

counts="$(run -c "select
  (to_regprocedure('public.admin_system_observability_snapshot(integer)') is not null)::text || '|' ||
  (to_regprocedure('public.admin_system_v3_sli_snapshot(integer)') is not null)::text || '|' ||
  (to_regclass('public.studio2_operation_receipts_created_at_idx') is not null)::text || '|' ||
  (to_regclass('private.v3_domain_events_occurred_at_idx') is not null)::text || '|' ||
  (to_regclass('private.v3_domain_event_outbox_created_at_idx') is not null)::text")"
[[ "$counts" == "true|true|true|true|true" ]] || {
  echo "S9/S10 missing expected function/index: $counts" >&2; exit 1;
}

# Anonymous role has no EXECUTE. Authenticated role has EXECUTE but lacks
# 'system.read' in local capability stub; both must NOT access snapshots.
if run -c "set role anon; select public.admin_system_observability_snapshot(60)" >/dev/null 2>&1; then
  echo 'Anonymous role accessed S9' >&2; exit 1
fi
if run -c "set role authenticated; select public.admin_system_observability_snapshot(60)" >/dev/null 2>&1; then
  echo 'Authenticated without system.read accessed S9' >&2; exit 1
fi
if run -c "set role authenticated; select public.admin_system_v3_sli_snapshot(60)" >/dev/null 2>&1; then
  echo 'Authenticated without system.read accessed S10' >&2; exit 1
fi

# A synthetic authorized System viewer sees NUMERIC COUNTS, never rows,
# actor IDs, event payloads, operation results or raw error metadata.
safe="$(run -c "select set_config('request.jwt.claim.role','service_role',false);
 select
 ((a.s9->'operations'->>'total')::integer=2
  and (a.s9->'events'->>'total')::integer=1
  and (a.s9->'deliveries'->>'total')::integer=1
  and a.s9->'operations'->'errorCounts'->>'VERSION_CONFLICT'='1'
  and (a.s10->'operations'->>'total')::integer=2
  and (a.s10->'consequences'->>'completed')::integer=1
  and a.s10->'targets'='null'::jsonb
  and a.s10->'source'->>'projection'='admin_system_observability_snapshot'
  and position('CANARY_SECRET' in a.s9::text)=0
  and position('CANARY_SECRET' in a.s10::text)=0)::text
 from (select public.admin_system_observability_snapshot(60) s9,
              public.admin_system_v3_sli_snapshot(60) s10) a;" | tail -n1)"
[[ "$safe" == true ]] || {
  echo "S9/S10 counts, source binding or private-payload redaction FAILED: $safe" >&2; exit 1;
}

for query in \
  "select public.admin_system_observability_snapshot(0)" \
  "select public.admin_system_v3_sli_snapshot(1)"; do
  if run -c "select set_config('request.jwt.claim.role','service_role',false); $query" >/dev/null 2>&1; then
    echo "Invalid time window accepted: $query" >&2; exit 1
  fi
done

registered="$(run -c "select count(*) from private.v3_migration_contracts
  where migration_key='v3.s10.sli-snapshot'")"
[[ "$registered" == 1 ]] || {
  echo "S10 canonical S13 registration record missing: $registered" >&2; exit 1;
}

echo 'PASS: S9+S10 local PG17 recovery: concurrent independent 3-index stage, S13 dependency, 2 RPCs, authorization, window bounds, S9->S10 source binding and private-data canaries'
echo 'LIMITATION: observed ledger COLUMN subset and synthetic records only. No hosted-schema-equivalence, index lock-cost proof or migration-history repair.'
