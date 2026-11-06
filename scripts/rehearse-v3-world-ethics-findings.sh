#!/usr/bin/env bash
set -euo pipefail

# LOCAL-ONLY: never use DATABASE_URL, Supabase project secrets or hosted fallback.
fail(){ printf '[tg13-ethics] FAIL CLOSED: %s\n' "$*" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI is not installed'
command -v psql >/dev/null 2>&1 || fail 'psql is not installed'
command -v node >/dev/null 2>&1 || fail 'Node is not installed'

status_json="$(supabase status -o json)" || fail 'Disposable Supabase CLI service is not running'
validated_db="$(node - "$status_json" <<'NODE'
const status = JSON.parse(process.argv[2]);
const api = status.API_URL ?? status.api_url;
const db = status.DB_URL ?? status.db_url;
if (typeof api !== 'string' || typeof db !== 'string') process.exit(3);
const a = new URL(api);
const d = new URL(db);
const loopback = u => u.hostname === '127.0.0.1' || u.hostname === 'localhost';
if (!loopback(a) || a.protocol !== 'http:' || !a.port || a.username || a.password ||
    a.search || a.hash || a.pathname !== '/') process.exit(4);
if (!loopback(d) || !['postgres:', 'postgresql:'].includes(d.protocol) ||
    !d.port || d.pathname !== '/postgres' || d.search || d.hash ||
    d.username !== 'postgres' || d.password !== 'postgres') process.exit(5);
process.stdout.write(db);
NODE
)" || fail 'Supabase status URL is not a literal disposable loopback database'

psql "$validated_db" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$ROOT/rehearse-v3-world-ethics-findings.sql"
