# Sourced only by the existing networkless PG17.11 recovery workflow.
# Never a production migration runner. Synthetic fixture bootstrap is separate
# from the observed NONSUPERUSER recovery operator.
[[ "${cid:-}" =~ ^[0-9a-f]{64}$ ]] || exit 1
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]] || exit 1
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]] || exit 1
operator_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_operator_baseline "$@"; }
bootstrap_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U solaris_recovery_bootstrap -d recovery_operator_baseline "$@"; }
node scripts/stage-v3-hosted-result-sync.mjs > /tmp/observed-sync.sql
operator_sql -f - < /tmp/observed-sync.sql
node scripts/stage-v3-public-snapshot-recovery.mjs --local-helpers > /tmp/pub-helpers.sql
operator_sql -f - < /tmp/pub-helpers.sql
node scripts/stage-v3-public-snapshot-recovery.mjs --local-qualification-helpers > /tmp/qualification.sql
operator_sql -f - < /tmp/qualification.sql
operator_sql -f - < /tmp/auth-uid-authority-local.sql
operator_sql -f - < /tmp/round-invalidation-authority-local.sql
operator_sql -f - < .github/tests/v3-atomic-observed-grants-local.sql
operator_sql -c "grant truncate,references,trigger on table public.studio2_result_operations to service_role; grant truncate,references,trigger,maintain on table public.studio2_show_publication_controls to service_role; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
node scripts/stage-v3-recovery-owner-local.mjs > /tmp/owner-profile.sql
operator_sql -f - < /tmp/owner-profile.sql
[[ "$(operator_sql -c "select (not rolsuper and rolbypassrls)::text from pg_roles where rolname=current_user")" == true ]] || exit 1
# Compare full LOCAL synthetic schema and rows after denial, not only object counts.
operator_state_digest() {
  docker exec "$cid" pg_dump -U postgres -d "${1:-recovery_operator_baseline}" --no-comments --restrict-key=ObservedOwnerLocalOnly |
    sha256sum | awk '{print $1}'
}
operator_apply() {
  local owner_candidate="$1" owner_before owner_after
  owner_before="$(operator_state_digest)"
  python3 - "$owner_candidate" > /tmp/owner-interrupted.sql <<'PYOWNER'
import re,sys
source=open(sys.argv[1]).read()
ends=list(re.finditer(r'(?im)^commit;\s*$',source))
if not ends: raise SystemExit('No transactional candidate terminator')
end=ends[-1].start()
print(source[:end]+"do $stop$ begin raise exception 'SOLARIS_OWNER_INTERRUPTION'; end $stop$;\n"+source[end:])
PYOWNER
  if operator_sql -f - < /tmp/owner-interrupted.sql > /tmp/owner-interrupted.log 2>&1; then
    echo 'ERROR: interrupted owner installation committed'; exit 1
  fi
  if ! grep -Fq 'SOLARIS_OWNER_INTERRUPTION' /tmp/owner-interrupted.log; then
    echo "ERROR: unexpected owner interruption failure in $owner_candidate" >&2
    tail -n 35 /tmp/owner-interrupted.log >&2
    exit 1
  fi
  [[ "$(operator_state_digest)" == "$owner_before" ]] || { echo 'Owner interruption changed schema/data'; exit 1; }
  operator_sql -f - < "$owner_candidate"
  owner_after="$(operator_state_digest)"
  if operator_sql -f - < "$owner_candidate" > /tmp/owner-duplicate.log 2>&1; then
    echo 'ERROR: duplicate recovery unexpectedly accepted'; exit 1
  fi
  # The country-account migration's explicit contract-registry preflight
  # rejects a second install with a distinct diagnostic. Require that exact
  # statement for this one migration rather than masking unrelated SQL errors.
  if [[ "$owner_candidate" == supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql ]]; then
    grep -Fq 'S16 country account cutover missing owner, registry or uninstalled source contract' /tmp/owner-duplicate.log || {
      echo 'ERROR: country cutover duplicate refusal had unexpected cause' >&2
      cat /tmp/owner-duplicate.log >&2; exit 1
    }
  else
    grep -Eq 'already|partial|drift|requires|precondition' /tmp/owner-duplicate.log || {
      echo "ERROR: unexpected duplicate refusal for $owner_candidate" >&2
      cat /tmp/owner-duplicate.log >&2; exit 1
    }
  fi
  [[ "$(operator_state_digest)" == "$owner_after" ]] || { echo 'Duplicate owner install changed schema/data'; exit 1; }
}
operator_apply docs/v3/recovery-candidates/forward-only-s13-foundation.sql
# Rehearse the REAL production frontier: these two S14 effects were installed
# separately, so the residual candidate must preserve them byte-for-byte.
# All operations below use the network-none, owned PostgreSQL fixture only.
operator_sql -f - < supabase/migrations/20261019112200_v3_s14_final_results_readiness_hardening.sql
operator_sql -f - < supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql
node scripts/stage-v3-s14-archive-residual-local.mjs > /tmp/s14-residual-local.sql
operator_apply /tmp/s14-residual-local.sql
# Restore already-merged Confirmation command authority on the SAME observed-owner
# local database. Source-only missing-parent reconstruction must first match
# fresh hosted catalog fingerprints; an unknown function cannot be invented.
echo 'STAGE: reconstruct scoped Confirmation hosted prerequisites (local-only)'
node scripts/stage-v3-confirmation-prerequisites-local.mjs > /tmp/confirmation-parents.sql
operator_sql -f - < /tmp/confirmation-parents.sql
echo 'STAGE: Confirmation prerequisites matched; installing governed cutover'
node scripts/stage-v3-confirmation-access-recovery.mjs > /tmp/confirmation-access-recovery.sql
# Fail closed on column-contract and RLS-policy drift in independently cloned,
# networkless local databases. Keep the canonical recovery source untouched.
for confirmation_drift in column policy; do
  confirmation_probe="confirmation_${confirmation_drift}_drift"
  operator_sql -c "create database ${confirmation_probe} owner postgres template recovery_operator_baseline;"
  if [[ "$confirmation_drift" == column ]]; then
    drift_sql='alter table public.edit_tokens add column v3_unreviewed_shape_drift text;'
  else
    drift_sql='create policy v3_unreviewed_authority_drift on public.submissions for select to authenticated using (false);'
  fi
  docker exec "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$confirmation_probe" -c "$drift_sql"
  confirmation_before="$(operator_state_digest "$confirmation_probe")"
  if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$confirmation_probe" -f - < /tmp/confirmation-access-recovery.sql > /tmp/confirmation-drift.log 2>&1; then
    echo "ERROR: Confirmation accepted unreviewed ${confirmation_drift} drift" >&2; exit 1
  fi
  grep -Fq 'Confirmation table column/policy/owner/RLS/ACL drift' /tmp/confirmation-drift.log || { cat /tmp/confirmation-drift.log; exit 1; }
  [[ "$(operator_state_digest "$confirmation_probe")" == "$confirmation_before" ]] || { echo "Confirmation rejected drift but changed schema/data" >&2; exit 1; }
  operator_sql -c "drop database ${confirmation_probe};"
done
# New hosted ACL before-state: emergency security PRs #2591/#2594 already
# revoked direct API TRUNCATE on Confirmation tables. Exercise ONLY on a
# disposable networkless PostgreSQL clone, never on production.
operator_sql -c "create database confirmation_emergency_acl owner postgres template recovery_operator_baseline;"
docker exec "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d confirmation_emergency_acl -c   "revoke truncate on table public.edit_tokens, public.submissions from anon,authenticated,service_role;"
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d confirmation_emergency_acl -f - < /tmp/confirmation-access-recovery.sql
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d confirmation_emergency_acl <<'CONFIRMATION_REVOCATION_POSTCHECK'
do $check$
begin
 if to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null then
   raise exception 'Hardened pre-revoked Confirmation failed to install governed command';
 end if;
 if exists(select 1 from unnest(array['public.edit_tokens','public.submissions']) tab(name)
   cross join unnest(array['anon','authenticated','service_role']) r(name)
   where has_table_privilege(r.name,tab.name,'TRUNCATE')) then
   raise exception 'Hardened Confirmation recovered unsafe API TRUNCATE';
 end if;
end $check$;
CONFIRMATION_REVOCATION_POSTCHECK
operator_sql -c "drop database confirmation_emergency_acl;"
echo 'PASS: reviewed emergency pre-revoked Confirmation ACL accepted; governed command installed without API TRUNCATE regrant'
# Unknown table ACL mutation must still abort before any schema or data effect.
operator_sql -c "create database confirmation_unknown_acl owner postgres template recovery_operator_baseline;"
docker exec "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d confirmation_unknown_acl -c   "revoke truncate on table public.edit_tokens, public.submissions from anon,authenticated,service_role; revoke select on table public.submissions from anon;"
confirmation_unknown_before="$(operator_state_digest confirmation_unknown_acl)"
if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d confirmation_unknown_acl -f - < /tmp/confirmation-access-recovery.sql > /tmp/confirmation-unknown-acl.log 2>&1; then
 echo 'ERROR: Confirmation accepted an unrelated ACL downgrade'; exit 1
fi
grep -Fq 'Confirmation table column/policy/owner/RLS/ACL drift' /tmp/confirmation-unknown-acl.log || { cat /tmp/confirmation-unknown-acl.log; exit 1; }
[[ "$(operator_state_digest confirmation_unknown_acl)" == "$confirmation_unknown_before" ]] || { echo 'Unknown Confirmation ACL drift modified schema/data'; exit 1; }
operator_sql -c "drop database confirmation_unknown_acl;"
echo 'PASS: unrelated Confirmation ACL drift rejected atomically'
operator_apply /tmp/confirmation-access-recovery.sql
echo 'PASS: Confirmation governed cutover installed in observed-owner recovery'
operator_sql -f - < .github/scripts/v3-confirmation-legacy-writer-denial.sql

operator_apply /tmp/s07-ordered-source.sql
operator_sql -f - < .github/tests/v3-hosted-api-role-runtime.sql
operator_sql -f - < .github/tests/v3-ordered-televote-recovery.sql
operator_apply /tmp/atomic-recovery.sql
bootstrap_sql -f - < .github/tests/v3-atomic-calculation-actor.sql
operator_sql -v snapshot_before=true -f - < .github/tests/v3-public-snapshot-recovery.sql
operator_sql -f - < .github/tests/v3-voting-config-authority.sql
operator_apply /tmp/public-snapshot-recovery.sql
operator_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
# Restore canonical Results rank/qualification and reconciliation only after
# the existing capture/read model, with separate exact observed fingerprints.
node scripts/stage-v3-result-authority-recovery.mjs > /tmp/result-authority-recovery.sql
owner_acl_before="$(operator_state_digest)"
operator_sql -c 'revoke execute on function public.sync_show_results_from_votes(uuid) from service_role;'
owner_acl_drift="$(operator_state_digest)"
if operator_sql -f - < /tmp/result-authority-recovery.sql > /tmp/result-authority-drift.log 2>&1; then exit 1; fi
grep -Fq 'Result authority drift or partial installation' /tmp/result-authority-drift.log
[[ "$(operator_state_digest)" == "$owner_acl_drift" ]] || exit 1
operator_sql -c 'grant execute on function public.sync_show_results_from_votes(uuid) to service_role;'
[[ "$(operator_state_digest)" == "$owner_acl_before" ]] || exit 1
operator_apply /tmp/result-authority-recovery.sql
operator_sql -f - < .github/tests/v3-result-authority-recovery.sql
# The original S02 export covered CRUD bits only. Reproduce the separately
# observed full Results ACL (including RLS-independent privileges) LOCALLY.
operator_sql -f - < .github/tests/v3-results-observed-access-acls-local.sql
operator_sql -c 'grant truncate,references,trigger on table public.results to anon,authenticated,service_role;'
node scripts/stage-v3-result-read-authority-recovery.mjs > /tmp/result-read-authority-recovery.sql
operator_apply /tmp/result-read-authority-recovery.sql
operator_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
operator_sql -f - < .github/tests/v3-result-authority-recovery.sql
source .github/scripts/v3-result-public-api-local.sh
source .github/scripts/v3-auth-jury-authority-local.sh
source .github/scripts/v3-combined-deferral-local.sh
# S08 may run only AFTER the complete observed-owner atomic/Results chain.
# Reuse the existing all-show guard candidate under the observed non-superuser
# profile, with full-schema/data rollback, retry, duplicate refusal, and live
# API-role table grant/trigger denial inside this isolated owner fixture.
operator_apply docs/v3/recovery-candidates/s08-televote-single-writer-local.sql
operator_sql -f - < .github/tests/v3-ordered-televote-s08-recovery.sql
echo 'PASS: complete non-superuser owner recovery adopts S08 after Result/Combined safeguards'
# The source already owns the reviewed S16 preflight-bypassing ballot RPC
# retirement, but hosted-observed recovery must explicitly adopt the effect.
# The observed-role 56-table local fixture omits the historical old RPC: recover
# the ORIGINAL source body inside the isolated fixture only. Never ship this
# generator as a production migration or claim complete hosted body parity.
node scripts/stage-v3-televote-legacy-ballot-local-fixture.mjs > /tmp/s16-legacy-ballot-fixture.sql
operator_apply /tmp/s16-legacy-ballot-fixture.sql
echo 'PASS: local-only historical Televote function donor matches observed owner/security/grant envelope'
operator_sql -c 'create database s16_ballot_drift owner postgres template recovery_operator_baseline;'
docker exec "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_ballot_drift \
  -c 'alter function televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean) security invoker;'
s16_ballot_before="$(operator_state_digest s16_ballot_drift)"
if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_ballot_drift \
  -f - < supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql \
  > /tmp/s16-ballot-drift.log 2>&1; then
  echo 'S16 accepted unexpected legacy Televote SECURITY DEFINER drift' >&2; exit 1
fi
grep -Fq 'S16 ballot retirement requires reviewed postgres-owned SECURITY DEFINER functions' /tmp/s16-ballot-drift.log || { cat /tmp/s16-ballot-drift.log; exit 1; }
[[ "$(operator_state_digest s16_ballot_drift)" == "$s16_ballot_before" ]] || { echo 'S16 legacy ballot drift failure modified schema/data' >&2; exit 1; }
operator_sql -c 'drop database s16_ballot_drift;'
operator_apply supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql
operator_sql -f - < .github/tests/v3-televote-ballot-authority.sql
echo 'PASS: recovered S16 legacy service-role Televote writer retired and checked public ballot preflight preserved'
source .github/scripts/v3-results-operation-recovery-local.sh
# The scoped S02 database omits several historical publication command RPCs,
# although exact owner/SECURITY DEFINER grants were independently observed
# on hosted. Reconstruct immutable original functions only in the networkless
# fixture. This is not a hosted recovery step or proof of body equivalence.
node scripts/stage-v3-publication-canonical-local-fixture.mjs > /tmp/s16-publication-fixture.sql
operator_apply /tmp/s16-publication-fixture.sql
# The scoped S02 donor preserves an already-present historic trigger helper,
# including its inherited PUBLIC EXECUTE ACL. Exact-main S16 catalog verifies
# that the CURRENT source revokes that ACL. Reconstruct only that source-defined
# restriction in this throwaway PG17.11 fixture, never treat fixture repair as
# evidence that hosted Supabase adopted the effect.
operator_sql -f - <<'S16_PUBLICATION_LOCAL_ACL'
do $source_parity$
declare
  v_helper oid := to_regprocedure('private.studio2_create_show_publication_control()');
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer <> 170011
     or v_helper is null
     or not exists (select 1 from pg_proc where oid=v_helper
         and pg_get_userbyid(proowner)='postgres' and prosecdef
         and proconfig=array['search_path=pg_catalog, public, private']::text[])
  then raise exception 'S16 Publication local trigger helper identity/owner/definition drift'
       using errcode='55000';
  end if;
  execute 'revoke all on function private.studio2_create_show_publication_control() from public, anon, authenticated, service_role';
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
      and has_function_privilege(oid,v_helper,'EXECUTE'))
  then raise exception 'S16 Publication local helper EXECUTE cutover did not take effect'
       using errcode='55000';
  end if;
end $source_parity$;
S16_PUBLICATION_LOCAL_ACL
echo 'PASS: source-exact Publication internal trigger helper EXECUTE restriction reconstructed only in disposable PG17.11 fixture'
echo 'PASS: source-exact local publication RPC donor installed without overwriting existing functions'
echo 'STAGE: close RLS-independent official API TRUNCATE grants after all canonical command cutovers'
# Verify this expanded scope fails closed on unexpected privilege or RLS drift.
# Clones remain inside the same networkless PG17.11 fixture, never production.
for s16_drift in extra_grant disabled_rls results_column_grant publication_column_grant; do
  s16_probe="s16_${s16_drift}"
  operator_sql -c "create database ${s16_probe} owner postgres template recovery_operator_baseline;"
  case "$s16_drift" in
    extra_grant)
      s16_drift_statement='grant truncate on table public.studio2_upload_authorizations to authenticated;'
      s16_expected_error='S16 unexpected TRUNCATE role authority'
      ;;
    disabled_rls)
      s16_drift_statement='alter table public.editions disable row level security;'
      s16_expected_error='S16 unqualified RLS-protected official table'
      ;;
    results_column_grant)
      s16_drift_statement='grant update (jury_points) on public.results to authenticated;'
      s16_expected_error='S16 unexpected Results column-level grants'
      ;;
    publication_column_grant)
      s16_drift_statement='grant update (state) on public.studio2_show_publication_controls to authenticated;'
      s16_expected_error='S16 unexpected publication column-level grants'
      ;;
  esac
  docker exec "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$s16_probe" -c "$s16_drift_statement"
  s16_before="$(operator_state_digest "$s16_probe")"
  if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$s16_probe" \
    -f - < docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql \
    > /tmp/s16-drift-preflight.log 2>&1; then
    echo "ERROR: S16 accepted unreviewed ${s16_drift} drift" >&2; exit 1
  fi
  grep -Fq "$s16_expected_error" /tmp/s16-drift-preflight.log || { cat /tmp/s16-drift-preflight.log; exit 1; }
  [[ "$(operator_state_digest "$s16_probe")" == "$s16_before" ]] || { echo 'S16 drift rejection changed schema/data'; exit 1; }
  operator_sql -c "drop database ${s16_probe};"
done
echo 'PASS: S16 preflight rejects unreviewed RLS and API TRUNCATE role drift atomically'
# PRs #2590/#2591 already removed API TRUNCATE grants in real production.
# Isolated clone: verify S16 accepts that stricter before-state without
# regranting access to satisfy historical fixture expectations.
operator_sql -c "create database s16_emergency_pre_revoked owner postgres template recovery_operator_baseline;"
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_emergency_pre_revoked -c "revoke truncate on table public.country_accounts,public.editions,public.entries,public.edit_tokens,public.jury_votes,public.results,public.shows,public.studio2_result_operations,public.studio2_show_publication_controls,public.studio2_upload_authorizations,public.submissions,public.televote_votes,televoting.televote_aggregations,televoting.vote_submissions from public,anon,authenticated,service_role;"
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_emergency_pre_revoked <<'S16_REVOKED_PREFLIGHT'
do $precheck$
begin
 if exists (
   select 1 from unnest(array['public.country_accounts','public.editions','public.entries','public.edit_tokens','public.jury_votes','public.results','public.shows','public.studio2_result_operations','public.studio2_show_publication_controls','public.studio2_upload_authorizations','public.submissions','public.televote_votes','televoting.televote_aggregations','televoting.vote_submissions']) t(name)
   cross join unnest(array['anon','authenticated','service_role']) r(name)
   where has_table_privilege(r.name,t.name,'TRUNCATE')
 ) then raise exception 'Emergency baseline still has API TRUNCATE grants'; end if;
end $precheck$;
S16_REVOKED_PREFLIGHT
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_emergency_pre_revoked -f - < docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql
docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_emergency_pre_revoked <<'S16_REVOKED_POSTCHECK'
do $postcheck$
begin
 if exists (
   select 1 from unnest(array['public.country_accounts','public.editions','public.entries','public.edit_tokens','public.jury_votes','public.results','public.shows','public.studio2_result_operations','public.studio2_show_publication_controls','public.studio2_upload_authorizations','public.submissions','public.televote_votes','televoting.televote_aggregations','televoting.vote_submissions']) t(name)
   cross join unnest(array['anon','authenticated','service_role']) r(name)
   where has_table_privilege(r.name,t.name,'TRUNCATE')
 ) then raise exception 'S16 pre-revoked baseline regained TRUNCATE'; end if;
 if not exists (select 1 from private.v3_migration_contracts
   where migration_key='v3.s16.launch-table-truncate-cutover') then
   raise exception 'S16 pre-revoked baseline omitted registration';
 end if;
end $postcheck$;
S16_REVOKED_POSTCHECK
operator_sql -c "drop database s16_emergency_pre_revoked;"
echo 'PASS: S16 local production-ACL simulation accepts all-14 pre-revoked TRUNCATE and preserves canonical guards'
operator_apply docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql
# The hosted-observed S02 fixture omits the separate, already source-defined
# S14 Televote reconciliation command. Exact PG17.11 execution confirmed that
# missing identity. Rebuild ONLY that existing migration in the networkless
# fixture, after its S07/S08, Results, and Publication dependencies are present.
# Never replace an existing routine or pretend the hosted project adopted it.
operator_sql -f - <<'S16_RECONCILE_DEPENDENCY_PREFLIGHT'
do $s16_reconcile_source$
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer <> 170011
     or to_regprocedure('public.v3_reconcile_published_televote(text,uuid)') is not null
     or exists (
       select 1 from private.v3_migration_contracts
       where migration_key='v3.results.atomic-televote-recovery'
     )
     or to_regprocedure('private.v3_sync_published_televote_round(uuid)') is null
     or to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)') is null
  then
    raise exception 'S16 synthetic Televote reconciliation donor must be absent with exact S08/Results prerequisites'
      using errcode='55000';
  end if;
end $s16_reconcile_source$;
S16_RECONCILE_DEPENDENCY_PREFLIGHT
# Preserve the source-defined migration body verbatim, but add an isolated
# recovery-only preflight so operator_apply can prove interrupted rollback and
# atomic duplicate rejection. The original migration is NOT rewritten.
node --input-type=module <<'S16_RECONCILE_DONOR' > /tmp/s16-reconcile-guarded.sql
import fs from 'node:fs';
const source = fs.readFileSync(
  'supabase/migrations/20261103220000_v3_s14_atomic_televote_recovery.sql','utf8');
if (!source.startsWith('begin;\n') ||
    !/commit;\s*$/.test(source) ||
    source.match(/create or replace function public\.v3_reconcile_published_televote\s*\(/g)?.length !== 1) {
  throw Error('S16 reconciliation donor transaction/source definition drift');
}
const guard = `do $s16_reconcile_donor$
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer <> 170011
     or to_regprocedure('public.v3_reconcile_published_televote(text,uuid)') is not null
     or exists(select 1 from private.v3_migration_contracts
               where migration_key='v3.results.atomic-televote-recovery')
  then
    raise exception 'S16 Televote source-donor already installed or unexpected authority drift'
      using errcode='55000';
  end if;
end $s16_reconcile_donor$;
`;
process.stdout.write('begin;\n'+guard+source.slice('begin;\n'.length));
S16_RECONCILE_DONOR
operator_apply /tmp/s16-reconcile-guarded.sql
operator_sql -f - <<'S16_RECONCILE_DEPENDENCY_POSTCHECK'
do $s16_reconcile_source$
declare v_fn pg_proc%rowtype;
begin
  select * into v_fn from pg_proc
  where oid=to_regprocedure('public.v3_reconcile_published_televote(text,uuid)');
  if v_fn.oid is null or pg_get_userbyid(v_fn.proowner)<>'postgres'
     or not v_fn.prosecdef
     or v_fn.proconfig is distinct from
       array['search_path=pg_catalog, public, private, televoting, extensions']::text[]
     or has_function_privilege('anon',v_fn.oid,'EXECUTE')
     or has_function_privilege('authenticated',v_fn.oid,'EXECUTE')
     or not has_function_privilege('service_role',v_fn.oid,'EXECUTE')
  then
    raise exception 'S16 source-defined reconciliation command did not rebuild exact owner/ACL authority'
      using errcode='55000';
  end if;
end $s16_reconcile_source$;
S16_RECONCILE_DEPENDENCY_POSTCHECK
echo 'PASS: existing canonical Televote reconciliation source restored only in synthetic networkless PG17.11'
# Source-managed forward-only shared-guard privilege cutover. Inspect all
# actual trigger identities and effective definer RPCs before revocation.
# Never run this command against hosted or a different database.
operator_apply supabase/migrations/20261116193000_v3_s16_shared_guard_reviewed_api_dml_retirement.sql
# The scoped S02 observed-owner fixture lacks the original country claim RPC.
# Restore its exact source SQL only in this verified networkless PG17 fixture.
# Preflight must refuse a competing owner, function, helper, or privilege.
# This is NOT hosted database migration adoption or production equivalence.
node scripts/stage-v3-s16-country-claim-local.mjs > /tmp/s16-country-claim-source.sql
operator_apply /tmp/s16-country-claim-source.sql
echo 'PASS: exact-source country claim writer restored in disposable PG17.11'
# The same scoped baseline omits the older Organizer moderation RPC (and may
# omit the HoD preference RPC). Restore them from their original source files,
# with exact function-owner/search_path/body/EXECUTE proof; never waive a drift.
node scripts/stage-v3-s16-country-admin-hod-local.mjs > /tmp/s16-country-admin-hod-source.sql
operator_apply /tmp/s16-country-admin-hod-source.sql
echo 'PASS: exact-source country moderation and HoD RPCs restored in disposable PG17.11'
# Country-account authority remains a separate guarded boundary; never weaken
# the production preflight or replace a hosted signup/claim/HoD contract.
operator_apply supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql
# Exercise the positive country signup in a separate disposable clone. In the
# observed hosted role topology, postgres is a NONSUPERUSER recovery operator
# and cannot INSERT into auth.users. Only the actual Auth owner can insert and
# fire the original source-defined trigger. Do NOT grant Auth DML to postgres.
s16_country_parent_digest="$(operator_state_digest)"
operator_sql -c 'create database s16_country_authority_probe owner postgres template recovery_operator_baseline;'
s16_country_operator_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d s16_country_authority_probe "$@"; }
s16_country_auth_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U supabase_auth_admin -d s16_country_authority_probe "$@"; }
# The synthetic PG17 S02 fixture intentionally has no application rows.
# Load the original Permission Engine capability/role presets from their exact
# source migration, not invented policy stubs; then set the one local platform
# operational row to 'normal', as other source-backed recovery tests do.
node --input-type=module > /tmp/s16-country-permission-seed.sql <<'S16_COUNTRY_REFERENCE'
import fs from 'node:fs';
const source=fs.readFileSync('supabase/migrations/20260914035152_permission_engine_v2_foundation.sql','utf8');
for (const prefix of [
  'insert into public.studio2_capabilities (',
  'insert into public.studio2_access_roles (',
  'insert into public.studio2_role_capabilities (role_key, capability)\\nselect role_key',
]) {
 const literal=prefix.replace('\\n','\n');
 const start=source.indexOf(literal);
 if(start<0||source.indexOf(literal,start+1)!==-1) throw Error('Missing/ambiguous canonical permission fixture seed: '+prefix);
 const end=source.indexOf(';',start);
 if(end<0) throw Error('Unterminated canonical permission seed: '+prefix);
 process.stdout.write(source.slice(start,end+1)+'\n');
}
S16_COUNTRY_REFERENCE
s16_country_operator_sql -f - < /tmp/s16-country-permission-seed.sql
s16_country_operator_sql -c "insert into public.studio2_platform_operational_state(singleton,mode,version,reason)
values(true,'normal',1,'Networkless P09 country-command positive acceptance only; hosted unchanged');"
s16_country_operator_sql -c "
insert into public.countries(id,name,short_code)
values
 ('74800000-0000-4000-8000-000000000011','S16 Country Signup','SCS'),
 ('74800000-0000-4000-8000-000000000012','S16 Country Claim','SCC');
"
s16_country_auth_sql -c "
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values
 ('74800000-0000-4000-8000-000000000021','authenticated','authenticated',
  's16-country-signup@local.invalid',
  '{\"account_type\":\"country\",\"country_id\":\"74800000-0000-4000-8000-000000000011\",\"instagram_username\":\"s16countrytest\",\"display_name\":\"S16 Country Signup\"}'::jsonb,
  now(),now()),
 ('74800000-0000-4000-8000-000000000022','authenticated','authenticated',
  's16-country-claim@local.invalid','{}'::jsonb,now(),now()),
 ('74800000-0000-4000-8000-000000000023','authenticated','authenticated',
  's16-country-organizer@local.invalid','{}'::jsonb,now(),now());
"
# Synthetic identity grant is on the isolated probe only. The canonical
# permission engine, not a forged session flag, authorizes Organizer commands.
s16_country_operator_sql -c "
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
values('74800000-0000-4000-8000-000000000023','organizer',null);
"
# The 56-table S02 observation contains a deliberately nonexecuting catalog
# placeholder for this RLS helper. Replace it in the throwaway clone ONLY with
# the final, source-defined Permission Engine SQL; refuse any unknown routine.
node scripts/stage-v3-s16-country-permission-local.mjs > /tmp/s16-country-permission-final.sql
s16_country_operator_sql -f - < /tmp/s16-country-permission-final.sql
s16_country_operator_sql -v s16_country_positive=1 -f - < .github/tests/v3-s16-country-account-api-dml.sql
operator_sql -c 'drop database s16_country_authority_probe;'
[[ "$(operator_state_digest)" == "$s16_country_parent_digest" ]] || {
  echo 'S16 country positive test modified owner-recovery parent database' >&2; exit 1
}
echo 'PASS: 12 country-account API DML denials, Auth-owner signup, automatic HoD, authenticated claim, unauthorized/authorized Organizer commands'
# The postgres operator remains distinct from the authenticator/API principals.
# Exercise all 24 direct SQL statements under forged recovery GUCs; PostgreSQL
# must deny at table ACL boundary even when session markers are attacker-set.
for s16_shared_role in anon authenticated service_role; do
  for s16_shared_table in public.results public.televote_votes; do
    for s16_shared_action in INSERT UPDATE DELETE TRUNCATE; do
      case "$s16_shared_action" in
        INSERT) s16_shared_sql="insert into $s16_shared_table default values" ;;
        UPDATE) s16_shared_sql="update $s16_shared_table set show_id=show_id where false" ;;
        DELETE) s16_shared_sql="delete from $s16_shared_table where false" ;;
        TRUNCATE) s16_shared_sql="truncate table $s16_shared_table" ;;
      esac
      if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
          -U authenticator -d recovery_operator_baseline \
          -c "begin; set local role $s16_shared_role; select set_config('studio2.platform_recovery_write','on',true); select set_config('studio2.confirmation_maintenance_write','on',true); $s16_shared_sql; rollback;" \
          > /tmp/s16-shared-guard-acl.log 2>&1; then
        echo "S16 unsafe shared guard SQL accepted: $s16_shared_role $s16_shared_table $s16_shared_action" >&2; exit 1
      fi
      grep -Eqi '42501: permission denied for table' /tmp/s16-shared-guard-acl.log || {
        echo "S16 wrong denial cause: $s16_shared_role $s16_shared_table $s16_shared_action" >&2
        cat /tmp/s16-shared-guard-acl.log >&2; exit 1
      }
    done
  done
done
echo 'PASS: 24 real API-role direct-write denials survive forged recovery markers on PG17.11'
# Exercise SQL as actual API principals, not only catalog predicates. A denial
# must be PostgreSQL permission-denied, never an FK or role-switch error.
for s16_actor in anon authenticated service_role; do
  for s16_table in public.country_accounts public.editions public.entries public.edit_tokens public.jury_votes public.results public.shows public.studio2_result_operations public.studio2_show_publication_controls public.studio2_upload_authorizations public.submissions public.televote_votes televoting.televote_aggregations televoting.vote_submissions; do
    if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_operator_baseline \
      -c "begin; set local role $s16_actor; truncate table $s16_table; rollback;" \
      > /tmp/s16-api-truncate.log 2>&1; then
      echo "S16 direct TRUNCATE unexpectedly succeeded: $s16_actor $s16_table" >&2
      exit 1
    fi
    if ! grep -qi 'permission denied for table' /tmp/s16-api-truncate.log; then
      echo "S16 role probe did not prove table permission denial: $s16_actor $s16_table" >&2
      tail -n 20 /tmp/s16-api-truncate.log >&2
      exit 1
    fi
  done
done
# Actual authenticator role execution, NOT merely a metadata assertion.
# No rows are written. The statement must fail on table permission, rather than
# a row constraint, operational mode, RLS invisibility, or invalid test input.
for s16_actor in anon authenticated service_role; do
  for s16_table in public.submissions public.edit_tokens; do
    for s16_action in INSERT UPDATE DELETE; do
      case "$s16_action" in
        INSERT) s16_statement="insert into $s16_table default values" ;;
        UPDATE)
          if [[ "$s16_table" == public.submissions ]]; then
            s16_statement='update public.submissions set editing_allowed=editing_allowed where false'
          else
            s16_statement='update public.edit_tokens set active=active where false'
          fi ;;
        DELETE) s16_statement="delete from $s16_table where false" ;;
      esac
      if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_operator_baseline \
        -c "begin; set local role $s16_actor; $s16_statement; rollback;" \
        > /tmp/s16-confirmation-dml-denial.log 2>&1; then
        echo "S16 direct Confirmation $s16_action unexpectedly allowed: $s16_actor $s16_table" >&2; exit 1
      fi
      grep -qi 'permission denied for table' /tmp/s16-confirmation-dml-denial.log || { cat /tmp/s16-confirmation-dml-denial.log; exit 1; }
    done
  done
done
echo 'PASS: 18 direct Confirmation table DML attempts denied as real API roles'
# Results' reviewed-input CAS and publication RPCs are the only sanctioned
# owners. Test Results DML in NORMAL writable mode, not maintenance mode.
for s16_actor in anon authenticated service_role; do
  for s16_action in INSERT UPDATE DELETE; do
    case "$s16_action" in
      INSERT) s16_statement='insert into public.results default values' ;;
      UPDATE) s16_statement='update public.results set show_id=show_id where false' ;;
      DELETE) s16_statement='delete from public.results where false' ;;
    esac
    if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_operator_baseline \
      -c "begin; set local role $s16_actor; $s16_statement; rollback;" \
      > /tmp/s16-results-dml-denial.log 2>&1; then
      echo "S16 direct Results $s16_action unexpectedly allowed: $s16_actor" >&2; exit 1
    fi
    grep -qi 'permission denied for table' /tmp/s16-results-dml-denial.log || { cat /tmp/s16-results-dml-denial.log; exit 1; }
  done
done
echo 'PASS: 9 direct Results table DML operations denied in normal mode as real API roles'
# Publication controls and scheduled-execution receipts must not be writable
# even by a service-role SQL session. This does not disable the owner-executed
# apply/publish-due SECURITY DEFINER RPCs.
for s16_actor in anon authenticated service_role; do
  for s16_table in public.studio2_show_publication_controls public.studio2_show_publication_executions; do
    for s16_action in INSERT UPDATE DELETE TRUNCATE; do
      case "$s16_action" in
        INSERT) s16_statement="insert into $s16_table default values" ;;
        UPDATE)
          if [[ "$s16_table" == public.studio2_show_publication_controls ]]; then
            s16_statement='update public.studio2_show_publication_controls set state=state where false'
          else
            s16_statement='update public.studio2_show_publication_executions set executed_at=executed_at where false'
          fi ;;
        DELETE) s16_statement="delete from $s16_table where false" ;;
        TRUNCATE) s16_statement="truncate table $s16_table" ;;
      esac
      if docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_operator_baseline \
        -c "begin; set local role $s16_actor; $s16_statement; rollback;" \
        > /tmp/s16-publication-denial.log 2>&1; then
        echo "S16 competing publication $s16_action accepted: $s16_actor $s16_table" >&2
        exit 1
      fi
      grep -qi 'permission denied for table' /tmp/s16-publication-denial.log || { cat /tmp/s16-publication-denial.log; exit 1; }
    done
  done
done
echo 'PASS: 24 actual API-role publication DML/TRUNCATE denials'
# Run the existing independent-authenticator published-read and Results CAS
# acceptance again *after* the DML cutover, on a disposable database clone.
source .github/scripts/v3-result-public-api-local.sh
echo 'PASS: post-S16 Results publication reads and canonical CAS still work'
source .github/scripts/v3-s16-publication-api-local.sh
echo 'PASS: post-S16 canonical publication command and scheduled owner RPC remain usable'
echo 'PASS: 42 actual API-role TRUNCATE attempts denied across fourteen launch tables'
source .github/scripts/v3-media-recovery-local.sh
echo 'PASS: entire ordered recovery executes as observed NONSUPERUSER postgres with real role/schema privileges'
# A restore of synthetic local data proves this procedure, NOT availability,
# freshness, retention or restorability of the separate real production backup.
owner_restored_before="$(operator_state_digest)"
docker exec "$cid" pg_dump -Fc -U solaris_recovery_bootstrap -d recovery_operator_baseline > /tmp/observed-owner-synthetic.dump
bootstrap_sql -c 'create database recovery_restore_probe owner postgres template template0;'
docker exec -i "$cid" pg_restore --exit-on-error --single-transaction -U solaris_recovery_bootstrap -d recovery_restore_probe < /tmp/observed-owner-synthetic.dump
[[ "$(operator_state_digest recovery_restore_probe)" == "$owner_restored_before" ]] || { echo 'Restored synthetic database differs'; exit 1; }
restored_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_restore_probe "$@"; }
restored_sql -f - < .github/tests/v3-hosted-api-role-runtime.sql
restored_sql -f - < .github/tests/v3-ordered-televote-recovery.sql
restored_sql -f - < .github/tests/v3-ordered-televote-s08-recovery.sql
restored_sql -f - < .github/tests/v3-televote-ballot-authority.sql
restored_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
# The original weighted-rank fixture remains exercised before S08, above.
# It manually seeds aggregates, which post-S08 must reject. This post-restore
# test instead proves the denial and legitimate config/immutable Results reads.
restored_sql -f - < .github/tests/v3-s08-voting-config-after-recovery.sql
# Full seeded Results rank/qualification/reconciliation proof is retained
# before S08 in the same operator fixture; its manual aggregate INSERT is
# forbidden in the S08 restored clone. Recheck the canonical read/sync/ACL
# contracts with zero fabricated aggregate writers instead.
restored_sql -f - < .github/tests/v3-s08-results-authority-after-recovery.sql
[[ "$(operator_state_digest recovery_restore_probe)" == "$owner_restored_before" ]] || { echo 'Restored runtime tests changed durable evidence'; exit 1; }
# Repeat real authenticator sessions against a clone of the restored database.
owner_api_parent=recovery_restore_probe
source .github/scripts/v3-result-public-api-local.sh
unset owner_api_parent
echo 'PASS: synthetic pg_dump/pg_restore into separate local DB preserves full schema, ACLs and rows; restored authority/snapshots pass'
OWNER_SOURCE_SHA="$EXACT_SHA" node --input-type=module <<'PROOF'
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=process.env.OWNER_SOURCE_SHA;
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Missing exact source SHA');
const files=[
 'docs/v3/recovery-candidates/forward-only-s13-foundation.sql',
 'docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql',
 '/tmp/confirmation-access-recovery.sql',
 '/tmp/s07-ordered-source.sql','/tmp/atomic-recovery.sql','/tmp/public-snapshot-recovery.sql','/tmp/result-authority-recovery.sql','/tmp/result-read-authority-recovery.sql',
 'supabase/migrations/20261114102706_v3_jury_governed_submission_cutover.sql',
 'supabase/migrations/20261115084647_v3_jury_canonical_table_authority.sql',
 'supabase/migrations/20261114141934_v3_defer_combined_televote_database_writes.sql',
 'docs/v3/recovery-candidates/s08-televote-single-writer-local.sql',
 'supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql',
 '/tmp/results-operation-engine.sql','/tmp/results-reviewed-cas.sql',
 'supabase/migrations/20261114194701_v3_results_operation_tables_owner_only.sql',
 'docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql',
 'supabase/migrations/20261103220000_v3_s14_atomic_televote_recovery.sql',
 'supabase/migrations/20261116193000_v3_s16_shared_guard_reviewed_api_dml_retirement.sql',
 'supabase/migrations/20260916043443_permission_engine_v2_country_ownership_rpc_cutover.sql',
 'scripts/stage-v3-s16-country-claim-local.mjs',
 '/tmp/s16-country-claim-source.sql',
 'supabase/migrations/20260916033414_permission_engine_v2_country_admin_rpc_cutover.sql',
 'supabase/migrations/20260821234500_country_hod_self_history.sql',
 'supabase/migrations/20260822001000_finalize_hod_release_hardening.sql',
 'scripts/stage-v3-s16-country-admin-hod-local.mjs',
 '/tmp/s16-country-admin-hod-source.sql',
 'supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql',
 'supabase/migrations/20261115204228_v3_media_finalization_authority.sql',
];
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync('ordered-recovery-sql',{recursive:true});
const orderedStages=files.map((path,i)=>{
 const artifactPath='ordered-recovery-sql/'+String(i+1).padStart(2,'0')+'-'+path.split('/').at(-1);
 fs.copyFileSync(path,artifactPath);
 if(digest(path)!==digest(artifactPath))throw Error('Recovery artifact copy digest mismatch');
 return{order:i+1,path,artifactPath,sha256:digest(path)};
});
fs.writeFileSync('observed-owner-recovery-proof.json',JSON.stringify({
 sourceSha:sha,postgresVersion:'17.11',network:'none',portsPublished:false,
 observedProductionProject:'dkxmnvekiopyesuzggeu',
 recoveryOperator:{role:'postgres',superuser:false,bypassRls:true},
 observedRoleAttributes:16,observedAdditionalStorageRole:1,observedSchemas:5,
 mediaDatabaseAuthorityVerified:true,mediaStorageSelectedMetadataSourceOnly:true,mediaStorageServiceVerified:false,mediaStorageOwnerPolicyCutoverVerified:true,
 orderedStages,
 interruptedRollback:true,safeRetry:true,duplicateRefused:true,
 schemaAndSyntheticRowsPreserved:true,separateLocalRestoreVerified:true,
 confirmationGovernedCommandsInstalled:true,confirmationLegacyApiExecuteDenied:true,
 confirmationPositiveLifecycleVerified:false,confirmationParentBodiesSourceOnly:true,
 s16ConfirmationTelevoteTruncateApiRoleDenied:true,s16LaunchTableTruncateDenials:42,s16LaunchTableNames:["public.country_accounts","public.editions","public.entries","public.edit_tokens","public.jury_votes","public.results","public.shows","public.studio2_result_operations","public.studio2_show_publication_controls","public.studio2_upload_authorizations","public.submissions","public.televote_votes","televoting.televote_aggregations","televoting.vote_submissions"],s16ConfirmationDirectApiDmlDenied:true,s16ResultsDirectApiDmlDenied:true,s16ResultsApiDmlDenials:9,s16ResultsPublishedReadbackPreserved:true,s16LegacyTelevoteWriterRetired:true,s16CheckedVotePreflightApiRoleVerified:true,s16PublicationDirectApiDenials:24,s16PublicationCanonicalCommandAcceptance:true,s16FullCriticalWriterCertified:false,
 juryLegacyApiDenied:true,juryGovernedReceiptReplayVerified:true,
 juryApiTableAndColumnDmlTruncateDenied:true,juryDraftCasAndReadbackVerified:true,
 signupAuthOwnerRaceAndRollbackVerified:true,
 sourceOnlyRuntimeDependencies:["televoting.integrity_sanction_matches","publication.historical-command-source-fixture"],
 combinedApiAndOwnerWritesDisabled:true,combinedHistoricalDataAndReadsPreserved:true,
 s08ObservedNonSuperuserAndRestoredAuthorityVerified:true,
 reviewedInputCasInstalled:true,reviewedInputStaleIdentityDenialsVerified:true,
 resultOperationDirectApiWritesDenied:true,authenticatedReleasePointerCommandsAndReplayVerified:true,
 concurrentInputRollbackAndRetryVerified:true,
 fullRecovered66CountryContestVerified:false,resultsCalculateReviewEventRehearsal:false,
 legacyRecalculationFixture:'approved historical source variant, replaced before execution; not hosted equivalence',
 productionBackupVerified:false,hostedEquivalenceCertified:false,
 productionMutation:false,productionAuthorized:false,
},null,2)+'\n',{flag:'wx'});
PROOF
