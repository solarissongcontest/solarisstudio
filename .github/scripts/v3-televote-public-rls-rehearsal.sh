#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
eval "$(supabase status -o env)"
: "${DB_URL:?missing isolated Supabase DB_URL}"
local_db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
if [[ ! "$DB_URL" =~ $local_db_pattern ]]; then
  echo 'Refusing non-local Televote RLS rehearsal' >&2
  exit 1
fi
# Reapply the exact migration to prove deterministic registration + policy replay.
# These commands never discover or accept a hosted database URL.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/../../supabase/migrations/20261024153000_v3_televote_public_rls_boundary.sql"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/v3-televote-public-rls-rehearsal.sql"
