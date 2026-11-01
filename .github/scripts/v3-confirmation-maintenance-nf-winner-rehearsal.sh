#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-maintenance-nf-winner] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-maintenance-nf-winner] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Local-only destructive rehearsal. Never allow this fixture to point at hosted Supabase.
eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

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
expect_db_failure() {
  local label="$1" sql="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c781'
EDITION_ID='00000000-0000-4000-8000-00000000e781'
ROUND_ID='00000000-0000-4000-8000-00000000a781'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f781'
NF_ID='00000000-0000-4000-8000-00000000b781'
NF_ENTRY_ID='00000000-0000-4000-8000-00000000d781'
NF_OTHER_ENTRY_ID='00000000-0000-4000-8000-00000000d782'
HOD_USER_ID='00000000-0000-4000-8000-00000000a782'
ORGANIZER_USER_ID='00000000-0000-4000-8000-00000000a783'
EDIT_OPERATION_ID='00000000-0000-4000-8000-00000000b782'
REVIEW_OPERATION_ID='00000000-0000-4000-8000-00000000b783'
REVIEW_CORRELATION_ID='00000000-0000-4000-8000-00000000b784'
SESSION_ID='maintenance-nf-winner-session'

log "Seeding a legacy accepted National Final without exact-version review evidence"
exec_sql "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values
  ('$HOD_USER_ID','authenticated','authenticated','maintenance-nf-hod@local.invalid',now(),now()),
  ('$ORGANIZER_USER_ID','authenticated','authenticated','maintenance-nf-organizer@local.invalid',now(),now());
insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','Maintenance NF Land','NFW');
insert into public.editions(id,name,year,slug,edition_number,status,published,editing_enabled)
values ('$EDITION_ID','Maintenance NF Winner E2E',2026,'maintenance-nf-winner-e2e',9781,'active',false,true);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','Closed NF confirmation wave','closed',now()-interval '2 days',now()-interval '1 day',true);
insert into public.country_accounts(user_id,country_id,status)
values ('$HOD_USER_ID','$COUNTRY_ID','active');
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,country_account,has_country_account,
  participating,selection_method,entry_unknown,nf_entries_unknown,browser_session_id,
  editing_allowed,locked,edit_count
) values (
  '$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','maintenance_nf_hod','Maintenance NF Land','NFW',true,
  true,'national_final',false,false,'$SESSION_ID',false,false,0
);
insert into public.national_finals(
  id,submission_id,country_id,edition_id,nf_name,expected_entry_count,lineup_published,results_published
) values (
  '$NF_ID','$SUBMISSION_ID','$COUNTRY_ID','$EDITION_ID','Fixture National Final',2,true,false
);
insert into public.national_final_entries(
  id,national_final_id,artist,song_title,song_url,position,review_status
) values
  ('$NF_ENTRY_ID','$NF_ID','Fixture Winner Artist','Legacy Winner','https://example.invalid/nf-winner',1,'accepted'),
  ('$NF_OTHER_ENTRY_ID','$NF_ID','Fixture Other Artist','Other Song','https://example.invalid/nf-other',2,'accepted');

update public.studio2_confirmation_requirements
set status='satisfied',
    reason='Already confirmed before maintenance NF correction',
    resolved_by_submission_id='$SUBMISSION_ID',
    resolved_at=coalesce(resolved_at,now()-interval '1 day'),
    updated_at=now()
where edition_id='$EDITION_ID' and country_id='$COUNTRY_ID' and superseded_at is null;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$ORGANIZER_USER_ID','confirmation.read',null),
  ('$ORGANIZER_USER_ID','confirmation.manage','$EDITION_ID');
update public.studio2_platform_operational_state
set mode='read_only',version=version+1,reason='Maintenance NF winner rehearsal'
where singleton=true;
"

OLD_VERSION="$(scalar "select current_version_id from public.national_final_entries where id='$NF_ENTRY_ID';")"
[[ -n "$OLD_VERSION" ]] || fail "legacy NF entry did not receive current_version_id"
expect_eq "legacy accepted observation has no exact review binding" "$(scalar "select coalesce(reviewed_version_id::text,'') from public.national_final_entries where id='$NF_ENTRY_ID';")" ""
expect_eq "fixture starts without canonical winner" "$(scalar "select coalesce(winning_entry_id::text,'') from public.national_finals where id='$NF_ID';")" ""

log "Organizer reopens only the existing NF response"
as_user "$ORGANIZER_USER_ID" "select public.admin_update_confirmation_controls('$SUBMISSION_ID'::uuid,true,false,'Maintenance NF correction opened');" >/dev/null
expect_eq "NF response editing opened" "$(scalar "select editing_allowed::text from public.submissions where id='$SUBMISSION_ID';")" "true"
expect_eq "NF round remains closed" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"

log "HOD mints an edit token and saves a corrected declared winner"
EDIT_TOKEN="$(as_user "$HOD_USER_ID" "select public.public_create_country_account_edit_token('$ROUND_ID'::uuid)->>'token';")"
[[ -n "$EDIT_TOKEN" ]] || fail "country-account NF edit token was not returned"
EDIT_TOKEN_HASH="$(scalar "select encode(extensions.digest(convert_to('$EDIT_TOKEN','UTF8'),'sha256'),'hex');")"

SUBMIT_RESULT="$(as_user "$HOD_USER_ID" "
select public.v3_submit_confirmation(
  jsonb_build_object(
    'round_id','$ROUND_ID',
    'instagram_username','maintenance_nf_hod',
    'country','Maintenance NF Land',
    'country_account','NFW',
    'has_country_account',true,
    'participating',true,
    'selection_method','national_final',
    'entry_unknown',false,
    'nf_entries_unknown',false,
    'artist','Fixture Winner Artist',
    'song_title','Corrected Winner',
    'song_url','https://example.invalid/nf-winner-corrected',
    'credits','[]'::jsonb,
    'preview_start','00:10',
    'preview_end','00:35',
    'final_clip_start','00:20',
    'final_clip_end','01:50',
    'replacement_video_required',false,
    'replacement_video_url','',
    'nf_name','Fixture National Final',
    'expected_entry_count',2,
    'nf_entries',jsonb_build_array(
      jsonb_build_object(
        'artist','Fixture Winner Artist',
        'song_title','Corrected Winner',
        'song_url','https://example.invalid/nf-winner-corrected',
        'credits','[]'::jsonb
      ),
      jsonb_build_object(
        'artist','Fixture Other Artist',
        'song_title','Other Song',
        'song_url','https://example.invalid/nf-other',
        'credits','[]'::jsonb
      )
    ),
    'nf_date_type','unknown',
    'nf_result_date_type','unknown',
    'reveal_date_type','immediate',
    'browser_session_id','$SESSION_ID',
    'edit_token_hash','$EDIT_TOKEN_HASH'
  ),
  '$EDIT_OPERATION_ID'::uuid,
  'database-derived-nf-winner',
  '$SESSION_ID'
)::text;")"
expect_eq "NF edit accepted" "$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1])["ok"]).lower())' "$SUBMIT_RESULT")" "true"
expect_eq "same NF response updated" "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["submission_id"])' "$SUBMIT_RESULT")" "$SUBMISSION_ID"
expect_eq "NF correction creates no duplicate response" "$(scalar "select count(*) from public.submissions where edition_id='$EDITION_ID' and country='Maintenance NF Land';")" "1"

# Changing artist/title is modeled by submit_confirmation as replacement of the
# NF entry row, not an identity-preserving content edit. Resolve the canonical
# post-save row instead of assuming the fixture UUID survives that replacement.
SAVED_WINNER_ENTRY_ID="$(scalar "select id from public.national_final_entries where national_final_id='$NF_ID' and coalesce(removed,false)=false and artist='Fixture Winner Artist' and song_title='Corrected Winner' limit 1;")"
[[ -n "$SAVED_WINNER_ENTRY_ID" ]] || fail "corrected NF winner row was not persisted"
expect_eq "corrected NF winner content persisted" "$(scalar "select song_title from public.national_final_entries where id='$SAVED_WINNER_ENTRY_ID';")" "Corrected Winner"

NEW_VERSION="$(scalar "select current_version_id from public.national_final_entries where id='$SAVED_WINNER_ENTRY_ID';")"
[[ -n "$NEW_VERSION" && "$NEW_VERSION" != "$OLD_VERSION" ]] || fail "NF correction did not create a new exact entry version"
expect_eq "declared winner is staged, not canonical" "$(scalar "select coalesce(winning_entry_id::text,'') from public.national_finals where id='$NF_ID';")" ""
expect_eq "pending winner records participant intent" "$(scalar "select pending_winning_entry_id::text from public.national_finals where id='$NF_ID';")" "$SAVED_WINNER_ENTRY_ID"
expect_eq "declared winner awaits organizer review" "$(scalar "select review_status from public.national_final_entries where id='$SAVED_WINNER_ENTRY_ID';")" "pending"
expect_eq "new exact version is not pre-approved" "$(scalar "select coalesce(reviewed_version_id::text,'') from public.national_final_entries where id='$SAVED_WINNER_ENTRY_ID';")" ""

expect_db_failure "manual canonical winner still requires exact review" \
  "update public.national_finals set winning_entry_id='$SAVED_WINNER_ENTRY_ID' where id='$NF_ID';"

log "Organizer accepts the exact staged version and promotion becomes atomic"
CAS_VERSION="$(scalar "select coalesce(version,1) from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID';")"
REVIEW_RESULT="$(as_user "$ORGANIZER_USER_ID" "
select public.studio2_apply_confirmation_entry_review(
  'national_final',
  '$SAVED_WINNER_ENTRY_ID'::uuid,
  'accepted',
  null,
  '$REVIEW_OPERATION_ID'::uuid,
  'maintenance-nf-winner-accept',
  $CAS_VERSION,
  '$NEW_VERSION'::uuid,
  '$REVIEW_CORRELATION_ID'::uuid
)::text;")"
expect_eq "exact NF review accepted" "$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1])["ok"]).lower())' "$REVIEW_RESULT")" "true"
expect_eq "review binds exact current version" "$(scalar "select reviewed_version_id::text from public.national_final_entries where id='$SAVED_WINNER_ENTRY_ID';")" "$NEW_VERSION"
expect_eq "accepted pending winner becomes canonical" "$(scalar "select winning_entry_id::text from public.national_finals where id='$NF_ID';")" "$SAVED_WINNER_ENTRY_ID"
expect_eq "pending winner clears after promotion" "$(scalar "select coalesce(pending_winning_entry_id::text,'') from public.national_finals where id='$NF_ID';")" ""
expect_eq "review history records exact promoted version" "$(scalar "select reviewed_version_id::text from public.submission_review_history where submission_id='$SUBMISSION_ID' and target_entry_id='$SAVED_WINNER_ENTRY_ID' order by created_at desc limit 1;")" "$NEW_VERSION"
expect_eq "NF response revision advances once" "$(scalar "select edit_count from public.submissions where id='$SUBMISSION_ID';")" "1"
expect_eq "NF round remains closed after correction" "$(scalar "select status from public.submission_rounds where id='$ROUND_ID';")" "closed"

log "PASS: participant NF winner intent stages safely and promotes only after exact Organizer review"
