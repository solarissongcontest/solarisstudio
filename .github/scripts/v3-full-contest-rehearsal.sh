#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-full-contest] %s\n' "$*"; }
fail() { printf '\n[v3-s14-full-contest] FAIL: %s\n' "$*" >&2; exit 1; }

# S14 is destructive by design, therefore it is permanently local-only.
# Never add a hosted fallback. A broken local stack must fail the rehearsal.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing S14 against non-local API_URL=$API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "refusing S14 against non-local DB_URL" ;;
esac

export SUPABASE_URL="$API_URL"
export E2E_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL"
export VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL"
export SUPABASE_PROJECT_ID=local
export SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local
export E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local
export VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local
export V3_SEED_TARGET=local
export V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1
export V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

HEAD_SHA="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
CANDIDATE_SHA="${V3_CANDIDATE_SHA:-}"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || fail "V3_CANDIDATE_SHA must be an exact 40-character commit SHA"
CANDIDATE_SHA="$(printf '%s' "$CANDIDATE_SHA" | tr '[:upper:]' '[:lower:]')"
[[ "$CANDIDATE_SHA" == "$HEAD_SHA" ]] || fail "candidate SHA $CANDIDATE_SHA does not match checked-out HEAD $HEAD_SHA"

for attempt in {1..20}; do
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c 'select 1' 2>/dev/null | grep -qx '1'; then
    DB_READY=1
    break
  fi
  sleep 1
done
[[ "${DB_READY:-0}" == "1" ]] || fail "local database did not become ready"

EDITION_ID='14000000-0000-4000-8000-000000000001'
SEMI_ONE_ID='14000000-0000-4000-8000-000000000011'
SEMI_TWO_ID='14000000-0000-4000-8000-000000000012'
FINAL_ID='14000000-0000-4000-8000-000000000013'
CONFIRMATION_ROUND_ID='14000000-0000-4000-8000-000000000021'
LATE_ROUND_ID='14000000-0000-4000-8000-000000000022'
TV_EDITION_ID='14000000-0000-4000-8000-000000000031'
TV_ROUND_ID='14000000-0000-4000-8000-000000000032'
RULEBOOK_ID='14000000-0000-4000-8000-000000000041'
STORYLINE_ID='14000000-0000-4000-8000-000000000051'
PASSWORD='S14-Local-Contest-Only-Aa9!'

HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value = value[int(key)] if isinstance(value, list) else value[key]
print("" if value is None else value)
' "$path"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

create_user() {
  local email="$1" display_name="$2" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True,"user_metadata":{"display_name":sys.argv[3]}}))' "$email" "$PASSWORD" "$display_name")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  if (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
    LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  else
    LAST_USER_ID="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -v email="$email" -c "select id from auth.users where lower(email)=lower(:'email') limit 1;")"
    [[ -n "$LAST_USER_ID" ]] || fail "could not create or recover local user $email (HTTP $HTTP_STATUS)"
  fi
  [[ -n "$LAST_USER_ID" ]] || fail "local auth user $email has no id"
}

country_uuid_sql="('14000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid"
participant_uuid_sql="('14000000-0000-4001-8000-' || lpad(i::text, 12, '0'))::uuid"

log "Stage 1/10: setup one deterministic bounded contest"
# Keep one canonical edition and exactly 66 deterministic delegation countries.
db_exec "
insert into public.countries (id, name, short_code, region)
select
  $country_uuid_sql,
  'S14 Delegation ' || lpad(i::text, 2, '0'),
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14'
from generate_series(1, 66) i
on conflict (id) do update set
  name = excluded.name,
  short_code = excluded.short_code,
  region = excluded.region;

insert into public.editions (id, name, slug, edition_number, year, status, published)
values ('$EDITION_ID', 'S14 Full Contest Rehearsal', 's14-full-contest', 1400, 2026, 'active', false)
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, edition_number=excluded.edition_number,
  year=excluded.year, status=excluded.status, published=false;

insert into public.shows (id, edition_id, name, kind, sort_order, published, voting_config, publication_config)
values
  ('$SEMI_ONE_ID', '$EDITION_ID', 'S14 Semi-final 1', 'semi-final', 1, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":false}'::jsonb),
  ('$SEMI_TWO_ID', '$EDITION_ID', 'S14 Semi-final 2', 'semi-final', 2, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":false}'::jsonb),
  ('$FINAL_ID', '$EDITION_ID', 'S14 Grand Final', 'grand-final', 3, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":true,\"jury_results\":true,\"televote_results\":true}'::jsonb)
on conflict (id) do update set voting_config=excluded.voting_config, publication_config=excluded.publication_config, published=false;

insert into public.participants (id, edition_id, show_id, country_id, artist, song, running_order, participation_status)
select
  $participant_uuid_sql,
  '$EDITION_ID'::uuid,
  case when i <= 33 then '$SEMI_ONE_ID'::uuid else '$SEMI_TWO_ID'::uuid end,
  $country_uuid_sql,
  'S14 Artist ' || lpad(i::text, 2, '0'),
  'S14 Song ' || lpad(i::text, 2, '0'),
  case when i <= 33 then i else i - 33 end,
  'confirmed'
from generate_series(1, 66) i
on conflict (id) do update set artist=excluded.artist, song=excluded.song, running_order=excluded.running_order, participation_status='confirmed';

insert into public.submission_rounds (id, edition_id, name, status, opens_at, closes_at, editing_enabled)
values
  ('$CONFIRMATION_ROUND_ID', '$EDITION_ID', 'S14 Confirmation', 'open', now()-interval '15 minutes', now()+interval '6 hours', true),
  ('$LATE_ROUND_ID', '$EDITION_ID', 'S14 Late Confirmation', 'closed', now()-interval '2 days', now()-interval '1 day', false)
on conflict (id) do update set status=excluded.status, opens_at=excluded.opens_at, closes_at=excluded.closes_at, editing_enabled=excluded.editing_enabled;

insert into public.jury_voting_windows (show_id, edition_id, status)
values ('$FINAL_ID', '$EDITION_ID', 'closed')
on conflict (show_id) do update set edition_id=excluded.edition_id, status='closed', opened_at=null, closed_at=null;

insert into televoting.editions (id, name, is_active, is_archived)
values ('$TV_EDITION_ID', 'S14 Full Contest Rehearsal', true, false)
on conflict (id) do update set name=excluded.name, is_active=true, is_archived=false;

insert into televoting.countries(code, name, flag)
select
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14 Delegation ' || lpad(i::text, 2, '0'),
  '✦'
from generate_series(1,66) i
on conflict (code) do update set name=excluded.name;

insert into televoting.rounds(id, edition_id, name, status, total_points_to_distribute, participant_mode, self_voting_mode)
values ('$TV_ROUND_ID', '$TV_EDITION_ID', 'S14 Grand Final Televote', 'draft', 58, 'countries', 'country_match')
on conflict (id) do update set name=excluded.name, status='draft', total_points_to_distribute=58, participant_mode='countries', self_voting_mode='country_match';

delete from televoting.round_countries where round_id='$TV_ROUND_ID'::uuid;
insert into televoting.round_countries(round_id, country_code, display_order)
select '$TV_ROUND_ID'::uuid,
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X', i
from generate_series(1,66) i;

delete from televoting.round_entries where round_id='$TV_ROUND_ID'::uuid;
insert into televoting.round_entries(round_id, entry_type, entry_key, country_code, short_name, entry_code, display_order)
select '$TV_ROUND_ID'::uuid, 'country',
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14 ' || lpad(i::text,2,'0'),
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X', i
from generate_series(1,66) i;

insert into public.ssc_rulebook_releases(id, version, status, is_current, title, summary, base_version, effective_from, published_at)
values ('$RULEBOOK_ID', '14.0', 'published', false, 'S14 rehearsal rules', 'Deterministic local-only rules fixture for the full-contest rehearsal.', '4.0', now(), now())
on conflict (id) do update set title=excluded.title, summary=excluded.summary, status='published', is_current=false;

insert into public.studio2_storylines(id, edition_id, title, subtitle, introduction, status, revision, source_event_count)
values ('$STORYLINE_ID', '$EDITION_ID', 'S14 contest story', 'Full lifecycle rehearsal', 'Local-only deterministic storyline.', 'draft', 1, 0)
on conflict (edition_id) do update set title=excluded.title, subtitle=excluded.subtitle, introduction=excluded.introduction, status='draft', published_at=null;
"

[[ "$(db_scalar "select count(*) from public.countries where region='S14';")" == "66" ]] || fail "S14 seed does not contain exactly 66 delegations"
[[ "$(db_scalar "select count(*) from public.shows where edition_id='$EDITION_ID'::uuid;")" == "3" ]] || fail "S14 seed does not contain three shows"
[[ "$(db_scalar "select count(*) from public.participants where edition_id='$EDITION_ID'::uuid;")" == "66" ]] || fail "S14 seed does not contain 66 canonical participant rows"
[[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$TV_ROUND_ID'::uuid;")" == "66" ]] || fail "S14 televote configuration does not contain 66 entries"
[[ "$(db_scalar "select count(*) from public.ssc_rulebook_releases where id='$RULEBOOK_ID'::uuid and status='published';")" == "1" ]] || fail "S14 rule configuration missing"
[[ "$(db_scalar "select count(*) from public.studio2_storylines where edition_id='$EDITION_ID'::uuid;")" == "1" ]] || fail "S14 storyline seed missing"
log "S14_STAGE_1_SETUP_COMPLETE"

log "Stage 2/10: delegation onboarding, HOD access, requirements and notifications"
create_user 's14-organizer-a@solaris.invalid' 'S14 Organizer A'; ORGANIZER_A_ID="$LAST_USER_ID"
create_user 's14-organizer-b@solaris.invalid' 'S14 Organizer B'; ORGANIZER_B_ID="$LAST_USER_ID"

# Two real local Organizer identities are sufficient for the later controlled
# concurrency failure injection. All 66 delegations receive their own HOD user.
db_exec "
insert into public.studio2_role_assignments(user_id, role_key, edition_id, expires_at, assigned_by)
values
  ('$ORGANIZER_A_ID'::uuid, 'organizer', null, null, null),
  ('$ORGANIZER_B_ID'::uuid, 'organizer', null, null, null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;
"

for i in $(seq 1 66); do
  email="s14-hod-$(printf '%02d' "$i")@solaris.invalid"
  create_user "$email" "S14 HOD $(printf '%02d' "$i")"
  hod_id="$LAST_USER_ID"
  country_id="14000000-0000-4000-8000-$(printf '%012d' "$i")"
  db_exec "
    insert into public.fan_profiles(id) values ('$hod_id'::uuid) on conflict (id) do nothing;
    insert into public.country_accounts(user_id, country_id, status, instagram_username, display_name)
    values ('$hod_id'::uuid, '$country_id'::uuid, 'active', 's14_hod_$(printf '%02d' "$i")', 'S14 HOD $(printf '%02d' "$i")')
    on conflict (user_id) do update set country_id=excluded.country_id, status='active', display_name=excluded.display_name, updated_at=now();
    insert into public.notification_preferences(profile_id, in_app_enabled, categories, external_enabled)
    values ('$hod_id'::uuid, true, array['confirmations','deadlines','jury','televote','results']::text[], true)
    on conflict (profile_id) do update set in_app_enabled=true, categories=excluded.categories, external_enabled=true, updated_at=now();
  "
done

for i in $(seq 1 4); do
  email="s14-fan-$(printf '%02d' "$i")@solaris.invalid"
  create_user "$email" "S14 Fan $(printf '%02d' "$i")"
  fan_id="$LAST_USER_ID"
  db_exec "insert into public.fan_profiles(id) values ('$fan_id'::uuid) on conflict (id) do nothing;"
done

db_exec "
insert into public.studio2_confirmation_requirements(edition_id,country_id,generation,status,reason,valid_from,created_by)
select '$EDITION_ID'::uuid, $country_uuid_sql, 1, 'required', 'S14 canonical edition onboarding requirement', now(), '$ORGANIZER_A_ID'::uuid
from generate_series(1,66) i
on conflict (edition_id,country_id,generation) do update set
  status='required', reason=excluded.reason, resolved_by_submission_id=null, resolved_at=null,
  invalidated_at=null, invalidated_by=null, invalidated_reason=null, superseded_at=null, updated_at=now();

select public.solaris_enqueue_app_notifications(now());
"

[[ "$(db_scalar "select count(*) from public.country_accounts ca join public.countries c on c.id=ca.country_id where c.region='S14' and ca.status='active';")" == "66" ]] || fail "not all 66 delegations received active HOD access"
[[ "$(db_scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID'::uuid and superseded_at is null;")" == "66" ]] || fail "not all 66 delegations received a current confirmation requirement"
[[ "$(db_scalar "select count(*) from public.notification_deliveries d join public.country_accounts ca on ca.user_id=d.user_id join public.countries c on c.id=ca.country_id where c.region='S14' and d.event_type like 'confirmation.%';")" -gt 0 ]] || fail "onboarding did not produce confirmation notification candidates"
[[ "$(db_scalar "select count(*) from public.studio2_role_assignments where user_id in ('$ORGANIZER_A_ID'::uuid,'$ORGANIZER_B_ID'::uuid) and role_key='organizer';")" == "2" ]] || fail "S14 organizer access seed incomplete"
log "S14_STAGE_2_DELEGATION_ONBOARDING_COMPLETE"

# The remaining stages are intentionally fail-closed until they are implemented
# in this same persistent contest state. Do not replace this with calls to the
# focused rehearsal scripts: most of those create their own isolated fixtures.
PENDING_STAGES=(
  stage-3-confirmations
  stage-4-entries
  stage-5-running-orders
  stage-6-jury
  stage-7-public-voting
  stage-8-results
  stage-9-publication
  stage-10-archive
)

OUTPUT_DIR="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
mkdir -p "$OUTPUT_DIR"
PARTIAL_PATH="$OUTPUT_DIR/s14-full-contest.partial.json"
python3 - "$PARTIAL_PATH" "$CANDIDATE_SHA" "${PENDING_STAGES[@]}" <<'PY'
import json, sys
path, sha, *pending = sys.argv[1:]
payload = {
    "schemaVersion": 1,
    "candidateSha": sha,
    "passed": False,
    "partial": True,
    "completedStages": ["stage-1-setup", "stage-2-delegation-onboarding"],
    "pendingStages": pending,
    "seed": {"editionCount": 1, "delegationCount": 66, "showCount": 3},
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY

if [[ "${V3_S14_ALLOW_PARTIAL:-0}" == "1" ]]; then
  log "Partial S14 foundation passed; release-grade S14 remains blocked by ${#PENDING_STAGES[@]} stages."
  exit 0
fi

fail "S14 is intentionally incomplete: ${PENDING_STAGES[*]}. No release-grade s14-full-contest.json was written."
