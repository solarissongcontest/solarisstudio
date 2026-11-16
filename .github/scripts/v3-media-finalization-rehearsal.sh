#!/usr/bin/env bash
set -euo pipefail
eval "$(supabase status -o env)"
case "${DB_URL:?missing local database}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*) ;; *) echo 'Refusing nonlocal Media test target';exit 1;; esac
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "${GITHUB_WORKSPACE:-.}/.github/tests/v3-media-finalization-authority.sql"
