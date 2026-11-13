#!/usr/bin/env bash
# Synthetic migration metadata only. No production target or credentials accepted.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# == 1 && -f "$1" && -x "$1" ]] || { echo 'Usage: rehearse-v3-preview-frontier-local.sh /absolute/path/to/pinned-supabase-binary' >&2; exit 2; }
for key in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD DATABASE_URL POSTGRES_URL SUPABASE_DB_URL PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS DOCKER_HOST DOCKER_CONTEXT; do
  [[ -z "${!key:-}" ]] || { echo "Refusing inherited $key" >&2; exit 2; }
done
[[ "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" == unix://* ]] || { echo 'Local Docker socket required' >&2; exit 2; }
image='postgres:17.11@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f'
stack="solaris-frontier-proof-$$"
cleanup() { docker rm -f "$stack" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No mounts, exposed ports, inherited environment, linked project or network.
docker run --detach --name "$stack" --network none -e POSTGRES_PASSWORD=synthetic-local-only "$image" >/dev/null
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}/{{len .HostConfig.PortBindings}}' "$stack")" == 'none/0' ]] || exit 2
for attempt in {1..30}; do
  if docker exec "$stack" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  [[ $attempt != 30 ]] || { echo 'Isolated PostgreSQL unavailable' >&2; exit 2; }
  sleep 1
done
pg() { docker exec -e PGPASSWORD=synthetic-local-only -i "$stack" psql -h 127.0.0.1 -X -qAt -U postgres -v ON_ERROR_STOP=1 "$@"; }
[[ "$(pg -c 'show server_version_num')" == 170011 ]] || exit 2
docker cp "$1" "$stack:/usr/local/bin/supabase-fixture" >/dev/null
[[ "$(docker exec "$stack" /usr/local/bin/supabase-fixture --version)" == 2.113.0 ]] || { echo 'Pinned Supabase CLI 2.113.0 required' >&2; exit 2; }
docker exec "$stack" sh -c 'mkdir -p /tmp/fixture/supabase/migrations; cd /tmp/fixture; /usr/local/bin/supabase-fixture init --yes' >/dev/null
# A bootstrap alias absent from the repository; two later source migrations
# have effect/history disagreement. This is NOT a reconstruction of production.
pg <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations values
 ('20261001202836', array[]::text[], 'synthetic_bootstrap'),
 ('20261101181812', array[]::text[], 'synthetic_tip');
create table public.synthetic_existing_effect(id integer primary key);
insert into public.synthetic_existing_effect values (7);
SQL
docker exec -i "$stack" sh -c 'cat > /tmp/fixture/supabase/migrations/20261014020000_source_bootstrap.sql' <<'SQL'
select 1;
SQL
docker exec -i "$stack" sh -c 'cat > /tmp/fixture/supabase/migrations/20261019111000_effect_already_present.sql' <<'SQL'
create table public.synthetic_existing_effect(id integer primary key);
SQL
docker exec -i "$stack" sh -c 'cat > /tmp/fixture/supabase/migrations/20261019112100_effect_absent.sql' <<'SQL'
create table public.synthetic_absent_effect(id integer primary key);
SQL
docker exec -i "$stack" sh -c 'cat > /tmp/fixture/supabase/migrations/20261101181812_synthetic_tip.sql' <<'SQL'
select 1;
SQL
fingerprint() { pg -c "select md5(coalesce((select string_agg(row_to_json(m)::text,',' order by version) from supabase_migrations.schema_migrations m),'') || ':' || (select string_agg(id::text,',' order by id) from public.synthetic_existing_effect) || ':' || coalesce(to_regclass('public.synthetic_absent_effect')::text,'ABSENT'))"; }
before="$(fingerprint)"
if output="$(docker exec -w /tmp/fixture "$stack" /usr/local/bin/supabase-fixture db push --dry-run --db-url 'postgresql://postgres:synthetic-local-only@127.0.0.1:5432/postgres?sslmode=disable' 2>&1)"; then
  echo 'Expected CLI to refuse the unmatched remote bootstrap identity' >&2; exit 1
fi
[[ "$output" == *'Remote migration versions not found in local migrations directory'* ]] || { echo "$output" >&2; exit 1; }
[[ "$output" == *'20261001202836'* ]] || { echo 'CLI did not identify the exact unmatched version' >&2; exit 1; }
[[ "$(fingerprint)" == "$before" ]] || { echo 'Dry-run changed synthetic state/history' >&2; exit 1; }
# Feed actual PG metadata to the existing offline comparator. Missing history
# alone cannot distinguish the existing SQL effect from the absent SQL effect.
history="$(pg -c "select json_agg(json_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations")"
cd "$root"
printf '%s' "$history" | bun -e '
import {auditV3ProductionMigrationFrontier as audit} from "./src/lib/v3-production-migration-frontier";
const history = JSON.parse(await Bun.stdin.text());
const candidateSha = Bun.spawnSync(["git","rev-parse","HEAD"]).stdout.toString().trim();
if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw Error("Invalid candidate identity");
const r = audit(["20261014020000_source_bootstrap.sql", "20261019111000_effect_already_present.sql", "20261019112100_effect_absent.sql", "20261101181812_synthetic_tip.sql"],history);
if (r.historyReconciled || r.previewHistoryCompatible || r.holesBeforeHostedHead.length !== 2 || r.remoteVersionsMissingLocally.length !== 1 || r.remoteVersionsMissingLocally[0].version !== "20261001202836") throw Error("Frontier diagnostic lost the raw CLI mismatch or SQL-effect distinction");
console.log(JSON.stringify({candidateSha, syntheticOnly:true, serverVersionNum:170011, cliVersion:"2.113.0", isolation:"network-none/no-ports", cliRefusalReproduced:true, unchangedAfterRefusal:true, ...r, sqlEffectsVerified:false, hostedEquivalenceCertified:false, productionDeploymentAuthorized:false}));'
echo 'PASS: actual CLI refusal reproduced; existing/absent SQL effects and history preserved; no production equivalence claimed.'
