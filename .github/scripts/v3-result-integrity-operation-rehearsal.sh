#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-result-integrity-operation] %s\n' "$*"; }
fail() { printf '\n[v3-result-integrity-operation] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

auth_sql() {
  local query="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query"
}

EDITION_ID='00000000-0000-4000-8000-00000000d201'
REMOTE_EDITION_ID='00000000-0000-4000-8000-00000000d202'
ROUND_ID='00000000-0000-4000-8000-00000000d203'
USER_ID='00000000-0000-4000-8000-00000000d204'
OP1='00000000-0000-4000-8000-00000000d205'
CORR1='00000000-0000-4000-8000-00000000d206'
OP_CONFLICT='00000000-0000-4000-8000-00000000d207'
OP2='00000000-0000-4000-8000-00000000d208'
CORR2='00000000-0000-4000-8000-00000000d209'
OP_WRONG_EDITION='00000000-0000-4000-8000-00000000d20a'
WRONG_EDITION='00000000-0000-4000-8000-00000000d20b'
OP_STALE='00000000-0000-4000-8000-00000000d20c'

EVIDENCE_V1='[{"subjectKey":"cluster-alpha","members":["submission-a","submission-b"],"winnerChanged":false,"topThreeChanged":true,"qualifierChanged":false,"maxRankMovement":2,"maxPointMovement":7,"mostAffectedEntry":"A"},{"subjectKey":"cluster-beta","members":["submission-c","submission-d"],"winnerChanged":true,"topThreeChanged":true,"qualifierChanged":true,"maxRankMovement":4,"maxPointMovement":12,"mostAffectedEntry":"B"}]'
EVIDENCE_V2='[{"subjectKey":"cluster-alpha","members":["submission-a","submission-b","submission-c"],"winnerChanged":false,"topThreeChanged":false,"qualifierChanged":false,"maxRankMovement":1,"maxPointMovement":3,"mostAffectedEntry":"A"}]'

log "Seeding isolated Solaris edition, governed actor and Robust v2 round"
db_exec "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','Result Integrity Rehearsal','result-integrity-rehearsal',1430,2026,'active',false)
on conflict (id) do update set status='active',published=false;

insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','result-integrity@local.invalid',now(),now())
on conflict (id) do nothing;
insert into public.user_roles(user_id,role) values ('$USER_ID','organizer') on conflict do nothing;
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','voting.manage','$EDITION_ID'),('$USER_ID','voting.read','$EDITION_ID')
on conflict do nothing;

insert into televoting.editions(id,name,is_active,is_archived)
values ('$REMOTE_EDITION_ID','Result Integrity Rehearsal',true,false)
on conflict (id) do update set is_active=true,is_archived=false;

insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status)
values ('televoting','edition','$EDITION_ID','$REMOTE_EDITION_ID','$EDITION_ID','linked')
on conflict (service,entity_type,remote_id)
do update set solaris_id=excluded.solaris_id,edition_id=excluded.edition_id,sync_status='linked';

insert into televoting.rounds(
  id,edition_id,name,status,total_points_to_distribute,results_status,
  calculation_version,results_outdated,broadcast_display_mode,participant_mode,self_voting_mode
) values (
  '$ROUND_ID','$REMOTE_EDITION_ID','Result Integrity round','closed',20,'calculated',
  1,false,'converted','countries','country_match'
)
on conflict (id) do update
set status='closed',results_status='calculated',calculation_version=1,results_outdated=false;

update televoting.rounds
set televote_engine_version='robust-televote-v2'
where id='$ROUND_ID'::uuid;
"

BASE_BALLOTS="$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$ROUND_ID'::uuid;")"
BASE_RESULTS="$(db_scalar "select count(*) from televoting.round_results where round_id='$ROUND_ID'::uuid;")"

log "First governed recompute atomically materializes revision 1"
RESULT1="$(auth_sql "select televoting.studio2_apply_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$EVIDENCE_V1'::jsonb,'$OP1','result-integrity-op-1','$CORR1')::text;")"
python3 - "$RESULT1" "$EDITION_ID" "$ROUND_ID" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['solarisEditionId']==sys.argv[2]
assert r['roundId']==sys.argv[3]
assert r['calculationVersion']==1
assert r['evidenceRevision']==1
assert r['rowCount']==2
assert len(r['evidenceFingerprint'])==64
PY
[[ "$(db_scalar "select count(*) from televoting.round_influence_results where round_id='$ROUND_ID'::uuid and calculation_version=1 and subject_type='cluster';")" == "2" ]] || fail "revision 1 cluster evidence did not materialize exactly"
[[ "$(db_scalar "select evidence_revision from televoting.round_integrity_evidence_versions where round_id='$ROUND_ID'::uuid and calculation_version=1;")" == "1" ]] || fail "revision 1 provenance missing"
[[ "$(db_scalar "select status from public.studio2_operation_receipts where operation_id='$OP1'::uuid;")" == "succeeded" ]] || fail "operation receipt did not succeed"

log "Exact retry returns the durable result without advancing evidence revision"
REPLAY1="$(auth_sql "select televoting.studio2_apply_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$EVIDENCE_V1'::jsonb,'$OP1','result-integrity-op-1','$CORR1')::text;")"
[[ "$REPLAY1" == "$RESULT1" ]] || fail "exact operation replay changed the durable result"
[[ "$(db_scalar "select evidence_revision from televoting.round_integrity_evidence_versions where round_id='$ROUND_ID'::uuid and calculation_version=1;")" == "1" ]] || fail "exact replay fabricated a new evidence revision"
[[ "$(db_scalar "select count(*) from televoting.round_influence_results where round_id='$ROUND_ID'::uuid and calculation_version=1 and subject_type='cluster';")" == "2" ]] || fail "exact replay duplicated evidence rows"

log "Actor-scoped reconciliation returns the original successful receipt"
RECONCILED="$(auth_sql "select public.studio2_reconcile_operation('$OP1')::text;")"
python3 - "$RECONCILED" "$OP1" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['operationId']==sys.argv[2]
assert r['status']=='succeeded'
assert r['result']['evidenceRevision']==1
assert r['result']['rowCount']==2
PY

log "Semantic reuse of the same idempotency key fails closed"
db_expect_failure "same-key changed-evidence conflict" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select televoting.studio2_apply_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$EVIDENCE_V2'::jsonb,'$OP_CONFLICT','result-integrity-op-1','$CORR1');"
[[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$OP_CONFLICT'::uuid;")" == "0" ]] || fail "conflicting operation left a second durable receipt"
[[ "$(db_scalar "select evidence_revision from televoting.round_integrity_evidence_versions where round_id='$ROUND_ID'::uuid and calculation_version=1;")" == "1" ]] || fail "conflict mutated evidence revision"

log "A distinct governed recompute replaces evidence and advances only evidence revision"
RESULT2="$(auth_sql "select televoting.studio2_apply_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$EVIDENCE_V2'::jsonb,'$OP2','result-integrity-op-2','$CORR2')::text;")"
python3 - "$RESULT2" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['calculationVersion']==1
assert r['evidenceRevision']==2
assert r['rowCount']==1
PY
[[ "$(db_scalar "select count(*) from televoting.round_influence_results where round_id='$ROUND_ID'::uuid and calculation_version=1 and subject_type='cluster';")" == "1" ]] || fail "second recompute did not replace the complete cluster set"
[[ "$(db_scalar "select subject_key from televoting.round_influence_results where round_id='$ROUND_ID'::uuid and calculation_version=1 and subject_type='cluster';")" == "cluster-alpha" ]] || fail "second recompute retained stale cluster evidence"
[[ "$(db_scalar "select evidence_revision from televoting.round_integrity_evidence_versions where round_id='$ROUND_ID'::uuid and calculation_version=1;")" == "2" ]] || fail "second recompute did not advance evidence revision"

log "Wrong-edition requests fail before any operation can be claimed"
db_expect_failure "foreign edition recompute" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select televoting.studio2_apply_result_integrity_recompute('$WRONG_EDITION','$ROUND_ID',1,'$EVIDENCE_V2'::jsonb,'$OP_WRONG_EDITION','wrong-edition','$OP_WRONG_EDITION');"
[[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$OP_WRONG_EDITION'::uuid;")" == "0" ]] || fail "wrong-edition request created an operation receipt"

log "Advancing the canonical calculation makes new stale recompute requests reject"
db_exec "update televoting.rounds set calculation_version=2 where id='$ROUND_ID'::uuid;"
db_expect_failure "stale calculation version" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select televoting.studio2_apply_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$EVIDENCE_V2'::jsonb,'$OP_STALE','stale-calculation','$OP_STALE');"
[[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$OP_STALE'::uuid;")" == "0" ]] || fail "stale calculation request left a processing receipt"
[[ "$(db_scalar "select evidence_revision from televoting.round_integrity_evidence_versions where round_id='$ROUND_ID'::uuid and calculation_version=1;")" == "2" ]] || fail "stale request changed prior evidence provenance"
[[ "$(db_scalar "select count(*) from televoting.round_influence_results where round_id='$ROUND_ID'::uuid and calculation_version=1 and subject_type='cluster';")" == "1" ]] || fail "stale request damaged prior evidence"

log "Lost-response replay lookup survives mutable calculation advance"
POST_ADVANCE_REPLAY="$(auth_sql "select televoting.studio2_replay_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$OP_CONFLICT','result-integrity-op-1')::text;")"
python3 - "$POST_ADVANCE_REPLAY" "$OP1" "$EDITION_ID" "$ROUND_ID" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['found'] is True
assert r['operationId']==sys.argv[2]
assert r['status']=='succeeded'
assert r['result']['solarisEditionId']==sys.argv[3]
assert r['result']['roundId']==sys.argv[4]
assert r['result']['calculationVersion']==1
assert r['result']['rowCount']==2
PY

db_expect_failure "same receipt changed calculation identity" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select televoting.studio2_replay_result_integrity_recompute('$EDITION_ID','$ROUND_ID',2,'$OP1','result-integrity-op-1');"

MISSING_REPLAY="$(auth_sql "select televoting.studio2_replay_result_integrity_recompute('$EDITION_ID','$ROUND_ID',1,'$OP_STALE','stale-calculation')::text;")"
python3 - "$MISSING_REPLAY" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r == {'found': False}
PY

log "Browser/authenticated direct evidence writes remain unavailable"
db_expect_failure "direct authenticated evidence insert" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key,members) values ('$ROUND_ID',2,'cluster','direct-bypass','[]'::jsonb);"

log "Derived integrity recompute never changes ballots or official result rows"
[[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$ROUND_ID'::uuid;")" == "$BASE_BALLOTS" ]] || fail "Result Integrity operation mutated ballot rows"
[[ "$(db_scalar "select count(*) from televoting.round_results where round_id='$ROUND_ID'::uuid;")" == "$BASE_RESULTS" ]] || fail "Result Integrity operation mutated official result rows"
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id in ('$OP1'::uuid,'$OP2'::uuid);")" == "0" ]] || fail "derived evidence refresh emitted an undeclared consequence event"

log "All governed Result Integrity operation checks passed"
