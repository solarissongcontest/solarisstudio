#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-production-head-upgrade] %s\n' "$*"; }
fail() { printf '\n[v3-production-head-upgrade] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

PRODUCTION_HEAD="${V3_PRODUCTION_MIGRATION_HEAD:-20261014020000}"
ROOT="$(git rev-parse --show-toplevel)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
HELD_DIR="$(mktemp -d)"
RESTORED=false
STARTED=false

restore_migrations() {
  if [[ "$RESTORED" == false ]]; then
    if compgen -G "$HELD_DIR/*.sql" >/dev/null; then
      mv "$HELD_DIR"/*.sql "$MIGRATIONS_DIR"/
    fi
    RESTORED=true
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  restore_migrations || true
  if [[ "$STARTED" == true ]]; then
    (cd "$ROOT" && supabase stop --no-backup) >/dev/null 2>&1 || true
  fi
  rm -rf "$HELD_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

[[ -f "$MIGRATIONS_DIR/${PRODUCTION_HEAD}_v3_me_cutover.sql" ]] \
  || fail "Configured production head migration is missing: $PRODUCTION_HEAD"

mapfile -t all_migrations < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
(( ${#all_migrations[@]} > 0 )) || fail "No migration files found"
last_index=$((${#all_migrations[@]} - 1))
LATEST_HEAD="${all_migrations[$last_index]%%_*}"
[[ "$LATEST_HEAD" =~ ^[0-9]{14}$ ]] || fail "Cannot derive repository migration head"
[[ "$LATEST_HEAD" > "$PRODUCTION_HEAD" ]] || fail "Repository head must be ahead of production for this rehearsal"

log "Holding migrations newer than hosted production head $PRODUCTION_HEAD"
held=0
for base in "${all_migrations[@]}"; do
  version="${base%%_*}"
  [[ "$version" =~ ^[0-9]{14}$ ]] || continue
  if [[ "$version" > "$PRODUCTION_HEAD" ]]; then
    mv "$MIGRATIONS_DIR/$base" "$HELD_DIR/$base"
    ((held += 1))
  fi
done
(( held > 0 )) || fail "No post-production migrations were isolated"
expected_delta="$held"

log "Building disposable local Supabase at the hosted production migration head"
cd "$ROOT"
supabase start
STARTED=true
supabase db reset --local --no-seed

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

baseline_head="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select version from supabase_migrations.schema_migrations order by version desc limit 1;")"
[[ "$baseline_head" == "$PRODUCTION_HEAD" ]] \
  || fail "Local baseline head is $baseline_head, expected hosted production head $PRODUCTION_HEAD"

log "Restoring the exact repository delta and applying it as one upgrade"
restore_migrations
supabase migration up --local --include-all

upgraded_head="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select version from supabase_migrations.schema_migrations order by version desc limit 1;")"
[[ "$upgraded_head" == "$LATEST_HEAD" ]] \
  || fail "Local upgraded head is $upgraded_head, expected repository head $LATEST_HEAD"

applied_delta="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from supabase_migrations.schema_migrations where version > '$PRODUCTION_HEAD';")"
[[ "$applied_delta" == "$expected_delta" ]] \
  || fail "Applied migration delta count $applied_delta differs from repository delta $expected_delta"

log "Re-running critical V3 invariants on the production-head upgrade path"
for rehearsal in \
  v3-operation-receipt-rehearsal.sh \
  v3-s2-entry-correction-rehearsal.sh \
  v3-confirmation-security-rehearsal.sh \
  v3-s3-confirmation-invariants-rehearsal.sh \
  v3-s3-entry-invariants-rehearsal.sh \
  v3-s3-media-invariants-rehearsal.sh \
  v3-entry-receipt-security-rehearsal.sh \
  v3-entry-restore-provenance-assert.sh \
  v3-jury-security-rehearsal.sh \
  v3-s3-jury-invariants-rehearsal.sh \
  v3-televote-reconciliation-rehearsal.sh \
  v3-s3-televote-invariants-rehearsal.sh
  do
    log "Running $rehearsal"
    bash "$ROOT/.github/scripts/$rehearsal"
  done

log "Production-head-equivalent upgrade passed: $PRODUCTION_HEAD -> $LATEST_HEAD ($expected_delta migrations)"
