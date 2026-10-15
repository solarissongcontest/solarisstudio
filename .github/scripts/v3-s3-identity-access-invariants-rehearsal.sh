#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s3-identity-access] %s\n' "$*"; }
fail() { printf '\n[v3-s3-identity-access] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal mutates identity/access fixtures and must never touch hosted
# Solaris. Resolve every credential from the local Supabase CLI and fail closed.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
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

USER_EMAIL="s3-identity-access-${GITHUB_RUN_ID:-local}@solaris.invalid"
USER_PASSWORD="IdentityAccess-${GITHUB_RUN_ID:-local}-Aa9!"
USER_PAYLOAD="$(python3 -c '
import json, sys
print(json.dumps({
  "email": sys.argv[1],
  "password": sys.argv[2],
  "email_confirm": True,
  "user_metadata": {"display_name": "S3 Identity Access Fixture"},
}))
' "$USER_EMAIL" "$USER_PASSWORD")"

log "Creating one local auth subject"
HTTP_BODY="$(mktemp)"
HTTP_STATUS="$(curl -sS -o "$HTTP_BODY" -w '%{http_code}' \
  -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$USER_PAYLOAD")"
if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
  cat "$HTTP_BODY" >&2
  rm -f "$HTTP_BODY"
  fail "local auth subject creation failed with HTTP $HTTP_STATUS"
fi
USER_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' < "$HTTP_BODY")"
rm -f "$HTTP_BODY"
[[ -n "$USER_ID" ]] || fail "local auth subject id missing"

log "One canonical permission revision ledger exists"
[[ "$(db_value "select to_regclass('public.studio2_permission_state_versions') is null;")" == 't' ]] || fail "duplicate permission state ledger still exists"
[[ "$(db_value "select to_regclass('public.studio2_permission_subject_versions') is not null;")" == 't' ]] || fail "canonical permission subject ledger is missing"
[[ "$(db_value "select count(*) from pg_trigger where tgname in ('studio2_role_assignment_version_bump','studio2_capability_grant_version_bump') and not tgisinternal;")" == '0' ]] || fail "legacy duplicate revision triggers still exist"
[[ "$(db_value "select count(*) from pg_trigger where tgname in ('studio2_role_assignments_touch_subject_version','studio2_capability_grants_touch_subject_version') and not tgisinternal and tgenabled <> 'D';")" == '2' ]] || fail "canonical permission revision triggers are not both enabled"

log "Compatibility helper materializes the established zero revision"
[[ "$(db_value "select private.studio2_ensure_permission_version('$USER_ID'::uuid);")" == '0' ]] || fail "permission baseline was not zero"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '0' ]] || fail "canonical baseline row was not materialized"

log "Each authoritative access mutation advances exactly one canonical revision"
db_exec "insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by) values ('$USER_ID','organizer',null,null,null);"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '1' ]] || fail "role assignment did not advance revision exactly once"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id,expires_at,granted_by) values ('$USER_ID','permissions.manage',null,null,null);"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '2' ]] || fail "capability grant did not advance revision exactly once"

db_exec "update public.studio2_role_assignments set expires_at=now()+interval '1 day' where user_id='$USER_ID'::uuid and role_key='organizer' and edition_id is null;"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '3' ]] || fail "role update did not advance revision exactly once"

db_exec "delete from public.studio2_capability_grants where user_id='$USER_ID'::uuid and capability='permissions.manage' and edition_id is null;"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '4' ]] || fail "capability revocation did not advance revision exactly once"

log "Older private helper names are compatibility aliases for canonical state"
[[ "$(db_value "select private.studio2_lock_permission_version('$USER_ID'::uuid);")" == '4' ]] || fail "compatibility lock did not read canonical revision"
[[ "$(db_value "select private.studio2_bump_permission_version('$USER_ID'::uuid);")" == '5' ]] || fail "compatibility bump did not advance canonical revision"
[[ "$(db_value "select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid;")" == '5' ]] || fail "compatibility bump wrote a noncanonical revision"

log "Browser roles cannot bypass the governed permission command"
expect_db_failure "authenticated direct permission revision read" "set role authenticated; select version from public.studio2_permission_subject_versions where user_id='$USER_ID'::uuid; reset role;"
expect_db_failure "authenticated private permission helper call" "set role authenticated; select private.studio2_bump_permission_version('$USER_ID'::uuid); reset role;"

[[ "$(db_value "select has_table_privilege('authenticated','public.studio2_permission_subject_versions','SELECT');")" == 'f' ]] || fail "authenticated unexpectedly has direct permission-ledger SELECT"
[[ "$(db_value "select has_table_privilege('authenticated','public.studio2_permission_subject_versions','UPDATE');")" == 'f' ]] || fail "authenticated unexpectedly has direct permission-ledger UPDATE"

log "System V3 S3 Identity / Access invariant rehearsal passed"
