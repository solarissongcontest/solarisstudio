#!/usr/bin/env bash
set -euo pipefail
# Transactional canonical-authority proofs; no reset, repair or hosted fallback.
eval "$(supabase status -o env)"
case "${API_URL:-}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Refusing non-local writer rehearsal' >&2; exit 1;; esac
case "${DB_URL:-}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local writer database' >&2; exit 1;; esac
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-edition-visual-command.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-edition-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-media-finalization-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-canonical-truncate-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-intake-delegation.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-evidence-write-boundary.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-appeal-recovery.sql
bash .github/scripts/v3-account-session-authority-rehearsal.sh
