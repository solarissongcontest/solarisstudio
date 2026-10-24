#!/usr/bin/env bash
set -euo pipefail

log(){ printf '\n[v3-p14-entry-media] %s\n' "$*" >&2; }
fail(){ printf '\n[v3-p14-entry-media] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db(){ psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
scalar(){ psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
json_get(){ python3 -c 'import json,sys; v=json.load(sys.stdin); [v:=v[int(k)] if isinstance(v,list) else v[k] for k in sys.argv[1].split(".")]; print("" if v is None else (str(v).lower() if isinstance(v,bool) else v))' "$1"; }

auth_query(){
  local actor="$1" sql="$2" claims
  claims="$(python3 -c 'import json,sys; print(json.dumps({"sub":sys.argv[1],"role":"authenticated","iss":sys.argv[2]+"/auth/v1"}))' "$actor" "$API_URL")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role authenticated; set \"request.jwt.claim.sub\"='$actor'; set \"request.jwt.claims\"='$claims'; $sql"
}
auth_reject(){
  local label="$1" actor="$2" sql="$3" output claims
  claims="$(python3 -c 'import json,sys; print(json.dumps({"sub":sys.argv[1],"role":"authenticated","iss":sys.argv[2]+"/auth/v1"}))' "$actor" "$API_URL")"
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role authenticated; set \"request.jwt.claim.sub\"='$actor'; set \"request.jwt.claims\"='$claims'; $sql" >"$output" 2>&1; then
    cat "$output" >&2; rm -f "$output"; fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"; log "PASS: $label rejected"
}

OWNER='00000000-0000-4000-8000-000000009141'
OUTSIDER='00000000-0000-4000-8000-000000009142'
COUNTRY='00000000-0000-4000-8000-00000000c914'
EDITION='00000000-0000-4000-8000-00000000e914'
PARTICIPANT='00000000-0000-4000-8000-00000000a914'
ENTRY='00000000-0000-4000-8000-00000000d914'
REVIEW='00000000-0000-4000-8000-00000000b914'

log "Seed one exact participant-owned Entry"
db "insert into auth.users(id,aud,role,email,created_at,updated_at) values ('$OWNER','authenticated','authenticated','p14-owner@local.invalid',now(),now()),('$OUTSIDER','authenticated','authenticated','p14-outsider@local.invalid',now(),now()); insert into public.countries(id,name,short_code) values ('$COUNTRY','P14 Media Country','P14M'); insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION','P14 Entry Media',2026,'p14-entry-media',9914,'active',false); insert into public.participants(id,edition_id,country_id,artist,song,semi_final) values ('$PARTICIPANT','$EDITION','$COUNTRY','P14 Artist','P14 Song','final'); insert into public.country_accounts(user_id,country_id,status) values ('$OWNER','$COUNTRY','active'); insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at) values ('$OWNER','$COUNTRY','$EDITION','mine',now()); insert into public.entries(id,edition_id,country_id,artist,song_title,song_url,status,metadata) values ('$ENTRY','$EDITION','$COUNTRY','P14 Artist','P14 Song','https://example.invalid/p14-song','confirmed','{}'::jsonb);"

auth_reject "cross-delegation prepare" "$OUTSIDER" "select public.v3_prepare_entry_media_upload('$ENTRY','artist_photo','artist.png','image/png',64);"
auth_reject "unsupported audio prepare" "$OWNER" "select public.v3_prepare_entry_media_upload('$ENTRY','audio_master','song.mp3','audio/mpeg',64);"

log "Prepare one participant-owned artist photo"
PREPARED="$(auth_query "$OWNER" "select public.v3_prepare_entry_media_upload('$ENTRY','artist_photo','artist.png','image/png',64);")"
TOKEN="$(printf '%s' "$PREPARED" | json_get token_id)"
[[ -n "$TOKEN" ]] || fail "prepare did not return token_id"
[[ "$(printf '%s' "$PREPARED" | json_get entry_id)" == "$ENTRY" ]] || fail "prepare lost exact Entry identity"
[[ "$(printf '%s' "$PREPARED" | json_get asset_type)" == 'artist_photo' ]] || fail "prepare lost exact asset type"

PROJECTION="$(auth_query "$OWNER" "select public.v3_my_entry_media('$ENTRY');")"
[[ "$(printf '%s' "$PROJECTION" | json_get assets.0.state)" == 'processing' ]] || fail "prepared upload did not project processing"
[[ "$PROJECTION" != *upload_secret* && "$PROJECTION" != *quarantine* ]] || fail "participant projection leaked upload internals"

log "Simulate only the trusted finalizer's verified-token outcome on disposable local data"
db "update public.studio2_upload_authorizations set status='verified', detected_mime='image/png', verified_metadata=jsonb_build_object('mime','image/png','size',64), finalized_at=now() where id='$TOKEN'::uuid;"

COMMITTED="$(auth_query "$OWNER" "select public.v3_commit_entry_media_upload('$TOKEN');")"
[[ "$(printf '%s' "$COMMITTED" | json_get operationId)" == "$TOKEN" ]] || fail "commit did not bind operation identity to verified token"
[[ "$(printf '%s' "$COMMITTED" | json_get receiptId)" == "$TOKEN" ]] || fail "commit receipt identity mismatch"
[[ "$(printf '%s' "$COMMITTED" | json_get replayed)" == 'false' ]] || fail "first commit was marked replayed"
SOURCE="$(printf '%s' "$COMMITTED" | json_get sourceFingerprint)"
case "$SOURCE" in http://127.0.0.1:*/storage/v1/object/public/country-media/*|http://localhost:*/storage/v1/object/public/country-media/*) ;; *) fail "source was not derived from the signed local project identity: $SOURCE" ;; esac
[[ "$(scalar "select metadata ->> 'artist_photo_url' from public.entries where id='$ENTRY';")" == "$SOURCE" ]] || fail "canonical Entry media slot did not receive verified source"
[[ "$(scalar "select command || ':' || status from public.studio2_operation_receipts where operation_id='$TOKEN'::uuid;")" == 'entry.media.commit:succeeded' ]] || fail "durable Entry-media receipt missing"

REPLAY="$(auth_query "$OWNER" "select public.v3_commit_entry_media_upload('$TOKEN');")"
[[ "$(printf '%s' "$REPLAY" | json_get operationId)" == "$TOKEN" && "$(printf '%s' "$REPLAY" | json_get replayed)" == 'true' ]] || fail "same-token replay did not reconcile to original operation"
[[ "$(scalar "select count(*) from public.studio2_operation_receipts where operation_id='$TOKEN'::uuid;")" == '1' ]] || fail "replay duplicated operation receipt"

log "Project participant-safe replacement-required state"
db "insert into public.studio2_media_asset_reviews(id,edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason) values ('$REVIEW','$EDITION','entry:$ENTRY:artist_photo','artist_photo','$COUNTRY','$ENTRY','$SOURCE','invalid','Internal organizer-only reason must not leak');"
PROJECTION="$(auth_query "$OWNER" "select public.v3_my_entry_media('$ENTRY');")"
[[ "$(printf '%s' "$PROJECTION" | json_get assets.0.state)" == 'replacement_required' ]] || fail "invalid exact-source review did not project replacement_required"
[[ "$(printf '%s' "$PROJECTION" | json_get assets.0.reason)" == 'Organizer review requires a replacement for this media.' ]] || fail "participant-safe replacement reason mismatch"
[[ "$PROJECTION" != *"Internal organizer-only reason"* ]] || fail "Organizer review reason leaked to participant"

log "Reject a verified cover token after the canonical slot changes"
COVER="$(auth_query "$OWNER" "select public.v3_prepare_entry_media_upload('$ENTRY','cover_artwork','cover.png','image/png',64);")"
COVER_TOKEN="$(printf '%s' "$COVER" | json_get token_id)"
db "update public.studio2_upload_authorizations set status='verified', detected_mime='image/png', verified_metadata=jsonb_build_object('mime','image/png','size',64), finalized_at=now() where id='$COVER_TOKEN'::uuid; update public.entries set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cover_artwork_url','https://example.invalid/concurrent-cover.png','cover_artwork_processing',false) where id='$ENTRY';"
auth_reject "stale cover token" "$OWNER" "select public.v3_commit_entry_media_upload('$COVER_TOKEN');"
[[ "$(scalar "select metadata ->> 'cover_artwork_url' from public.entries where id='$ENTRY';")" == 'https://example.invalid/concurrent-cover.png' ]] || fail "stale token overwrote newer canonical cover"
[[ "$(scalar "select count(*) from public.studio2_operation_receipts where operation_id='$COVER_TOKEN'::uuid;")" == '0' ]] || fail "failed stale-token transaction fabricated a durable receipt"

log "P14 Entry Media authority rehearsal passed"
