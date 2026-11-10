#!/usr/bin/env bash
# LOCAL-ONLY destructive Archive effect-gap simulation and forward upgrade.
# Refuses all hosted Supabase URLs. No genuine contest records.
set -euo pipefail
fail() { echo "::error::$*" >&2; exit 1; }
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == YES ]] || fail 'Local opt-in required'
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || fail 'Local target required'
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_URL POSTGRES_URL PGSERVICE PGSERVICEFILE PGHOST PGHOSTADDR; do
  [[ -z "${!name:-}" ]] || fail "Forbidden inherited remote database config: $name"
done
command -v psql >/dev/null || fail 'Local psql missing'
command -v supabase >/dev/null || fail 'Supabase CLI missing'
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
eval "$(supabase status -o env)"
[[ -n "${API_URL:-}" && -n "${DB_URL:-}" ]] || fail 'Local Supabase not running'
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail 'Refusing hosted API URL';; esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail 'Refusing noncanonical hosted DB URL';;
esac
export SUPABASE_URL="$API_URL" E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local DATABASE_URL="$DB_URL"
candidate="$root/docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql"
[[ -f "$candidate" ]] || fail 'Missing reviewed candidate'
sql() { psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

# The clean main migration chain has Archive installed. Refusal must be
# explicit BEFORE the schema is downgraded in this disposable local DB.
if initial="$(sql -f "$candidate" 2>&1)"; then
  fail 'Candidate overwrote an already-installed Archive'
fi
[[ "$initial" == *"S14 Archive recovery BLOCKED:"* ]] ||
  fail "Unexpected initial refusal: $initial"

# Hash canonical S14 function definitions, grants, triggers and private gates.
# Only the scoped Archive identities are included, not unrelated schema.
fingerprint() {
  sql -c "with facts(kind,identity,definition) as (
    select 'function', n.nspname||'.'||p.proname||'('||
      pg_get_function_identity_arguments(p.oid)||')',
      pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||
      '|'||p.prosecdef::text||'|'||coalesce(p.proacl::text,'')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname=any(array[
       'v3_resolve_archived_edition_workflow_tasks',
       'v3_reconcile_resolved_task_notifications',
       'studio2_reconcile_all_organizer_tasks',
       'studio2_prune_stale_task_notifications',
       'v3_guard_archive_runtime_transition',
       'v3_edition_final_results_ready',
       'studio2_transition_edition_v3',
       'v3_archive_task_type_is_current_workflow',
       'v3_guard_archived_edition_task_resurrection',
       'v3_sync_archived_edition_legacy_status',
       'v3_guard_archived_legacy_edition_status',
       'v3_archived_workflow_row_edition',
       'v3_guard_archived_edition_workflow_write',
       'v3_arm_archive_runtime_transition_gate',
       'v3_televote_row_solaris_editions',
       'v3_guard_archived_televote_write',
       'v3_archive_task_reconciliation_gate_active'
    ]))
    or (n.nspname='public' and p.proname=any(array[
       'studio2_transition_edition_v3','studio2_process_edition_domain_event'
    ]))
    union all
    select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
      pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname=any(array[
       'v3_guard_archive_runtime_transition',
       'v3_guard_archive_runtime_update',
       'v3_guard_archive_runtime_insert',
       'v3_guard_archive_runtime_delete',
       'v3_guard_archived_edition_task_resurrection',
       'v3_guard_archived_edition_workflow_write',
       'v3_guard_archived_televote_write',
       'v3_sync_archived_edition_legacy_status',
       'v3_guard_archived_legacy_edition_status'
    ])
    union all
    select 'table',n.nspname||'.'||c.relname,
       pg_get_userbyid(c.relowner)||'|'||coalesce(c.relacl::text,'')||
       '|'||c.relrowsecurity::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r'
      and c.relname in ('v3_archive_runtime_transition_gates',
                        'v3_archive_task_reconciliation_gates')
  )
  select kind||'|'||identity||'|'||md5(definition)
  from facts order by kind,identity;"
}

# Explicit optional seam: S13 must be recovered BEFORE restoring Archive.
# All simulated schema removals are restricted to disposable local Supabase.
s13_fingerprint() {
  sql -c "with facts(kind,identity,definition) as (
    select 'function', n.nspname||'.'||p.proname||'('||
      pg_get_function_identity_arguments(p.oid)||')',
      pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||
      '|'||p.prosecdef::text||'|'||coalesce(p.proacl::text,'')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'v3_schema_compatibility', 'v3_register_migration_contract',
      'v3_claim_backfill', 'v3_checkpoint_backfill', 'v3_fail_backfill',
      'v3_record_migration_parity', 'v3_set_schema_compatibility'])
    union all
    select 'table',n.nspname||'.'||c.relname,
      pg_get_userbyid(c.relowner)||'|'||c.relrowsecurity::text||
      '|'||coalesce(c.relacl::text,'')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r' and c.relname=any(array[
      'v3_migration_contracts','v3_schema_compatibility',
      'v3_schema_compatibility_history','v3_backfill_jobs',
      'v3_migration_parity_runs'])
    union all
    select 'column',n.nspname||'.'||c.relname||'.'||a.attname,
      format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||
      '|'||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')||'|'||
      a.attidentity::text
    from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
    where n.nspname='private' and c.relkind='r'
      and a.attnum>0 and not a.attisdropped
      and c.relname=any(array['v3_migration_contracts',
       'v3_schema_compatibility','v3_schema_compatibility_history',
       'v3_backfill_jobs','v3_migration_parity_runs'])
    union all
    select 'constraint',n.nspname||'.'||c.relname||'.'||co.conname,
      pg_get_constraintdef(co.oid)
    from pg_constraint co join pg_class c on c.oid=co.conrelid
      join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname=any(array[
      'v3_migration_contracts','v3_schema_compatibility',
      'v3_schema_compatibility_history','v3_backfill_jobs',
      'v3_migration_parity_runs'])
    union all
    select 'index',ni.nspname||'.'||ci.relname,pg_get_indexdef(ci.oid)
    from pg_index ix join pg_class ci on ci.oid=ix.indexrelid
      join pg_namespace ni on ni.oid=ci.relnamespace
      join pg_class ct on ct.oid=ix.indrelid
    where ni.nspname='private' and ct.relname=any(array[
      'v3_migration_contracts','v3_schema_compatibility',
      'v3_schema_compatibility_history','v3_backfill_jobs',
      'v3_migration_parity_runs'])
  )
  select kind||'|'||identity||'|'||md5(definition)
  from facts order by kind,identity;"
}
include_s13="${SOLARIS_INCLUDE_S13_FORWARD_RECOVERY:-NO}"
[[ "$include_s13" == YES || "$include_s13" == NO ]] ||
  fail "Unknown S13 integration rehearsal mode: $include_s13"
if [[ "$include_s13" == YES ]]; then
  s13_candidate="$root/docs/v3/recovery-candidates/forward-only-s13-foundation.sql"
  [[ -f "$s13_candidate" ]] || fail "S13 candidate missing from exact-SHA branch"
  before_s13="$(s13_fingerprint)"
  [[ -n "$before_s13" ]] || fail "Empty S13 source catalog fingerprint"
  [[ "$(sql -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('v3_schema_compatibility','v3_register_migration_contract','v3_claim_backfill','v3_checkpoint_backfill','v3_fail_backfill','v3_record_migration_parity','v3_set_schema_compatibility')")" == 7 ]] ||
    fail "Expected all seven canonical S13 RPCs before simulating S13 gap"
fi

before="$(fingerprint)"
[[ -n "$before" ]] || fail 'Missing canonical Archive catalog fingerprint'
echo "Canonical S14 scoped catalog fingerprint: $before"

# Drop ONLY listed Archive effect objects, with NO CASCADE, in local SQL.
# Any unexpected dependency prevents the simulated upgrade; never bypass it.
sql <<'SQL'
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $drop_archive_triggers$
declare item record;
begin
  for item in select n.nspname,c.relname,t.tgname
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname=any(array[
      'v3_guard_archive_runtime_transition',
      'v3_guard_archive_runtime_update',
      'v3_guard_archive_runtime_insert',
      'v3_guard_archive_runtime_delete',
      'v3_guard_archived_edition_task_resurrection',
      'v3_guard_archived_edition_workflow_write',
      'v3_guard_archived_televote_write',
      'v3_sync_archived_edition_legacy_status',
      'v3_guard_archived_legacy_edition_status'
    ])
  loop
    execute format('drop trigger %I on %I.%I',
      item.tgname,item.nspname,item.relname);
  end loop;
end
$drop_archive_triggers$;
drop function if exists public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text);
drop function if exists private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text);
drop function if exists public.studio2_process_edition_domain_event(uuid,text,text);
drop function if exists private.v3_guard_archive_runtime_transition();
drop function if exists private.v3_guard_archived_edition_workflow_write();
drop function if exists private.v3_guard_archived_edition_task_resurrection();
drop function if exists private.v3_guard_archived_televote_write();
drop function if exists private.v3_resolve_archived_edition_workflow_tasks(uuid);
drop function if exists private.v3_reconcile_resolved_task_notifications(uuid);
drop function if exists private.v3_edition_final_results_ready(uuid);
drop function if exists private.v3_archive_task_type_is_current_workflow(text);
drop function if exists private.v3_sync_archived_edition_legacy_status();
drop function if exists private.v3_guard_archived_legacy_edition_status();
drop function if exists private.v3_archived_workflow_row_edition(jsonb);
drop function if exists private.v3_arm_archive_runtime_transition_gate(uuid);
drop function if exists private.v3_televote_row_solaris_editions(text,jsonb);
drop function if exists private.v3_archive_task_reconciliation_gate_active(uuid);
drop table if exists private.v3_archive_runtime_transition_gates;
drop table if exists private.v3_archive_task_reconciliation_gates;
-- Delete ONLY local semantic records corresponding to the removed effects.
-- Supabase CLI migration-history records are NEVER edited or forged.
delete from private.v3_migration_contracts where migration_key=any(array[
 'v3.s14.archive-consequence-reconciliation',
 'v3.s14.transition-http409',
 'v3.s14.archive-task-registry-alignment',
 'v3.s14.archive-invariant-forward-fixes',
 'v3.s14.archive-guard-authority-forward-fix',
 'v3.s14.failed-task-delivery-evidence',
 'v3.s14.final-results-readiness-hardening',
 'v3.s14.resolved-task-delivery-reconciliation',
 'v3.s14.archive-runtime-update-guard',
 'v3.s14.task-reconciliation-service-boundary',
 'v3.s14.archive-reconciliation-convergence'
]);
commit;
SQL

if [[ "$include_s13" == YES ]]; then
  # Strip only explicitly named S13 effects from this local fixture.
  # No CASCADE, no hosted SQL, and no Supabase CLI migration history writes.
  sql <<'LOCAL_S13_GAP'
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
drop function public.v3_schema_compatibility(integer);
drop function public.v3_register_migration_contract(text,integer,text,boolean,text,text);
drop function public.v3_claim_backfill(text,integer,integer,text,integer,bigint);
drop function public.v3_checkpoint_backfill(text,text,jsonb,integer,integer,text,boolean);
drop function public.v3_fail_backfill(text,text,text);
drop function public.v3_record_migration_parity(text,text,bigint,bigint,bigint,bigint,integer,jsonb);
drop function public.v3_set_schema_compatibility(integer,integer,integer,text,text,text);
drop table private.v3_migration_parity_runs;
drop table private.v3_backfill_jobs;
drop table private.v3_schema_compatibility_history;
drop table private.v3_schema_compatibility;
drop table private.v3_migration_contracts;
commit;
LOCAL_S13_GAP

  if blocked="$(sql -f "$candidate" 2>&1)"; then
    fail 'S14 candidate accepted missing S13 governance'
  fi
  [[ "$blocked" == *"S14 Archive recovery BLOCKED: S13 governance foundation absent"* ]] ||
    fail "S14 missing-S13 check refused for unexpected reason: $blocked"

  sql -f "$s13_candidate" >/dev/null
  after_s13="$(s13_fingerprint)"
  if [[ "$before_s13" != "$after_s13" ]]; then
    echo 'S13 original/recovered catalog hashes differ:' >&2
    diff -u <(printf '%s\n' "$before_s13") <(printf '%s\n' "$after_s13") >&2 || true
    fail 'S13 forward-recovery catalog parity failed in integrated rehearsal'
  fi

  # The simulated S13 drop loses other domains' semantic registrations:
  # this is an intentionally narrow effect-gap simulation, NOT live history.
  [[ "$(sql -c "select count(*) from private.v3_migration_contracts")" == 2 ]] ||
    fail 'S13 strict foundation expected exactly two forward semantic registrations'
  echo 'PASS: S13 restored before S14; seven RPCs, five tables, ACL/index/constraint catalog parity'
fi

[[ "$(sql -c "select
 (to_regclass('private.v3_migration_contracts') is not null and
  to_regclass('public.studio2_edition_runtime') is not null and
  to_regclass('public.studio2_organizer_tasks') is not null and
  to_regclass('private.v3_domain_event_outbox') is not null)::text")" == true ]] ||
 fail 'Simulated local gap damaged a shared foundation'

# Hosted catalog compatibility negative control: weaken a required column
# in THIS disposable local database ONLY, prove the preflight blocks the
# Archive install, then restore exact type/nullability before normal replay.
sql -c "alter table public.studio2_edition_runtime alter column updated_at drop not null" >/dev/null
if drift="$(sql -f "$candidate" 2>&1)"; then
  fail 'Archive recovery accepted hosted critical column nullability drift'
fi
[[ "$drift" == *"S14 Archive recovery BLOCKED: hosted critical column drift public.studio2_edition_runtime.updated_at"* ]] ||
  fail "Archive column-shape refusal did not identify the deliberate drift: $drift"
[[ "$(sql -c "select (to_regclass('private.v3_archive_runtime_transition_gates') is null)::text")" == true ]] ||
  fail 'Rejected critical-column drift left behind partial Archive DDL'
sql -c "alter table public.studio2_edition_runtime alter column updated_at set not null" >/dev/null

# Dependency failure injection: a required upstream helper must be checked
# before the first Archive DDL. Rename only inside disposable local Supabase.
# This is a reversible negative test, not a production operation.
gap_before="$(fingerprint)"
sql -c "alter function private.studio2_task_recipient_eligible(uuid,uuid) rename to studio2_task_recipient_eligible_s06_missing" >/dev/null
if missing_rpc="$(sql -f "$candidate" 2>&1)"; then
  fail 'Archive recovery accepted a missing upstream RPC'
fi
[[ "$missing_rpc" == *"S14 Archive recovery BLOCKED: required upstream RPC missing private.studio2_task_recipient_eligible(uuid,uuid)"* ]] ||
  fail "Missing upstream RPC refused for an unexpected reason: $missing_rpc"
[[ "$(sql -c "select (to_regprocedure('private.v3_resolve_archived_edition_workflow_tasks(uuid)') is null and to_regclass('private.v3_archive_runtime_transition_gates') is null)::text")" == true ]] ||
  fail 'Missing upstream dependency left partial Archive DDL'
sql -c "alter function private.studio2_task_recipient_eligible_s06_missing(uuid,uuid) rename to studio2_task_recipient_eligible" >/dev/null
[[ "$(fingerprint)" == "$gap_before" ]] ||
  fail 'Missing dependency failure changed the Archive catalog'

# Interrupt after the first genuine Archive CREATE FUNCTION and REVOKE in a
# single transaction, then restart against the very same local database.
# Failure must roll back all new DDL and leave S13/upstream effects untouched.
injected_sql="$(mktemp)"
trap 'rm -f "$injected_sql"' EXIT
node - "$candidate" "$injected_sql" <<'S06_INJECT'
const fs = require('node:fs');
const [candidatePath, outputPath] = process.argv.slice(2);
const source = fs.readFileSync(candidatePath, 'utf8');
const anchor = 'revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)\n  from public, anon, authenticated;';
if (!source.includes(anchor)) throw new Error('S06 post-DDL failure injection anchor missing');
const failpoint = "do $s06_failure$ begin raise exception 'S06 injected post-DDL failure'; end; $s06_failure$;";
fs.writeFileSync(outputPath, source.replace(anchor, anchor + '\n' + failpoint + '\n'));
S06_INJECT
if interrupted="$(sql -f "$injected_sql" 2>&1)"; then
  fail 'S06 injected transaction interruption unexpectedly committed'
fi
[[ "$interrupted" == *"S06 injected post-DDL failure"* ]] ||
  fail "Failure injection stopped for an unexpected reason: $interrupted"
[[ "$(fingerprint)" == "$gap_before" ]] ||
  fail 'Interrupted Archive recovery left partial DDL or changed upstream catalog'
[[ "$(sql -c "select (to_regprocedure('private.v3_resolve_archived_edition_workflow_tasks(uuid)') is null and to_regclass('private.v3_archive_runtime_transition_gates') is null)::text")" == true ]] ||
  fail 'Interrupted Archive recovery left its first function or gate installed'
echo 'PASS: missing upstream RPC failed before mutation; injected post-DDL interruption rolled back; same-database restart is safe'

sql -f "$candidate" >/dev/null
after="$(fingerprint)"
if [[ "$before" != "$after" ]]; then
  echo "Archive catalog mismatch (object hashes only):" >&2
  diff -u <(printf '%s\n' "$before") <(printf '%s\n' "$after") >&2 || true
  fail "Archive recovery catalog parity failed"
fi

[[ "$(sql -c "select count(*) from private.v3_migration_contracts where migration_key='v3.s14.archive-forward-effect-recovery'")" == 1 ]] ||
 fail 'Missing new forward-only semantic recovery marker'
[[ "$(sql -c "select count(*) from private.v3_migration_contracts where migration_key=any(array[
 'v3.s14.archive-consequence-reconciliation','v3.s14.transition-http409',
 'v3.s14.archive-task-registry-alignment','v3.s14.archive-invariant-forward-fixes',
 'v3.s14.archive-guard-authority-forward-fix','v3.s14.failed-task-delivery-evidence',
 'v3.s14.final-results-readiness-hardening',
 'v3.s14.resolved-task-delivery-reconciliation',
 'v3.s14.archive-runtime-update-guard',
 'v3.s14.task-reconciliation-service-boundary',
 'v3.s14.archive-reconciliation-convergence'
])")" == 0 ]] || fail 'Forward recovery forged historical semantic registration'

if replay="$(sql -f "$candidate" 2>&1)"; then
 fail 'Archive forward recovery unexpectedly accepted duplicate application'
fi
[[ "$replay" == *"S14 Archive recovery BLOCKED:"* ]] ||
 fail "Duplicate apply refused for unexpected reason: $replay"
[[ "$(fingerprint)" == "$before" ]] ||
 fail 'Duplicate-refusal modified Archive catalog'
echo 'PASS: eleven-stage S14 forward-only recovery matches canonical local functions, privileges, triggers and gate-table catalog; S13 required; replays refused; eleven historical keys not forged'
echo 'LIMITATION: simulated local Archive gaps do NOT establish hosted-head-equivalent production upgrade safety'
