#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-media-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-media-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
expect_db_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

COUNTRY_ID='00000000-0000-4000-8000-00000000cb01'
EDITION_ID='00000000-0000-4000-8000-00000000eb01'
ENTRY_ID='00000000-0000-4000-8000-00000000db01'
REVIEW_ID='00000000-0000-4000-8000-00000000ab01'
VIDEO_ONE='https://example.invalid/media/video-v1.mp4'
VIDEO_TWO='https://example.invalid/media/video-v2.mp4'

log "Seeding one canonical current Media source"
db_exec "insert into public.countries(id,name,short_code,flag_image) values ('$COUNTRY_ID','S3 Media Country','S3M','https://example.invalid/media/flag-v1.png');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published,logo) values ('$EDITION_ID','S3 Media Invariants',2026,'s3-media-invariants',9912,'active',false,'https://example.invalid/media/logo-v1.png');"
db_exec "insert into public.entries(id,edition_id,country_id,artist,song_title,song_url,status) values ('$ENTRY_ID','$EDITION_ID','$COUNTRY_ID','Media artist','Media song','$VIDEO_ONE','confirmed');"

db_exec "insert into public.studio2_media_asset_reviews(id,edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason) values ('$REVIEW_ID','$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID','$VIDEO_ONE','approved','Exact current revision accepted');"

[[ "$(db_value "select private.v3_media_asset_is_currently_accepted('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID');")" == 't' ]] || fail "exact current Media revision was not accepted"

expect_db_failure "cross-scope Entry review" "insert into public.studio2_media_asset_reviews(edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason) values ('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video',gen_random_uuid(),'$ENTRY_ID','$VIDEO_ONE','approved','Wrong country scope');"
expect_db_failure "review evidence rewrite" "update public.studio2_media_asset_reviews set decision='invalid' where id='$REVIEW_ID';"

log "Changing canonical source supersedes the accepted revision"
db_exec "update public.entries set song_url='$VIDEO_TWO' where id='$ENTRY_ID';"
[[ "$(db_value "select count(*) from public.studio2_media_asset_reviews where id='$REVIEW_ID' and superseded_at is not null;")" == '1' ]] || fail "source change did not supersede prior review"
[[ "$(db_value "select private.v3_media_asset_is_currently_accepted('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID');")" == 'f' ]] || fail "superseded Media revision remained accepted"

expect_db_failure "stale source approval" "insert into public.studio2_media_asset_reviews(edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason) values ('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID','$VIDEO_ONE','approved','Stale source decision');"

db_exec "insert into public.studio2_media_asset_reviews(edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason) values ('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID','$VIDEO_TWO','approved','Replacement revision accepted');"
[[ "$(db_value "select private.v3_media_asset_is_currently_accepted('$EDITION_ID','entry:$ENTRY_ID:performance_video','performance_video','$COUNTRY_ID','$ENTRY_ID');")" == 't' ]] || fail "replacement Media revision was not accepted"

[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_s3_guard_media_asset_review','v3_s3_supersede_entry_media_reviews','v3_s3_supersede_country_flag_reviews','v3_s3_supersede_edition_logo_reviews') and tgenabled <> 'D';")" == '4' ]] || fail "S3 Media invariant triggers are not all enabled"

log "System V3 S3 Media invariant rehearsal passed"
