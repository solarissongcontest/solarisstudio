#!/usr/bin/env bash
# Rollback-only integration test for Terra Solaris TG3 institutional history.
# Intentionally supports ONLY the standard local Supabase Postgres port.
set -euo pipefail

if [[ "${V3_VERIFICATION_TARGET:-}" != "local" ]]; then
  echo "Refusing to rehearse TG3 history unless V3_VERIFICATION_TARGET=local" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for this local-only database rehearsal" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/scripts/rehearse-v3-world-office-history.sql"
if [[ ! -f "$SQL" ]]; then
  echo "Missing local TG3 history rehearsal SQL: $SQL" >&2
  exit 2
fi

# Never consume a production DB URL or a caller-controlled host: the dedicated
# port is the conventional Supabase CLI local Postgres listener.
PGHOST=127.0.0.1 \
PGPORT=54322 \
PGUSER=postgres \
PGDATABASE=postgres \
PGPASSWORD=postgres \
PGSSLMODE=disable \
psql -w -X -v ON_ERROR_STOP=1 -f "$SQL"

echo "PASS: TG3 office history isolated transaction rolled back"
