# Sourced by the existing observed-owner PG17.11 driver. No hosted runner.
set -euo pipefail
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]]
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]]
node scripts/stage-v3-results-operation-prerequisites-local.mjs > /tmp/results-operation-prerequisites.sql
operator_sql -f - < /tmp/results-operation-prerequisites.sql
bootstrap_sql -f - < .github/tests/v3-results-auth-jwt-local.sql
node scripts/stage-v3-results-operation-authority-recovery.mjs > /tmp/results-operation-engine.sql

# Actual source/ACL drift must fail before any recovery DDL or data change.
for drift in acl definition; do
  original="$(operator_state_digest)"
  if [[ "$drift" == acl ]]; then
    operator_sql -c 'revoke execute on function public.studio2_execute_result_operation(uuid,text,text,uuid,bigint) from service_role;'
  else
    operator_sql -c 'alter function private.studio2_can_preview_results(uuid,uuid) set search_path=pg_catalog;'
  fi
  changed="$(operator_state_digest)"
  if operator_sql -f - < /tmp/results-operation-engine.sql > /tmp/results-operation-drift.log 2>&1; then
    echo 'Unqualified Results prerequisite accepted';exit 1
  fi
  grep -Fq 'Results operation prerequisite drift' /tmp/results-operation-drift.log
  [[ "$(operator_state_digest)" == "$changed" ]]
  if [[ "$drift" == acl ]]; then
    operator_sql -c 'grant execute on function public.studio2_execute_result_operation(uuid,text,text,uuid,bigint) to service_role;'
  else
    operator_sql -c 'alter function private.studio2_can_preview_results(uuid,uuid) set search_path=pg_catalog,public,private;'
  fi
  [[ "$(operator_state_digest)" == "$original" ]]
done
operator_apply /tmp/results-operation-engine.sql
node scripts/stage-v3-results-reviewed-cas-recovery.mjs > /tmp/results-reviewed-cas.sql
for drift in base_definition base_acl partial_helper partial_column partial_trigger; do
  original="$(operator_state_digest)"
  case "$drift" in
    base_definition) operator_sql -c 'alter function public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint) set search_path=pg_catalog;' ;;
    base_acl) operator_sql -c 'grant execute on function public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint) to service_role;' ;;
    partial_helper) operator_sql -c 'create function private.studio2_result_review_basis_row_changed() returns trigger language plpgsql as $$begin raise division_by_zero;end$$;' ;;
    partial_column) operator_sql -c 'alter table public.studio2_result_operations add column review_basis_version bigint;' ;;
    partial_trigger) operator_sql -c 'create trigger studio2_results_review_basis_shows after insert on public.shows for each row execute function private.v3_guard_archive_runtime_transition();' ;;
  esac
  changed="$(operator_state_digest)"
  if operator_sql -f - < /tmp/results-reviewed-cas.sql > /tmp/results-cas-preflight-denial.log 2>&1;then
    echo 'Unqualified partial/drifted CAS prerequisite accepted';exit 1
  fi
  grep -Eq 'Reviewed CAS (source prerequisite drift|recovery already or partially installed)' /tmp/results-cas-preflight-denial.log
  [[ "$(operator_state_digest)" == "$changed" ]]
  case "$drift" in
    base_definition) operator_sql -c 'alter function public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint) set search_path=pg_catalog,public,private;' ;;
    base_acl) operator_sql -c 'revoke execute on function public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint) from service_role;' ;;
    partial_helper) operator_sql -c 'drop function private.studio2_result_review_basis_row_changed();' ;;
    partial_column) operator_sql -c 'alter table public.studio2_result_operations drop column review_basis_version;' ;;
    partial_trigger) operator_sql -c 'drop trigger studio2_results_review_basis_shows on public.shows;' ;;
  esac
  [[ "$(operator_state_digest)" == "$original" ]]
done
operator_apply /tmp/results-reviewed-cas.sql
operator_apply supabase/migrations/20261114194701_v3_results_operation_tables_owner_only.sql
python3 - <<'PY'
from pathlib import Path
source=Path('scripts/rehearse-v3-results-reviewed-input-cas.sh').read_text()
assert source.count("<<'SQL'\n")==1
sql=source.split("<<'SQL'\n",1)[1].split('\nSQL\n',1)[0]
assert sql.rstrip().endswith('rollback;')
Path('/tmp/results-reviewed-cas-runtime.sql').write_text(sql+'\n')
PY
operator_sql -f - < /tmp/results-reviewed-cas-runtime.sql
operator_sql -f - < .github/tests/v3-results-operation-role-denial.sql
source .github/scripts/v3-results-operation-api-local.sh
echo 'PASS: same recovered DB Results engine/CAS, stale review and identity denials; 24 direct API DML/TRUNCATE denials; transactional recovery/retry'
