#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-public-ux-diagnostics] %s\n' "$*"; }
fail() { printf '\n[v3-public-ux-diagnostics] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

ADMIN_ID='00000000-0000-4000-8000-00000000d701'
USER_ID='00000000-0000-4000-8000-00000000d702'

log "Reset isolated telemetry fixture and seed Organizer read authority"
db_exec "delete from public.public_ux_events;"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
  ('$ADMIN_ID','authenticated','authenticated','ux-diagnostics-admin@local.invalid',now(),now()),
  ('$USER_ID','authenticated','authenticated','ux-diagnostics-user@local.invalid',now(),now())
on conflict (id) do nothing;
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ADMIN_ID'::uuid,'rollout.manage',null)
on conflict do nothing;
"

log "Seed privacy-safe anonymous diagnostic events through the public role"
db_exec "set role anon;
insert into public.public_ux_events(session_id,event_name,pathname,target,metadata) values
  ('search-session-a','search_submitted','/search',null,'{\"query_length\":5,\"result_count\":0}'::jsonb),
  ('search-session-a','search_submitted','/search',null,'{\"query_length\":8,\"result_count\":3}'::jsonb),
  ('search-session-b','search_submitted','/search',null,'{\"query_length\":4,\"result_count\":2}'::jsonb),
  ('explore-session-a','public_nav_clicked','/explore','/explore/countries','{}'::jsonb),
  ('explore-session-b','explore_dead_end','/explore',null,'{\"diagnostic_reason\":\"empty_collection\"}'::jsonb),
  ('attention-session-a','attention_presented','/','/participate','{\"attention_kind\":\"jury\"}'::jsonb),
  ('attention-session-a','feature_hunt_detected','/search','/jury-voting','{\"attention_kind\":\"jury\",\"hunt_source\":\"search\"}'::jsonb),
  ('attention-session-b','attention_presented','/','/participate','{\"attention_kind\":\"entry\"}'::jsonb);
reset role;"

log "Reject free-form or semantically misplaced diagnostic metadata"
expect_failure "Explore dead-end without bounded reason" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-explore-01','explore_dead_end','/explore','{}');"
expect_failure "free-form Explore reason" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-explore-02','explore_dead_end','/explore','{\"diagnostic_reason\":\"the user typed a private explanation\"}');"
expect_failure "feature hunt without hunt source" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-hunt-001','feature_hunt_detected','/search','{\"attention_kind\":\"jury\"}');"
expect_failure "free-form attention kind" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-hunt-002','attention_presented','/','{\"attention_kind\":\"my-secret-task-id\"}');"
expect_failure "diagnostic metadata on unrelated event" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-nav-0001','public_nav_clicked','/','{\"attention_kind\":\"jury\"}');"
expect_failure "raw query route identity" "set role anon; insert into public.public_ux_events(session_id,event_name,pathname,metadata) values ('bad-path-001','public_nav_clicked','/explore?token=secret','{}');"

log "Organizer-only aggregate authorization"
expect_failure "ordinary user aggregate read" "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; select public.admin_public_ux_metrics(now()-interval '5 minutes');"

METRICS="$(db_scalar "set role authenticated; set request.jwt.claim.sub='$ADMIN_ID'; set request.jwt.claim.role='authenticated'; select public.admin_public_ux_metrics(now()-interval '5 minutes')::text;")"
python3 - "$METRICS" <<'PY'
import json, sys
m = json.loads(sys.argv[1])

d = m['diagnostics']
search = d['searchReformulation']
assert search['method'] == 'privacy_safe_sequence_proxy'
assert search['searchSessions'] == 2
assert search['reformulationSessions'] == 1
assert search['reformulationTransitions'] == 1
assert float(search['ratePct']) == 50.0

explore = d['exploreDeadEnds']
assert explore['exploreSessions'] == 2
assert explore['deadEndSessions'] == 1
assert explore['deadEndEvents'] == 1
assert float(explore['ratePct']) == 50.0
assert explore['reasons'] == [{'reason': 'empty_collection', 'sessions': 1, 'events': 1}]

hunt = d['featureHunt']
assert hunt['attentionSessions'] == 2
assert hunt['featureHuntSessions'] == 1
assert hunt['featureHuntEvents'] == 1
assert float(hunt['ratePct']) == 50.0
assert hunt['byAttentionKind'] == [{'attention_kind': 'jury', 'sessions': 1, 'events': 1}]
assert hunt['bySource'] == [{'hunt_source': 'search', 'sessions': 1, 'events': 1}]

# Existing aggregate contract remains present rather than being replaced by a
# diagnostics-only payload.
assert 'totals' in m and 'navigation' in m and 'search' in m
assert 'friction' in m and 'tasks' in m and 'devices' in m
PY

log "PASS: bounded server aggregates report reformulation, Explore dead ends and feature hunts"
log "System V3 Public UX diagnostics rehearsal passed"
