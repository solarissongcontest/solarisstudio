#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-entry-invariants] %s\n' "$*"; }
fail() { printf '\n[v3-s3-entry-invariants] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

if [[ -z "${DB_URL:-}" ]]; then eval "$(supabase status -o env)"; fi
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

COUNTRY_ID='00000000-0000-4000-8000-00000000ca01'
EDITION_ID='00000000-0000-4000-8000-00000000ea01'
ROUND_ID='00000000-0000-4000-8000-00000000aa01'
SUBMISSION_ID='00000000-0000-4000-8000-00000000fa01'
ENTRY_ID='00000000-0000-4000-8000-00000000da01'

log "Seeding one owned canonical Entry"
db_exec "insert into public.countries(id,name,short_code) values ('$COUNTRY_ID','S3 Entry Country','S3X');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$EDITION_ID','S3 Entry Invariants',2026,'s3-entry-invariants',9911,'active',false);"
db_exec "insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled) values ('$ROUND_ID','$EDITION_ID','S3 Entry window','open',now()-interval '1 hour',now()+interval '1 hour',true);"
db_exec "insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,browser_session_id) values ('$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','s3_entry','S3 Entry Country',true,'s3-entry-session');"
db_exec "insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values ('$ENTRY_ID','$SUBMISSION_ID','Invariant artist','Invariant song','https://example.invalid/s3-entry');"

VERSION_ID="$(db_value "select current_version_id from public.internal_entries where id='$ENTRY_ID';")"
[[ -n "$VERSION_ID" ]] || fail "owned Entry did not receive a current version"
[[ "$(db_value "select count(*) from private.v3_entry_versions where id='$VERSION_ID' and entry_id='$ENTRY_ID' and revision=1;")" == '1' ]] || fail "current pointer does not reference revision 1"

HASH_EXPR="encode(extensions.digest('{}'::jsonb::text,'sha256'),'hex')"
expect_db_failure "skipped revision lineage" "insert into private.v3_entry_versions(target_type,entry_id,submission_id,edition_id,revision,parent_version_id,source,content,content_hash) values ('internal','$ENTRY_ID','$SUBMISSION_ID','$EDITION_ID',3,'$VERSION_ID','canonical_write','{}',(select $HASH_EXPR));"
expect_db_failure "forged immutable content hash" "insert into private.v3_entry_versions(target_type,entry_id,submission_id,edition_id,revision,parent_version_id,source,content,content_hash) values ('internal','$ENTRY_ID','$SUBMISSION_ID','$EDITION_ID',2,'$VERSION_ID','canonical_write','{}','forged');"
expect_db_failure "immutable version rewrite" "update private.v3_entry_versions set content='{}' where id='$VERSION_ID';"

log "Caller-supplied public pointers cannot replace server-owned truth"
db_exec "update public.internal_entries set current_version_id=gen_random_uuid(),content_revision=999 where id='$ENTRY_ID';"
[[ "$(db_value "select current_version_id::text || ':' || content_revision::text from public.internal_entries where id='$ENTRY_ID';")" == "$VERSION_ID:1" ]] || fail "public pointer tamper was not neutralized"

[[ "$(db_value "select count(*) from pg_trigger where tgname in ('v3_s3_validate_internal_entry_pointer','v3_s3_validate_nf_entry_pointer','v3_s3_validate_review_history_scope') and tgenabled <> 'D';")" == '3' ]] || fail "S3 constraint triggers are not all enabled"

log "System V3 S3 Entry invariant rehearsal passed"
