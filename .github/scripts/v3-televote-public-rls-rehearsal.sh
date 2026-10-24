#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
eval "$(supabase status -o env)"
: "${DB_URL:?missing isolated Supabase DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) echo 'Refusing non-local Televote RLS rehearsal' >&2; exit 1 ;;
esac
# Reapply the exact migration to prove deterministic registration + policy replay.
# These commands never discover or accept a hosted database URL.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/../../supabase/migrations/20261024153000_v3_televote_public_rls_boundary.sql"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/v3-televote-public-rls-rehearsal.sql"
