#!/usr/bin/env bash
set -euo pipefail

# TG19 catalog rehearsal is EXCLUSIVELY for local/disposable Supabase.
# This does not mutate schema/data; it does not certify application RLS semantics.
fail() { printf '[tg19-world-privileges] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable; refusing hosted fallback"
command -v psql >/dev/null 2>&1 || fail "psql unavailable; refusing hosted fallback"
command -v node >/dev/null 2>&1 || fail "Node unavailable for strict URL verification"

# Never trust URLs inherited from a production shell if local Supabase omits them.
unset API_URL DB_URL
status_env="$(supabase status -o env)" || fail "A local Supabase stack is not running"
eval "$status_env"
[[ -n "${API_URL:-}" && -n "${DB_URL:-}" ]] || fail "Local Supabase status did not return both API_URL and DB_URL"

node --input-type=module - "$API_URL" "$DB_URL" <<'NODE' || fail "Supabase API/database targets are not unambiguously loopback-only"
import { URL } from 'node:url';
const [apiRaw, dbRaw] = process.argv.slice(2);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
function verify(raw, allowedProtocols, label) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(label + ' is not a URL'); }
  if (!allowedProtocols.has(url.protocol)) throw new Error(label + ' uses unsupported protocol');
  if (!localHosts.has(url.hostname.toLowerCase()) || !url.port) {
    throw new Error(label + ' must use an explicit-port loopback host');
  }
  for (const [key] of url.searchParams) {
    if (['host', 'hostaddr', 'service', 'servicefile'].includes(key.toLowerCase())) {
      throw new Error(label + ' contains a libpq authority override');
    }
  }
  return url;
}
const api = verify(apiRaw, new Set(['http:']), 'API_URL');
if (api.username || api.password) throw new Error('API_URL cannot contain credentials');
verify(dbRaw, new Set(['postgres:', 'postgresql:']), 'DB_URL');
NODE

# No production traffic, no migrations, no seed changes. PostgreSQL read-only transaction.
psql "$DB_URL" --no-psqlrc -X -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-privilege-boundary.sql"
