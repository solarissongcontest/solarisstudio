#!/usr/bin/env bash
set -euo pipefail

# TG19 catalog rehearsal is EXCLUSIVELY for local/disposable Supabase.
# This does not mutate schema/data; it does not certify application RLS semantics.
fail() { printf '[tg19-world-privileges] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable; refusing hosted fallback"
command -v psql >/dev/null 2>&1 || fail "psql unavailable; refusing hosted fallback"
command -v node >/dev/null 2>&1 || fail "Node unavailable for strict URL verification"

# Read the CLI report strictly as inert data. Never eval shell-syntax emitted by
# local tooling: additional keys or a malformed URL must not execute commands.
status_env="$(supabase status -o env)" || fail "A local Supabase stack is not running"
verified_urls="$(node --input-type=module -e '
import { readFileSync } from "node:fs";
const lines = readFileSync(0, "utf8").split(/\r?\n/);
const values = new Map();
for (const line of lines) {
  const pair = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (!pair || !["API_URL", "DB_URL"].includes(pair[1])) continue;
  const key = pair[1];
  if (values.has(key)) throw new Error("Duplicate " + key + " in local Supabase status");
  let value = pair[2].trim();
  const quote = value[0];
  if (quote === "\"" || quote?.charCodeAt(0) === 39) {
    if (value.at(-1) !== quote) throw new Error("Malformed quoted " + key);
    value = value.slice(1, -1);
  }
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error("Control character in " + key);
  values.set(key, value);
}
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function verify(key, protocols) {
  const raw = values.get(key);
  if (!raw) throw new Error("Missing " + key + " in local Supabase status");
  let url;
  try { url = new URL(raw); } catch { throw new Error(key + " is not a valid URL"); }
  if (!protocols.includes(url.protocol) || !localHosts.has(url.hostname.toLowerCase()) || !url.port) {
    throw new Error(key + " must have an exact loopback host and explicit port");
  }
  // In particular, libpq can redirect hosts through URI query parameters.
  if (url.search || url.hash) throw new Error(key + " has unexpected URL options");
  if (key === "API_URL" && (url.username || url.password || (url.pathname !== "/" && url.pathname !== ""))) {
    throw new Error("API_URL must be the bare local Supabase API origin");
  }
  return raw;
}
const api = verify("API_URL", ["http:"]);
const db = verify("DB_URL", ["postgres:", "postgresql:"]);
process.stdout.write(api + "\n" + db + "\n");
' <<<"$status_env")" || fail "Supabase status API/database targets are not unambiguously loopback-only"
mapfile -t urls <<< "$verified_urls"
[[ "${#urls[@]}" -eq 2 && -n "${urls[0]}" && -n "${urls[1]}" ]] || fail "Local Supabase returned an invalid target pair"
DB_URL="${urls[1]}"

# libpq environment variables can override a URL host (especially PGHOSTADDR).
# Refuse inherited client authority and use only the verified explicit DB_URL.
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPORT PGDATABASE PGUSER

# No production traffic, no migrations, no seed changes. PostgreSQL read-only transaction.
psql "$DB_URL" --no-psqlrc -X -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-privilege-boundary.sql"
