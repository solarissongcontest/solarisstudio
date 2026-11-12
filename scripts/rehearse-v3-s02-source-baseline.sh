#!/usr/bin/env bash
# FRESH disposable source-defined qualification, never a hosted upgrade.
set -euo pipefail
fail(){ echo "::error::$*" >&2; exit 1; }
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == YES && "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || fail 'Explicit local opt-in required'
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH ${!PG@}; do
 [[ -z "${!key:-}" ]] || fail "Refusing inherited connection authority: $key"
done
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
sha="$(git rev-parse HEAD)"
[[ "${REVIEWED_SHA:-}" == "$sha" ]] || fail 'Exact reviewed SHA required'
git diff --exit-code --quiet -- . ':!supabase/config.toml' || fail 'Tracked source changed'
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ && "${GITHUB_JOB:-}" =~ ^[A-Za-z0-9_-]+$ ]] || fail 'Qualification requires its owned disposable CI job'
job_namespace="${GITHUB_JOB//_/-}"; job_namespace="${job_namespace,,}"
expected_project="archive-v3-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-$job_namespace"
actual_project="$(python3 -c 'import tomllib; print(tomllib.load(open("supabase/config.toml","rb"))["project_id"])')"
[[ "$actual_project" == "$expected_project" ]] || fail 'Not this run-owned disposable project'
export DOCKER_HOST=unix:///var/run/docker.sock
out=s02-source-evidence
[[ ! -e "$out" ]] || fail 'Refusing stale/reused evidence directory'
mkdir "$out"
export S02_EVIDENCE_DIR="$out"
node --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';
import {PROFILE} from './scripts/check-v3-s02-baseline.mjs';
writeFileSync(process.env.S02_EVIDENCE_DIR+'/stages.json',JSON.stringify(Object.fromEntries(PROFILE.requiredStages.map(k=>[k,'not_executed']))));
JS
record(){
 S02_STAGE="$1" S02_OUTCOME="$2" node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const p=process.env.S02_EVIDENCE_DIR+'/stages.json',v=JSON.parse(readFileSync(p));
if(!Object.hasOwn(v,process.env.S02_STAGE))throw Error('Unknown stage');
v[process.env.S02_STAGE]=process.env.S02_OUTCOME;
writeFileSync(p,JSON.stringify(v,null,2)+'\n');
JS
}
current=""
finish(){
 status=$?
 trap - EXIT
 if [[ "$status" != 0 && -n "$current" ]]; then record "$current" failure || true; fi
 if supabase stop --no-backup > "$out/cleanup.log" 2>&1; then record cleanup success; else record cleanup failure; status=1; fi
 if [[ "$status" == 0 ]]; then node scripts/check-v3-s02-baseline.mjs qualify "$out" || status=1
 else echo 'S02 qualification INCOMPLETE; no passing certificate emitted' >&2; fi
 exit "$status"
}
trap finish EXIT
run(){ current="$1"; shift; echo "S02 stage: $current"; "$@"; record "$current" success; current=""; }
# Status is data, not shell code. Never eval an unvalidated CLI response.
status="$(supabase status -o env)" || fail 'Local stack unavailable'
API_URL=""; DB_URL=""; ANON_KEY=""; SERVICE_ROLE_KEY=""
while IFS= read -r entry; do
 key="${entry%%=*}"; value="${entry#*=}"
 case "$key" in API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY) ;; *) continue;; esac
 [[ "$value" == \"*\" ]] || fail 'Malformed local status'
 value="${value:1:${#value}-2}"
 [[ "$value" != *'$('* && "$value" != *$'\x60'* && "$value" != *'"'* ]] || fail 'Unsafe local status'
 printf -v "$key" '%s' "$value"
done <<< "$status"
unset status entry value key
[[ -n "$API_URL" && -n "$DB_URL" && -n "$ANON_KEY" && -n "$SERVICE_ROLE_KEY" ]] || fail 'Missing local identity'
S02_API="$API_URL" S02_DB="$DB_URL" node --input-type=module <<'JS'
for(const [key,protocols] of [['S02_API',['http:']],['S02_DB',['postgres:','postgresql:']]]){
 const u=new URL(process.env[key]);
 if(!protocols.includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!u.port||u.search||u.hash)throw Error('Nonlocal/overridden target');
}
JS
export SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL" E2E_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
DATABASE_URL="$DB_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" bun run scripts/check-v3-production-isolation.ts
sql(){ psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
# Local observability only. No permissions or authorization checks are loosened.
sql -c "alter system set track_functions='all';"
sql -c 'select pg_reload_conf();'
boundary(){
 node scripts/stage-v3-s07-televote-source-truth.mjs --writer-boundary > "$out/writer-boundary.sql"
 sql -f "$out/writer-boundary.sql"
 rm "$out/writer-boundary.sql"
}
collect(){
 sql -f scripts/v3-s02-runtime-dependencies-local.sql > "$out/$1.json"
 sql -f scripts/v3-s06-hosted-catalog-digests-local.sql > "$out/fingerprints-$1.json"
}
current=fresh-source
boundary
collect before
run fresh-source node scripts/check-v3-s02-baseline.mjs fresh "$out"
run dependency-before node scripts/check-v3-s02-baseline.mjs graph "$out" before
run strict-dual-negative sql -f .github/tests/v3-s02-source-security.sql
export V3_CANDIDATE_SHA="$sha" V3_S14_ALLOW_PARTIAL=0 V3_S14_REQUIRE_COMPLETE=1 V3_RELEASE_EVIDENCE_DIR="$out/contest"
run complete-contest bash .github/scripts/v3-full-contest-rehearsal.sh
cp "$out/contest/s14-full-contest.json" "$out/lifecycle.json"
export SOLARIS_INCLUDE_S13_FORWARD_RECOVERY=YES
run ordered-archive-recovery bash scripts/rehearse-v3-s14-archive-forward-effects-local.sh
run archive-behavior bash .github/scripts/v3-s14-archive-system-rehearsal.sh
run archive-authorization bash .github/scripts/v3-s14-archive-guard-rehearsal.sh
run archive-terminal bash .github/scripts/v3-s14-archive-delete-guard-rehearsal.sh
run archive-convergence bash .github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh
run ballot-invariants bash .github/scripts/v3-s3-televote-invariants-rehearsal.sh
run published-source bash .github/scripts/v3-s14-televote-result-truth-rehearsal.sh
run replay-and-atomic-repair bash .github/scripts/v3-s14-televote-result-truth-replay-hardening-rehearsal.sh
current=dependency-after
collect after
run dependency-after node scripts/check-v3-s02-baseline.mjs graph "$out" after
current=second-source-replay
supabase db reset --local --no-seed
boundary
sql -f .github/tests/v3-s02-source-security.sql
bash scripts/rehearse-v3-s14-archive-forward-effects-local.sh
collect second
record second-source-replay success
current=""
# EXIT cleanup must succeed before the qualifying report can be emitted.
