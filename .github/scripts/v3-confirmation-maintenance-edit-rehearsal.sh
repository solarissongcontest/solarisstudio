#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-maintenance-edit] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-maintenance-edit] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Local-only destructive rehearsal. Never allow this fixture to point at hosted Supabase.
eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

python3 - "${API_URL:-}" <<'PY_LOCAL_API'
import sys
from urllib.parse import urlparse
endpoint = urlparse(sys.argv[1])
if endpoint.scheme != 'http' or endpoint.hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise SystemExit('Refusing non-local Confirmation maintenance API')
PY_LOCAL_API

scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
exec_sql() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
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

COUNTRY_ID='00000000-0000-4000-8000-00000000c771'
EDITION_ID='00000000-0000-4000-8000-00000000e771'
ROUND_ID='00000000-0000-4000-8000-00000000a771'
OTHER_EDITION_ID='00000000-0000-4000-8000-00000000e775'
OTHER_ROUND_ID='00000000-0000-4000-8000-00000000a775'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f771'
ENTRY_ID='00000000-0000-4000-8000-00000000d771'
HOD_USER_ID='00000000-0000-4000-8000-00000000a772'
ORGANIZER_USER_ID='00000000-0000-4000-8000-00000000a773'
INSPECTOR_USER_ID='00000000-0000-4000-8000-00000000a774'
EDIT_OPERATION_ID='00000000-0000-4000-8000-00000000b772'
SESSION_ID='maintenance-edit-session'

log "Seeding one already-confirmed response in a closed round"
exec_sql "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values
  ('$HOD_USER_ID','authenticated','authenticated','maintenance-hod@local.invalid',now(),now()),
  ('$ORGANIZER_USER_ID','authenticated','authenticated','maintenance-organizer@local.invalid',now(),now()),
  ('$INSPECTOR_USER_ID','authenticated','authenticated','maintenance-inspector@local.invalid',now(),now());
insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','Maintenance Editland','MED');
insert into public.editions(id,name,year,slug,edition_number,status,published,editing_enabled)
values ('$EDITION_ID','Maintenance Confirmation E2E',2026,'maintenance-confirmation-e2e',9771,'active',false,true);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','Closed confirmation wave','closed',now()-interval '2 days',now()-interval '1 day',true);
insert into public.editions(id,name,year,slug,edition_number,status,published,editing_enabled)
values ('$OTHER_EDITION_ID','Unrelated Confirmation edition',2026,'unrelated-calendar-edition',9775,'draft',false,false);
insert into public.submission_rounds(id,edition_id,name,status,editing_enabled)
values ('$OTHER_ROUND_ID','$OTHER_EDITION_ID','Unrelated wave','closed',false);
insert into public.country_accounts(user_id,country_id,status)
values ('$HOD_USER_ID','$COUNTRY_ID','active');
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,country_account,has_country_account,
  participating,selection_method,entry_unknown,nf_entries_unknown,browser_session_id,
  editing_allowed,locked,edit_count
) values (
  '$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','maintenance_hod','Maintenance Editland','MED',true,
  true,'internal',false,false,'$SESSION_ID',false,false,0
);
insert into public.internal_entries(
  id,submission_id,artist,song_title,song_url,preview_start,preview_end,
  final_clip_start,final_clip_end,replacement_video_required,review_status
) values (
  '$ENTRY_ID','$SUBMISSION_ID','Fixture Artist','Original Song','https://example.invalid/original',
  '00:10','00:35','00:20','01:50',false,'accepted'
);

-- The canonical submission trigger creates/resolves the effective requirement.
-- Reuse that row instead of manufacturing a duplicate fixture requirement.
update public.studio2_confirmation_requirements
set status='satisfied',
    reason='Already confirmed before maintenance correction',
    resolved_by_submission_id='$SUBMISSION_ID',
    resolved_at=coalesce(resolved_at,now()-interval '1 day'),
    updated_at=now()
where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$ORGANIZER_USER_ID','confirmation.read',null),
  ('$ORGANIZER_USER_ID','confirmation.manage','$EDITION_ID'),
  ('$INSPECTOR_USER_ID','confirmation.read','$EDITION_ID');
update public.studio2_platform_operational_state
set mode='read_only',version=version+1,reason='Maintenance Confirmation rehearsal'
where singleton=true;
"

expect_eq "fixture round is closed" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"
expect_eq "fixture has one response" "$(scalar "select count(*) from public.submissions where edition_id='$EDITION_ID' and country='Maintenance Editland';")" "1"
expect_eq "fixture has one effective requirement" "$(scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;")" "1"
expect_eq "fixture is already confirmed" "$(scalar "select status from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;")" "satisfied"

log "Read-only inspector can inspect Confirmation state but cannot mutate it"
COCKPIT="$(as_user "$INSPECTOR_USER_ID" "select public.studio2_country_cockpit('$EDITION_ID'::uuid)::text;")"
[[ -n "$COCKPIT" && "$COCKPIT" != "null" ]] || fail "country cockpit returned no state"
DETAIL="$(as_user "$INSPECTOR_USER_ID" "select public.admin_confirmation_response('$SUBMISSION_ID'::uuid)::text;")"
[[ "$DETAIL" == *"Original Song"* ]] || fail "response detail did not include fixture song"
expect_denied "confirmation.read cannot reopen a response" "$INSPECTOR_USER_ID" \
  "select public.admin_update_confirmation_controls('$SUBMISSION_ID'::uuid,true,false,'Read-only actor must not mutate');"

# These checks must prove authorization denial, never pass on an unrelated SQL error.
expect_calendar_denied() {
  local label="$1" actor="$2" sql="$3" output
  if output="$(as_user "$actor" "$sql" 2>&1)"; then
    fail "$label unexpectedly succeeded"
  fi
  printf '%s' "$output" | grep -Fq 'Missing Solaris capability: confirmation.read' || fail "$label did not fail through canonical read authorization"
  log "PASS: $label"
}

log "Calendar read authority remains exact-edition and read-only"
CALENDAR="$(as_user "$INSPECTOR_USER_ID" "select public.admin_confirmation_calendar('$EDITION_ID'::uuid,'$ROUND_ID'::uuid)::text;")"
expect_eq "Calendar exact-edition response cardinality" "$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$CALENDAR")" "1"
expect_eq "Calendar exact response identity" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])[0]["id"])' "$CALENDAR")" "$SUBMISSION_ID"
expect_eq "Calendar exact edition identity" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])[0]["edition_id"])' "$CALENDAR")" "$EDITION_ID"
expect_eq "Calendar exact round identity" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])[0]["round_id"])' "$CALENDAR")" "$ROUND_ID"
expect_eq "Calendar excludes a foreign round" "$(as_user "$INSPECTOR_USER_ID" "select jsonb_array_length(public.admin_confirmation_calendar('$EDITION_ID'::uuid,'$OTHER_ROUND_ID'::uuid));")" "0"
expect_calendar_denied "Calendar denies an edition outside the scoped read grant" "$INSPECTOR_USER_ID" \
  "select public.admin_confirmation_calendar('$OTHER_EDITION_ID'::uuid,'$OTHER_ROUND_ID'::uuid);"
expect_calendar_denied "Calendar denies a participant without Organizer read authority" "$HOD_USER_ID" \
  "select public.admin_confirmation_calendar('$EDITION_ID'::uuid,'$ROUND_ID'::uuid);"
expect_calendar_denied "Calendar null scope cannot widen an edition-only read grant" "$INSPECTOR_USER_ID" \
  "select public.admin_confirmation_calendar(null,null);"

log "Exact-edition manager reopens only the existing response"
as_user "$ORGANIZER_USER_ID" "select public.admin_update_confirmation_controls('$SUBMISSION_ID'::uuid,true,false,'Maintenance correction opened');" >/dev/null
expect_eq "round remains closed after response reopen" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"
expect_eq "reopen creates no duplicate requirement" "$(scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;")" "1"
expect_eq "response editing opened" "$(scalar "select editing_allowed::text from public.submissions where id='$SUBMISSION_ID';")" "true"

DASHBOARD="$(as_user "$HOD_USER_ID" "select public.public_country_account_confirmation_dashboard()::text;")"
expect_eq "dashboard remains accepted" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["confirmation_state"])' "$DASHBOARD")" "accepted"
expect_eq "dashboard round remains closed" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["response"]["round"]["status"])' "$DASHBOARD")" "closed"
expect_eq "dashboard exposes response editing" "$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1])["editing_open"]).lower())' "$DASHBOARD")" "true"
expect_eq "dashboard shows original song" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["song_title"])' "$DASHBOARD")" "Original Song"

log "HOD mints an edit token even though the round itself is closed"
EDIT_TOKEN="$(as_user "$HOD_USER_ID" "select public.public_create_country_account_edit_token('$ROUND_ID'::uuid)->>'token';")"
[[ -n "$EDIT_TOKEN" ]] || fail "country-account edit token was not returned"
EDIT_TOKEN_HASH="$(scalar "select encode(extensions.digest(convert_to('$EDIT_TOKEN','UTF8'),'sha256'),'hex');")"

log "HOD edits the same canonical response"
SUBMIT_RESULT="$(as_user "$HOD_USER_ID" "
select public.v3_submit_confirmation(
  jsonb_build_object(
    'round_id','$ROUND_ID',
    'instagram_username','maintenance_hod',
    'country','Maintenance Editland',
    'country_account','MED',
    'has_country_account',true,
    'participating',true,
    'selection_method','internal',
    'entry_unknown',false,
    'nf_entries_unknown',false,
    'artist','Fixture Artist',
    'song_title','Corrected Song',
    'song_url','https://example.invalid/corrected',
    'preview_start','00:11',
    'preview_end','00:36',
    'final_clip_start','00:21',
    'final_clip_end','01:51',
    'replacement_video_required',false,
    'replacement_video_url','',
    'nf_entries','[]'::jsonb,
    'reveal_date_type','immediate',
    'browser_session_id','$SESSION_ID',
    'edit_token_hash','$EDIT_TOKEN_HASH'
  ),
  '$EDIT_OPERATION_ID'::uuid,
  'database-derived',
  '$SESSION_ID'
)::text;")"
expect_eq "edit accepted" "$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1])["ok"]).lower())' "$SUBMIT_RESULT")" "true"
expect_eq "same response updated" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["submission_id"])' "$SUBMIT_RESULT")" "$SUBMISSION_ID"
expect_eq "correction creates no duplicate response" "$(scalar "select count(*) from public.submissions where edition_id='$EDITION_ID' and country='Maintenance Editland';")" "1"
expect_eq "song revision persisted" "$(scalar "select song_title from public.internal_entries where submission_id='$SUBMISSION_ID';")" "Corrected Song"
expect_eq "response revision advances once" "$(scalar "select edit_count from public.submissions where id='$SUBMISSION_ID';")" "1"
expect_eq "round still closed after edit" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"
expect_eq "effective requirement remains singular" "$(scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;")" "1"

log "Organizer observes the revision and explicitly closes editing"
DETAIL="$(as_user "$ORGANIZER_USER_ID" "select public.admin_confirmation_response('$SUBMISSION_ID'::uuid)::text;")"
expect_eq "Organizer sees corrected song" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["internal_entry"]["song_title"])' "$DETAIL")" "Corrected Song"
expect_eq "Organizer sees edit revision" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["edit_count"])' "$DETAIL")" "1"
as_user "$ORGANIZER_USER_ID" "select public.admin_update_confirmation_controls('$SUBMISSION_ID'::uuid,false,false,'Maintenance correction reviewed and closed');" >/dev/null
expect_eq "response editing is closed" "$(scalar "select editing_allowed::text from public.submissions where id='$SUBMISSION_ID';")" "false"
expect_eq "active edit token is revoked" "$(scalar "select count(*) from public.edit_tokens where submission_id='$SUBMISSION_ID' and active=true;")" "0"

DASHBOARD="$(as_user "$HOD_USER_ID" "select public.public_country_account_confirmation_dashboard()::text;")"
expect_eq "HOD still sees accepted confirmation" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["confirmation_state"])' "$DASHBOARD")" "accepted"
expect_eq "HOD sees corrected song" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["song_title"])' "$DASHBOARD")" "Corrected Song"
expect_eq "HOD sees editing closed" "$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1])["editing_open"]).lower())' "$DASHBOARD")" "false"
expect_eq "final response count stays one" "$(scalar "select count(*) from public.submissions where edition_id='$EDITION_ID' and country='Maintenance Editland';")" "1"
expect_eq "final requirement count stays one" "$(scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;")" "1"
expect_eq "final round stays closed" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"

log "PASS: closed-round existing-response correction is single-response, visible, and revocable"
