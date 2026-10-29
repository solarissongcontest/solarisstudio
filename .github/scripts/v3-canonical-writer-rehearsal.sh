#!/usr/bin/env bash
set -euo pipefail
# Transactional canonical-authority proofs; no reset, repair or hosted fallback.
eval "$(supabase status -o env)"
case "${API_URL:-}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Refusing non-local writer rehearsal' >&2; exit 1;; esac
case "${DB_URL:-}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local writer database' >&2; exit 1;; esac
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-lineup-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-status-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-delete-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-metadata-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-create-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-source-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-combined-calculation-authority.sql
(
  parity_sql="$(mktemp)"
  trap 'rm -f "$parity_sql"' EXIT
  bun --env-file=/dev/null run scripts/check-v3-combined-calculation-parity.ts --out="$parity_sql"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$parity_sql"
)
bash .github/scripts/v3-combined-calculation-concurrency.sh
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-round-conversion-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-edition-visual-command.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-edition-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-media-finalization-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-canonical-truncate-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-intake-delegation.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-evidence-write-boundary.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-register-evidence-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-core-actor-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-appeal-recovery.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-appeal-outcome-authority.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-appeal-writer-boundary.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-publication-writer-cutover.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-confirmation-final-review-guard.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-jury-writer-cutover.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-edition-runtime-writer-cutover.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-confirmation-entry-writer-cutover.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-integrity-case-relation-authority.sql
bash .github/scripts/v3-account-session-authority-rehearsal.sh
