#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s6-jury-readiness] %s\n' "$*"; }
fail() { printf '\n[v3-s6-jury-readiness] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role service_role; $1"; }
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

COUNTRY_A='00000000-0000-4000-8000-00000000d611'
COUNTRY_B='00000000-0000-4000-8000-00000000d612'
COUNTRY_C='00000000-0000-4000-8000-00000000d613'
COUNTRY_D='00000000-0000-4000-8000-00000000d614'
EDITION_ID='00000000-0000-4000-8000-00000000e611'
SHOW_ID='00000000-0000-4000-8000-00000000a611'

log "Seeding one bounded canonical Jury show"
db_exec "insert into public.countries(id,name,short_code) values
  ('$COUNTRY_A','S6 Jury A','S6A'),
  ('$COUNTRY_B','S6 Jury B','S6B'),
  ('$COUNTRY_C','S6 Jury C','S6C'),
  ('$COUNTRY_D','S6 Jury D','S6D');"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published)
  values ('$EDITION_ID','S6 Jury Readiness',2026,'s6-jury-readiness',9611,'active',false);"
db_exec "insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
  values ('$SHOW_ID','$EDITION_ID','S6 Jury readiness final','final',1,false,
    jsonb_build_object('juryEnabled',true,'televoteEnabled',false,'juryPoints',jsonb_build_array(12,10)));"
db_exec "insert into public.participants(edition_id,show_id,country_id,artist,song,running_order) values
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_B','Artist B','Song B',1),
  ('$EDITION_ID','$SHOW_ID','$COUNTRY_C','Artist C','Song C',2);"
db_exec "insert into public.voters(edition_id,show_id,country_id,name,sort_order)
  values ('$EDITION_ID','$SHOW_ID','$COUNTRY_A','Jury A',1);"

log "Browser roles cannot invoke the S6 service boundary"
expect_db_failure "authenticated rebuild" "set role authenticated; select public.studio2_rebuild_jury_operational_projection('$SHOW_ID'::uuid,200,5000);"
expect_db_failure "authenticated verifier" "set role authenticated; select public.studio2_verify_jury_operational_projection('$SHOW_ID'::uuid,200,5000);"
expect_db_failure "authenticated lag metric" "set role authenticated; select public.studio2_measure_jury_operational_projection_lag('$SHOW_ID'::uuid,200,5000);"

log "Read-only recomputation exposes canonical not-ready Jury state"
REBUILT="$(service_value "select public.studio2_rebuild_jury_operational_projection('$SHOW_ID'::uuid,200,5000)::text;")"
python3 - "$REBUILT" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'recomputed'
assert value['reason'] == 'canonical_read_recompute'
assert value['expectedVoters'] == 1
assert value['projection']['juryVoterCount'] == 1
assert value['projection']['juryReady'] is False
assert value['projection']['juryIncompleteCount'] == 1
PY

VERIFIED="$(service_value "select public.studio2_verify_jury_operational_projection('$SHOW_ID'::uuid,200,5000)::text;")"
python3 - "$VERIFIED" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'consistent'
assert value['reason'] == 'verified'
assert value['issueCount'] == 0
assert value['expectedVoters'] == 1
assert value['projection']['juryReady'] is False
PY
log "PASS: independent verifier agrees with bounded canonical recomputation"

LAG="$(service_value "select public.studio2_measure_jury_operational_projection_lag('$SHOW_ID'::uuid,200,5000)::text;")"
python3 - "$LAG" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'measured'
assert value['reason'] == 'synchronous_read_through'
assert value['freshnessModel'] == 'synchronous_read_through'
assert value['lagSeconds'] == 0
assert value['verificationState'] == 'consistent'
PY
log "PASS: synchronous Jury projection reports zero storage lag only after verification"

log "A voter set above the requested diagnostic bound fails honestly"
db_exec "insert into public.voters(edition_id,show_id,country_id,name,sort_order)
  values ('$EDITION_ID','$SHOW_ID','$COUNTRY_D','Jury D',2);"
BOUNDED="$(service_value "select public.studio2_rebuild_jury_operational_projection('$SHOW_ID'::uuid,1,5000)::text;")"
python3 - "$BOUNDED" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'unknown'
assert value['reason'] == 'voter_bound_exceeded'
assert value['observedVotersAtLeast'] == 2
assert value['projection'] is None
PY
VERIFY_BOUNDED="$(service_value "select public.studio2_verify_jury_operational_projection('$SHOW_ID'::uuid,1,5000)::text;")"
python3 - "$VERIFY_BOUNDED" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'unknown'
assert value['reason'] == 'verification_voter_bound_exceeded'
assert value['observedVotersAtLeast'] == 2
assert value['issues'] == []
PY
LAG_BOUNDED="$(service_value "select public.studio2_measure_jury_operational_projection_lag('$SHOW_ID'::uuid,1,5000)::text;")"
python3 - "$LAG_BOUNDED" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
assert value['state'] == 'unknown'
assert value['reason'] == 'verification_bound_exceeded'
assert value['lagSeconds'] is None
assert value['verificationState'] == 'unknown'
PY
log "PASS: bounded-out verification cannot fabricate a Jury lag value"

log "System V3 S6 Jury readiness rehearsal passed"
