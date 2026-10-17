#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-preference] %s\n' "$*"; }
fail() { printf '[v3-s5-preference] ERROR: %s\n' "$*" >&2; exit 1; }

API_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_URL must be loopback" ;;
esac
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

if [[ -z "$ANON_KEY" || -z "$SERVICE_KEY" ]]; then
  if command -v supabase >/dev/null 2>&1; then
    STATUS_ENV="$(supabase status -o env 2>/dev/null || true)"
    [[ -n "$ANON_KEY" ]] || ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p' | head -n1)"
    [[ -n "$SERVICE_KEY" ]] || SERVICE_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p' | head -n1)"
  fi
fi
[[ -n "$ANON_KEY" ]] || fail "SUPABASE_ANON_KEY is required"
[[ -n "$SERVICE_KEY" ]] || fail "SUPABASE_SERVICE_ROLE_KEY is required"

REQUEST_BODY=""
REQUEST_CODE=""
request() {
  local method="$1" url="$2" bearer="$3" apikey="$4" data="${5:-}"
  local tmp
  tmp="$(mktemp)"
  if [[ -n "$data" ]]; then
    REQUEST_CODE="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $apikey" -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json' --data "$data")"
  else
    REQUEST_CODE="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $apikey" -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json')"
  fi
  REQUEST_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1" | head -n1 | tr -d '\r'; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

USER_ID="81000000-0000-4000-8000-000000000501"
EDITION_ID="81000000-0000-4000-8000-000000000502"
PASSWORD='Solaris-S5-Preference!2026'
EMAIL='s5-preference-user@example.test'

log "Creating isolated local user and followable edition"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_KEY" "$SERVICE_KEY" \
  "{\"id\":\"$USER_ID\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
[[ "$REQUEST_CODE" == "200" || "$REQUEST_CODE" == "201" ]] || fail "Could not create local user: HTTP $REQUEST_CODE $REQUEST_BODY"

db_exec "
insert into public.editions (id, name, slug, edition_number, status, published)
values ('$EDITION_ID'::uuid, 'S5 Preference Rehearsal', 's5-preference-rehearsal', 99502, 'completed', true)
on conflict (id) do update set published = true;
"

request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
[[ "$REQUEST_CODE" == "200" ]] || fail "Could not sign in local preference user: HTTP $REQUEST_CODE $REQUEST_BODY"
TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$REQUEST_BODY")"
[[ -n "$TOKEN" ]] || fail "Local preference access token missing"

rpc_follow() {
  local following="$1" level="$2"
  request POST "$API_URL/rest/v1/rpc/set_fan_follow" "$TOKEN" "$ANON_KEY" \
    "{\"_entity_type\":\"edition\",\"_entity_id\":\"$EDITION_ID\",\"_following\":$following,\"_notification_level\":\"$level\"}"
  [[ "$REQUEST_CODE" == "200" ]] || fail "set_fan_follow failed: HTTP $REQUEST_CODE $REQUEST_BODY"
}

log "Saving the follow preference"
rpc_follow true important
FOLLOW_ID="$(db_value "select id::text from public.fan_follows where profile_id='$USER_ID'::uuid and entity_type='edition' and entity_id='$EDITION_ID'::uuid;")"
[[ -n "$FOLLOW_ID" ]] || fail "follow row was not created"
[[ "$(db_value "select revision::text from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "1" ]] || fail "follow insert did not start at revision 1"
[[ "$(db_value "select count(*)::text from private.v3_domain_events where event_type='preference.changed' and aggregate_id='$FOLLOW_ID' and aggregate_version=1;")" == "1" ]] || fail "follow insert did not emit preference.changed"
[[ "$(db_value "select count(*)::text from private.v3_domain_events where aggregate_id='$FOLLOW_ID' and payload ? 'profileId';")" == "0" ]] || fail "preference event leaked profile identity into payload"

log "Ownerless direct maintenance writes fail closed rather than creating ownerless receipts"
db_expect_failure "ownerless direct follow update" "update public.fan_follows set notification_level='all' where id='$FOLLOW_ID'::uuid;"
[[ "$(db_value "select revision::text from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "1" ]] || fail "ownerless rejected update changed follow revision"
[[ "$(db_value "select notification_level from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "important" ]] || fail "ownerless rejected update changed canonical follow state"

log "Changing notification level advances the semantic revision"
rpc_follow true all
[[ "$(db_value "select revision::text from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "2" ]] || fail "semantic follow update did not advance revision"
[[ "$(db_value "select count(*)::text from private.v3_domain_events where event_type='preference.changed' and aggregate_id='$FOLLOW_ID';")" == "2" ]] || fail "semantic follow update did not emit preference.changed"
[[ "$(db_value "select count(*)::text from public.studio2_operation_receipts where command='preference.save' and actor_id='$USER_ID'::uuid;")" == "2" ]] || fail "preference.save operation receipts are incomplete"

log "Repeating identical state is a semantic no-op"
rpc_follow true all
[[ "$(db_value "select revision::text from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "2" ]] || fail "semantic no-op advanced follow revision"
[[ "$(db_value "select count(*)::text from private.v3_domain_events where event_type='preference.changed' and aggregate_id='$FOLLOW_ID';")" == "2" ]] || fail "semantic no-op emitted a duplicate preference.changed"

log "Removing the preference emits the terminal revision"
rpc_follow false all
[[ "$(db_value "select count(*)::text from public.fan_follows where id='$FOLLOW_ID'::uuid;")" == "0" ]] || fail "unfollow did not remove canonical state"
[[ "$(db_value "select count(*)::text from private.v3_domain_events where event_type='preference.changed' and aggregate_id='$FOLLOW_ID' and aggregate_version=3 and payload->>'following'='false';")" == "1" ]] || fail "unfollow did not emit preference.changed"
[[ "$(db_value "select count(*)::text from public.studio2_operation_receipts where command='preference.remove' and actor_id='$USER_ID'::uuid;")" == "1" ]] || fail "preference.remove operation receipt missing"
[[ "$(db_value "select count(*)::text from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.aggregate_id='$FOLLOW_ID';")" == "0" ]] || fail "private preference event fabricated a background consumer"

log "Repeating removal is also a no-op"
rpc_follow false all
[[ "$(db_value "select count(*)::text from private.v3_domain_events where event_type='preference.changed' and aggregate_id='$FOLLOW_ID';")" == "3" ]] || fail "repeat unfollow emitted a duplicate preference.changed"

log "S5 personal preference consequence rehearsal passed"
