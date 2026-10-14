#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '[v3-entry-restore-provenance] FAIL: %s\n' "$*" >&2
  printf '::error::%s\n' "$*"
  exit 1
}

# This assertion intentionally consumes the disposable rows created by the
# hostile V3 Confirmation rehearsal. It must never be pointed at hosted data.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

SUBMISSION_ID='00000000-0000-4000-8000-00000000f521'
RESTORED_FROM='00000000-0000-4000-8000-00000000f539'

scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

restore_count="$(scalar "select count(*) from private.v3_entry_versions where submission_id='$SUBMISSION_ID'::uuid and source='organizer_restore' and restored_from_submission_version_id='$RESTORED_FROM'::uuid;")"
[[ "$restore_count" =~ ^[0-9]+$ ]] || fail "restore provenance count was not numeric"
(( restore_count >= 2 )) || fail "historical restores did not append provenance-bound Entry versions"

nf_restore_count="$(scalar "select count(*) from private.v3_entry_versions where submission_id='$SUBMISSION_ID'::uuid and target_type='national_final' and source='organizer_restore' and restored_from_submission_version_id='$RESTORED_FROM'::uuid;")"
[[ "$nf_restore_count" =~ ^[0-9]+$ ]] || fail "National Final restore provenance count was not numeric"
(( nf_restore_count >= 2 )) || fail "repeated same-content restore reused or lost immutable provenance"

invalid_count="$(scalar "select count(*) from private.v3_entry_versions where (source='organizer_restore') is distinct from (restored_from_submission_version_id is not null);")"
[[ "$invalid_count" == "0" ]] || fail "Entry version source/provenance invariant was violated"

# The hostile rehearsal deletes the canonical response at the end. Provenance
# must remain useful evidence even after the public submission/version rows have
# cascaded away, which is why the private ledger deliberately stores the UUID
# without a destructive foreign key.
submission_exists="$(scalar "select exists(select 1 from public.submissions where id='$SUBMISSION_ID'::uuid);")"
[[ "$submission_exists" == "f" ]] || fail "expected hostile rehearsal to delete its disposable canonical response"
(( restore_count >= 2 )) || fail "restore provenance did not survive canonical response deletion"

printf '[v3-entry-restore-provenance] PASS: %s provenance-bound immutable versions retained\n' "$restore_count"
