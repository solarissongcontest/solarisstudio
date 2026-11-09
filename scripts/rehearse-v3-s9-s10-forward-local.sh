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
expect_reject "$s9" "S9 blocked: required concurrent index not installed"
# Simulate an interrupted/manual first-index install. The staged preflight must
# refuse the name collision *before* creating the other two indexes.
run -c "create index studio2_operation_receipts_created_at_idx on public.studio2_operation_receipts (created_at desc)" >/dev/null
expect_reject "$index_stage" "S9 index stage blocked: existing index/object"
partial="$(run -c "select
  (to_regclass('private.v3_domain_events_occurred_at_idx') is null
   and to_regclass('private.v3_domain_event_outbox_created_at_idx') is null)::text")"
[[ "$partial" == true ]] || { echo 'Partial-index preflight mutated other ledgers' >&2; exit 1; }
# A human-reviewed local reconciliation drops the synthetic blocker. Never
# automate dropping a possibly-live invalid production index.
run -c "drop index public.studio2_operation_receipts_created_at_idx" >/dev/null
# CREATE INDEX CONCURRENTLY must execute outside an explicit transaction and
# before the small S9 RPC-install transaction. A second pass must fail closed.
run -f "$index_stage" >/dev/null
# Check exact table, access method, leading key order, validity and readiness;
# checking mere index-name existence would accept an unrelated/invalid object.
index_contract="$(run -c "select (
  select count(*)=3 from (
    values
      ('public.studio2_operation_receipts_created_at_idx',
       'public.studio2_operation_receipts',
       array['created_at']::text[], array[3]::integer[]),
      ('private.v3_domain_events_occurred_at_idx',
       'private.v3_domain_events',
       array['occurred_at','id']::text[], array[3,0]::integer[]),
      ('private.v3_domain_event_outbox_created_at_idx',
       'private.v3_domain_event_outbox',
       array['created_at','event_id','consumer_key']::text[],
       array[3,0,0]::integer[])
  ) spec(idx,tbl,key_names,sort_flags)
  join pg_class c on c.oid=to_regclass(spec.idx)
  join pg_index i on i.indexrelid=c.oid
  join pg_am am on am.oid=c.relam
  where i.indrelid=to_regclass(spec.tbl)
    and i.indisvalid and i.indisready and not i.indisunique
    and i.indnkeyatts=array_length(spec.key_names,1)
    and i.indnatts=i.indnkeyatts and am.amname='btree'
    and i.indpred is null and i.indexprs is null
    and (select array_agg(a.attname order by key_number)
      from generate_series(0,i.indnkeyatts-1) keys(key_number)
      join pg_attribute a on a.attrelid=i.indrelid
       and a.attnum=i.indkey[key_number])=spec.key_names
    and (select array_agg(i.indoption[key_number]::integer order by key_number)
      from generate_series(0,i.indnkeyatts-1) keys(key_number))=spec.sort_flags
  )::text")"
if [[ "$index_contract" != true ]]; then
  echo 'S9 concurrent index catalog contract FAILED; local-only catalog detail:' >&2
  run -c "select i.indexrelid::regclass, i.indrelid::regclass,
    am.amname, i.indnkeyatts, i.indnatts, i.indisvalid, i.indisready,
    i.indkey::text, i.indoption::text,
    pg_get_indexdef(i.indexrelid), pg_get_indexdef(i.indexrelid,1,true),
    pg_get_indexdef(i.indexrelid,2,true), pg_get_indexdef(i.indexrelid,3,true)
    from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_am am on am.oid=c.relam
    where i.indexrelid in (
      to_regclass('public.studio2_operation_receipts_created_at_idx'),
      to_regclass('private.v3_domain_events_occurred_at_idx'),
      to_regclass('private.v3_domain_event_outbox_created_at_idx')
    ) order by 1" >&2
  exit 1
fi
expect_reject "$index_stage" "S9 index stage blocked: existing index/object"

# A valid and ready index with the right NAME but wrong KEY order/identity must
# NOT pass S9's forward preflight. This is synthetic local catalog damage only;
# never automate a production DROP INDEX after a partial concurrent build.
run -c "drop index private.v3_domain_events_occurred_at_idx" >/dev/null
run -c "create index v3_domain_events_occurred_at_idx on private.v3_domain_events (id)" >/dev/null
expect_reject "$s9" "S9 blocked: incompatible concurrent index identity"
no_s9_from_bad_index="$(run -c "select (to_regprocedure('public.admin_system_observability_snapshot(integer)') is null)::text")"
[[ "$no_s9_from_bad_index" == true ]] || {
  echo 'S9 mutated catalog despite wrong-shaped index rejection' >&2; exit 1;
}
run -c "drop index private.v3_domain_events_occurred_at_idx" >/dev/null
run -c "create index concurrently v3_domain_events_occurred_at_idx on private.v3_domain_events (occurred_at desc, id)" >/dev/null
run -f "$s9" >/dev/null
expect_reject "$s10" "S10 blocked: canonical S13 registry missing"

# Rehearse original S13 sources on this SEPARATE disposable test DB to provide
# a real registry, not a fake S13 function. This does not amend live history.
migrations="$root/supabase/migrations"
run -f "$migrations/20261019111000_v3_s13_migration_hardening.sql" >/dev/null
run -f "$migrations/20261019112900_v3_s13_migration_registration_context.sql" >/dev/null
run -f "$migrations/20261019113300_v3_s13_strict_registration_restore.sql" >/dev/null
run -f "$s10" >/dev/null

# The exact candidate must reject reapplication without changing objects,
# migration registration, or index/catalog definitions (fail-closed idempotency).
fingerprint() {
  run -c "select md5(
    coalesce((select string_agg(pg_get_indexdef(i.indexrelid), E'\\n' order by c.relname)
      from pg_index i join pg_class c on c.oid=i.indexrelid
      where c.oid in (
        to_regclass('public.studio2_operation_receipts_created_at_idx'),
        to_regclass('private.v3_domain_events_occurred_at_idx'),
        to_regclass('private.v3_domain_event_outbox_created_at_idx')
      )), '') ||
    coalesce((select string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.proname)
      from pg_proc p where p.oid in (
        to_regprocedure('public.admin_system_observability_snapshot(integer)'),
        to_regprocedure('public.admin_system_v3_sli_snapshot(integer)')
      )), '') ||
    (select count(*)::text from private.v3_migration_contracts
      where migration_key='v3.s10.sli-snapshot')
  )"
}
before_replay="$(fingerprint)"
expect_reject "$s9" "S9 blocked:"
expect_reject "$s10" "S10 blocked: existing SLI function"
expect_reject "$index_stage" "S9 index stage blocked: existing index/object"
after_replay="$(fingerprint)"
[[ "$before_replay" == "$after_replay" ]] || {
  echo 'S9/S10 failed-closed rerun changed catalog or registry' >&2; exit 1;
}

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

echo 'PASS: S9+S10 local PG17 recovery: partial-index collision/reconciliation, 3 exact valid/ready index contracts, S13 dependency, 2 RPCs, non-mutating reruns, authorization, window bounds, S9->S10 source binding and private-data canaries'
echo 'LIMITATION: observed ledger COLUMN subset and synthetic records only. No hosted-schema-equivalence, index lock-cost proof or migration-history repair.'
