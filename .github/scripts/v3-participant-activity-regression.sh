#!/usr/bin/env bash
set -euo pipefail
# Reject inherited aliases before asking the CLI for its disposable stack.
python3 - <<'PY'
import os
from urllib.parse import urlparse
for key in ('VITE_SUPABASE_URL','SUPABASE_URL','E2E_SUPABASE_URL','VITE_CONFIRMATIONS_SUPABASE_URL','CONFIRMATIONS_SUPABASE_URL','API_URL','LOCAL_SUPABASE_URL','DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','DB_URL','LOCAL_DATABASE_URL'):
    value = os.environ.get(key)
    if not value:
        continue
    parsed = urlparse(value)
    schemes = ('postgres','postgresql') if key in ('DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','DB_URL','LOCAL_DATABASE_URL') else ('http',)
    if parsed.scheme not in schemes or parsed.hostname not in ('127.0.0.1','localhost','::1'):
        raise SystemExit('Refusing activity regression with non-local inherited target: '+key)
PY
eval "$(supabase status -o env)"
python3 - "${API_URL:-}" "${DB_URL:-}" <<'PY'
import sys
from urllib.parse import urlparse
for value, schemes in zip(sys.argv[1:], [('http',), ('postgres', 'postgresql')]):
    parsed = urlparse(value)
    if parsed.scheme not in schemes or parsed.hostname not in ('127.0.0.1','localhost','::1'):
        raise SystemExit('Refusing participant activity regression against a non-local target')
PY
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-participant-activity.sql

# Reuse the existing canonical Jury submit/replay authority instead of fabricating
# accepted ballots or patching their lifecycle state for this projection test.
source .github/scripts/v3-jury-security-rehearsal.sh
rpc_request "$USER_A_TOKEN" v3_my_participant_activity '{"p_before":null,"p_limit":50,"p_before_operation_id":null}'
expect_success "recipient Activity reads accepted canonical Jury operation"
expect_json "Activity Jury operation identity" items.0.id "$OPERATION_ID"
expect_json "Activity Jury receipt identity" items.0.receipt_id "$RECEIPT_ID"
expect_json "Activity historical Jury country" items.0.country_id "$COUNTRY_A"
expect_json "Activity Jury domain source" items.0.source_event_type jury.ballot_submitted
expect_json "Activity Jury kind" items.0.kind jury_participation
[[ "$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["items"]))')" == 1 ]] || fail 'Jury activity duplicated its shared receipt or admitted legacy unreceipted votes'
# This must be a required command: a missing tool or malformed JSON must fail,
# never become a false negative inside a shell `if` condition.
printf '%s' "$HTTP_BODY" | python3 .github/scripts/check-v3-activity-response.py
rpc_request "$USER_B_TOKEN" v3_my_participant_activity '{"p_before":null,"p_limit":50,"p_before_operation_id":null}'
expect_success "other participant reads only their own Activity"
[[ "$(printf '%s' "$HTTP_BODY" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["items"]))')" == 0 ]] || fail 'Other participant received foreign Jury activity or fabricated legacy history'
log 'PASS: Activity consumes actual canonical Jury submission once, preserves historical country and excludes foreign/legacy ballots'
