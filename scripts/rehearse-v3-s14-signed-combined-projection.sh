#!/usr/bin/env bash
set -euo pipefail

# Local/disposable Supabase ONLY. Reuse the existing S14 published-round and
# Combined truth fixtures before checking signed, corrected publication.
bash .github/scripts/v3-s14-televote-result-truth-rehearsal.sh

eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) echo "Refusing non-local database rehearsal" >&2; exit 1 ;;
esac
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
SHOW_ID='00000000-0000-4000-8000-00000000b102'
EDITION_ID='00000000-0000-4000-8000-00000000b101'
AGGREGATION_ID='00000000-0000-4000-8000-00000000b132'
COUNTRY_A='00000000-0000-4000-8000-00000000b111'
COUNTRY_B='00000000-0000-4000-8000-00000000b112'
COUNTRY_C='00000000-0000-4000-8000-00000000b113'

# Keep all three identities. 35 - 50 = -15 for one country.
db_exec "select private.v3_apply_published_televote_projection(
  '$EDITION_ID'::uuid,'$SHOW_ID'::uuid,'combined','$AGGREGATION_ID',2,
  '2026-10-16T20:00:00Z'::timestamptz,
  '[{\"country_id\":\"$COUNTRY_A\",\"points\":-15},{\"country_id\":\"$COUNTRY_B\",\"points\":65},{\"country_id\":\"$COUNTRY_C\",\"points\":0}]'::jsonb
);"
[[ "$(db_scalar "select points from public.televote_votes where show_id='$SHOW_ID'::uuid and country_id='$COUNTRY_A'::uuid;")" == "-15" ]] || {
  echo "Negative country score was not stored" >&2; exit 1;
}
[[ "$(db_scalar "select televote_points from public.results where show_id='$SHOW_ID'::uuid and country_id='$COUNTRY_A'::uuid;")" == "-15" ]] || {
  echo "Official Results dropped the negative correction" >&2; exit 1;
}
# Same exact payload/version must replay idempotently without another revision.
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "4" ]] || exit 1
db_exec "select private.v3_apply_published_televote_projection(
  '$EDITION_ID'::uuid,'$SHOW_ID'::uuid,'combined','$AGGREGATION_ID',2,
  '2026-10-16T20:00:00Z'::timestamptz,
  '[{\"country_id\":\"$COUNTRY_A\",\"points\":-15},{\"country_id\":\"$COUNTRY_B\",\"points\":65},{\"country_id\":\"$COUNTRY_C\",\"points\":0}]'::jsonb
);"
[[ "$(db_scalar "select projection_revision from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "4" ]] || {
  echo "Signed replay changed revision" >&2; exit 1;
}

# A valid fixed-deduction scenario can make even the aggregate negative.
db_exec "select private.v3_apply_published_televote_projection(
  '$EDITION_ID'::uuid,'$SHOW_ID'::uuid,'combined','$AGGREGATION_ID',3,
  '2026-10-16T20:10:00Z'::timestamptz,
  '[{\"country_id\":\"$COUNTRY_A\",\"points\":-15},{\"country_id\":\"$COUNTRY_B\",\"points\":-20},{\"country_id\":\"$COUNTRY_C\",\"points\":-25}]'::jsonb
);"
[[ "$(db_scalar "select points_total from private.v3_televote_result_projection_sources where show_id='$SHOW_ID'::uuid;")" == "-60" ]] || {
  echo "Signed total was rejected or truncated" >&2; exit 1;
}
[[ "$(db_scalar "select sum(televote_points) from public.results where show_id='$SHOW_ID'::uuid;")" == "-60" ]] || {
  echo "Published Results did not retain all-negative scores" >&2; exit 1;
}
echo "S14 signed Combined publication rehearsal passed on isolated local Supabase."
