#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-maintenance-round-claim] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-maintenance-round-claim] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}
as_marked_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; select set_config('studio2.confirmation_maintenance_write','on',true); $sql; commit;"
}
expect_eq() {
  local label="$1" actual="$2" expected="$3"
  [[ "$actual" == "$expected" ]] || fail "$label expected '$expected', got '$actual'"
  log "PASS: $label"
}
expect_denied() {
  local label="$1" user_id="$2" sql="$3"
  if as_user "$user_id" "$sql" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label"
}

EDITION_ID='00000000-0000-4000-8000-00000000e771'
ROUND_ID='00000000-0000-4000-8000-00000000a771'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f771'
ORGANIZER_USER_ID='00000000-0000-4000-8000-00000000a773'
PAUSE_OPERATION_ID='00000000-0000-4000-8000-00000000c771'
RESUME_OPERATION_ID='00000000-0000-4000-8000-00000000c772'

expect_eq "fixture remains read_only" "$(scalar "select mode from public.studio2_platform_operational_state where singleton=true;")" "read_only"
expect_eq "fixture round starts editing-enabled" "$(scalar "select editing_enabled::text from public.submission_rounds where id='$ROUND_ID';")" "true"

VERSION="$(scalar "select version from public.studio2_confirmation_round_versions where round_id='$ROUND_ID';")"
[[ -n "$VERSION" ]] || fail "round version is missing"

log "The canonical operation claim still fails closed without the pre-request marker"
expect_denied "unmarked round editing operation is denied in read_only" "$ORGANIZER_USER_ID" \
  "select public.studio2_apply_confirmation_round_change('$ROUND_ID'::uuid,'editing',jsonb_build_object('enabled',false),'$PAUSE_OPERATION_ID'::uuid,'maintenance-round-pause',$VERSION);"

log "The exact maintenance marker permits the existing-round editing operation"
as_marked_user "$ORGANIZER_USER_ID" \
  "select public.studio2_apply_confirmation_round_change('$ROUND_ID'::uuid,'editing',jsonb_build_object('enabled',false),'$PAUSE_OPERATION_ID'::uuid,'maintenance-round-pause',$VERSION);" >/dev/null
expect_eq "round editing paused" "$(scalar "select editing_enabled::text from public.submission_rounds where id='$ROUND_ID';")" "false"
expect_eq "response editing remains closed while round is paused" "$(scalar "select editing_allowed::text from public.submissions where id='$SUBMISSION_ID';")" "false"

VERSION="$(scalar "select version from public.studio2_confirmation_round_versions where round_id='$ROUND_ID';")"
[[ -n "$VERSION" ]] || fail "round version is missing after pause"

log "The marked operation can resume corrections without reopening submissions"
as_marked_user "$ORGANIZER_USER_ID" \
  "select public.studio2_apply_confirmation_round_change('$ROUND_ID'::uuid,'editing',jsonb_build_object('enabled',true),'$RESUME_OPERATION_ID'::uuid,'maintenance-round-resume',$VERSION);" >/dev/null
expect_eq "round editing resumed" "$(scalar "select editing_enabled::text from public.submission_rounds where id='$ROUND_ID';")" "true"
expect_eq "round status stays closed" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"
expect_eq "existing response receives correction access" "$(scalar "select editing_allowed::text from public.submissions where id='$SUBMISSION_ID';")" "true"

expect_eq "pause receipt succeeded" "$(scalar "select status from public.studio2_operation_receipts where operation_id='$PAUSE_OPERATION_ID';")" "succeeded"
expect_eq "resume receipt succeeded" "$(scalar "select status from public.studio2_operation_receipts where operation_id='$RESUME_OPERATION_ID';")" "succeeded"

log "PASS: read_only Confirmation round editing reaches and completes the canonical operation contract only with the maintenance marker"
