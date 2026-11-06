#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
eval "$(supabase status -o env)"
case "${DB_URL:?}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local Edition authority rehearsal' >&2; exit 1;; esac
for pg_override in ${!PG@}; do unset "$pg_override"; done
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$root/.github/tests/v3-edition-creation-authority.sql"
