#!/usr/bin/env bash
set -euo pipefail
fail() { echo "::error::$*" >&2; exit 1; }
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == YES ]] || fail 'Local rehearsal opt-in required'
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || fail 'Local target required'
# No inherited connection authority: psql uses only the owned Unix socket.
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_URL VITE_SUPABASE_URL E2E_SUPABASE_URL CONFIRMATIONS_SUPABASE_URL VITE_CONFIRMATIONS_SUPABASE_URL SUPABASE_ACCESS_TOKEN SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH ${!PG@}; do
  [[ -z "${!key:-}" ]] || fail "Refusing inherited connection config: $key"
done
export DOCKER_HOST=unix:///var/run/docker.sock
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
sha="$(git rev-parse HEAD)"
[[ "${REVIEWED_SHA:-$sha}" == "$sha" ]] || fail 'Exact source SHA mismatch'
image=postgres:17.11
expected_image=sha256:eb0fb2377534e65aad04f37838956b3dfb888e1a3dd3c1acf957bc6557eb6c7d
if ! docker image inspect "$image" >/dev/null 2>&1; then docker pull "$image"; fi
[[ "$(docker image inspect --format '{{.Id}}' "$image")" == "$expected_image" ]] || fail 'Unreviewed PostgreSQL image'
temporary="$(mktemp -d)"
cid=""
cleanup() {
  status=$?
  if [[ -n "$cid" ]]; then docker rm -f "$cid" >/dev/null || status=1; fi
  rm -rf "$temporary"
  exit "$status"
}
trap cleanup EXIT
# Never remove an existing named container. Retain only the ID we created.
cid="$(docker run -d --rm --pull=never --network none -e POSTGRES_PASSWORD=s07_disposable_only "$image")"
[[ "$cid" =~ ^[0-9a-f]{64}$ ]] || fail 'Missing owned container ID'
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]] || fail 'Container has network access'
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]] || fail 'Database ports exposed'
ready=false
for attempt in $(seq 1 50); do
  if docker exec "$cid" pg_isready -h /var/run/postgresql -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'Isolated PostgreSQL startup timeout'
sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "${1:-postgres}" -f -; }
[[ "$(printf 'show server_version_num;' | sql)" == 170011 ]] || fail 'PostgreSQL 17.11 required'
node scripts/stage-v3-s07-televote-source-truth.mjs > "$temporary/source-truth.sql"

# Missing prerequisites fail before any recovery object is created.
docker exec "$cid" createdb -U postgres s07_missing
if sql s07_missing < "$temporary/source-truth.sql" > "$temporary/missing.log" 2>&1; then
  fail 'Missing dependencies accepted'
fi
grep -q 'S07 missing dependency:' "$temporary/missing.log" || { cat "$temporary/missing.log"; fail 'Wrong prerequisite failure'; }
[[ "$(printf "select to_regclass('private.v3_televote_result_projection_sources') is null;" | sql s07_missing)" == t ]] || fail 'Failed preflight mutated schema'

sql < docs/v3/recovery-candidates/fixtures/s07-televote-source-truth-local.sql
sql < "$temporary/source-truth.sql"
sql < .github/tests/v3-s07-televote-source-truth.sql
if sql < "$temporary/source-truth.sql" > "$temporary/repeat.log" 2>&1; then
  fail 'Repeated authority installation accepted'
fi
grep -q 'S07 source truth already or partially installed' "$temporary/repeat.log" || { cat "$temporary/repeat.log"; fail 'Wrong repeat failure'; }

# Cleanup is part of success. No report claims proof before it succeeds.
docker rm -f "$cid" >/dev/null
cid=""
S07_CANDIDATE_SHA="$sha" node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SOURCES, GUARD } from "./scripts/stage-v3-s07-televote-source-truth.mjs";
const files = [...SOURCES, GUARD,
  "docs/v3/recovery-candidates/fixtures/s07-televote-source-truth-local.sql",
  ".github/tests/v3-s07-televote-source-truth.sql"];
const sourceHashes = Object.fromEntries(files.map(path => [path,
  createHash("sha256").update(readFileSync(path)).digest("hex")]));
writeFileSync("s07-local-source-truth-proof.json", JSON.stringify({
  task: "S07", candidateSha: process.env.S07_CANDIDATE_SHA,
  environment: "networkless PostgreSQL 17.11; no published ports",
  fixture: "synthetic dependencies; real canonical projection/adapters/replay implementation",
  sourceHashes, sourceIdentity: true, canonicalPayloadWriterOwnerOnly: true,
  healthyReplayPreservesIdentity: true, duplicateConsequencesRejected: true,
  unpublishedAndUnboundSourcesRefused: true, missingDependenciesRefusedBeforeMutation: true,
  atomicFailureRollback: true, forgedMarkersDenied: true, acceptedBallotsUnchanged: true,
  cleanupSucceeded: true, fullHostedEquivalenceCertified: false,
  productionDeploymentAuthorized: false
}, null, 2) + "\n", { flag: "wx" });
JS
echo 'PASS S07 isolated source-truth integration; no hosted equivalence or production authorization'
