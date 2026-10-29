#!/usr/bin/env bash
set -euo pipefail
# No fixture SQL may execute until both local targets are verified.
eval "$(supabase status -o env)"
case "${API_URL:-}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Refusing non-local Supabase API' >&2; exit 1 ;; esac
case "${DB_URL:-}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local database' >&2; exit 1 ;; esac
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-s14-results-lineup.sql
