#!/usr/bin/env bash
set -euo pipefail
: "${V3_S16_RUNTIME_DIR:?An explicitly created disposable runtime worktree is required}"
# Keep the candidate checkout clean: stack allocation rewrites runtime config,
# so its CLI is used only in the owned runtime worktree, never the evidence tree.
eval "$(cd "$V3_S16_RUNTIME_DIR" && supabase status -o env)"
case "${API_URL:?}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Refusing hosted S16 API' >&2; exit 1;; esac
case "${DB_URL:?}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local S16 database' >&2; exit 1;; esac
for pg_override in ${!PG@}; do unset "$pg_override"; done
export SUPABASE_DB_URL="$DB_URL" V3_S16_TEST_DB_URL="$DB_URL"
export V3_CANDIDATE_SHA="$(git rev-parse HEAD)"
# A new main migration must not silently turn older candidate evidence into a
# catalog of a newer schema. The candidate must be reconciled instead.
expected_versions="$(find supabase/migrations -maxdepth 1 -name '*.sql' -printf '%f\n' | cut -d_ -f1 | sort)"
actual_versions="$(psql "$DB_URL" -XAtq -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version')"
[[ "$expected_versions" == "$actual_versions" ]] || { echo 'Candidate/database migration sets differ; refusing SHA attribution' >&2; exit 1; }
bunx vitest run src/lib/v3-s16-candidate-sha.test.ts src/lib/v3-s16-catalog.test.ts src/lib/v3-s16-catalog.database.test.ts src/lib/v3-s16-mutation-authority.test.ts src/lib/v3-s16-release-risk.test.ts
bun run scripts/collect-v3-s16-catalog-evidence.ts
bun run scripts/check-v3-s16-mutation-authority.ts --catalog=v3-release-preflight/s16/catalog-evidence.json
# This is collector acceptance, not domain certification. No per-domain negative
# execution manifests have been supplied and the release result must stay false.
bun -e 'const r=await Bun.file("v3-release-preflight/static/s16-mutation-authority.json").json();if(r.s16Passed!==false)throw new Error("Catalog-only acceptance falsely certified S16");console.log("Catalog correctness verified; domain release blockers retained")'
