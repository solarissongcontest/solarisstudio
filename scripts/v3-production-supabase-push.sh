#!/usr/bin/env bash
set -euo pipefail

# Solaris Studio production migration deployer.
# Deliberately local/operator-run: production credentials must never be exposed to CI.

PRODUCTION_PROJECT_REF="dkxmnvekiopyesuzggeu"
EXPECTED_REMOTE_HEAD="20261014020000"
EXPECTED_REPO_HEAD="20261017143200"
EXPECTED_PENDING_COUNT="55"
EXPECTED_PENDING_VERSIONS=(
  20261014030000
  20261014040000
  20261014050000
  20261014060000
  20261014132819
  20261014133955
  20261014142000
  20261014153000
  20261014194651
  20261015040000
  20261015050000
  20261015060000
  20261015070000
  20261015080000
  20261015090000
  20261015091000
  20261015155722
  20261015164100
  20261015173000
  20261015180000
  20261015183000
  20261015183100
  20261015183200
  20261015201221
  20261016040000
  20261016043000
  20261016050000
  20261016053000
  20261016060000
  20261016060500
  20261016062000
  20261016063000
  20261016064000
  20261016064100
  20261016070000
  20261016071000
  20261016150000
  20261016153000
  20261016160000
  20261016163000
  20261016163100
  20261016193700
  20261017001900
  20261017002000
  20261017002100
  20261017002200
  20261017002300
  20261017002400
  20261017100000
  20261017103000
  20261017110000
  20261017113000
  20261017143000
  20261017143100
  20261017143200
)

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

remote_head_from_list() {
  awk -F'|' '
    {
      local_version = $1
      remote_version = $2
      gsub(/[`[:space:]]/, "", local_version)
      gsub(/[`[:space:]]/, "", remote_version)
      if (local_version ~ /^[0-9]{14}$/ && remote_version ~ /^[0-9]{14}$/) {
        print remote_version
      }
    }
  ' | tail -n 1
}

remote_only_versions_from_list() {
  awk -F'|' '
    {
      local_version = $1
      remote_version = $2
      gsub(/[`[:space:]]/, "", local_version)
      gsub(/[`[:space:]]/, "", remote_version)
      if (local_version == "" && remote_version ~ /^[0-9]{14}$/) {
        print remote_version
      }
    }
  '
}

local_only_versions_from_list() {
  awk -F'|' '
    {
      local_version = $1
      remote_version = $2
      gsub(/[`[:space:]]/, "", local_version)
      gsub(/[`[:space:]]/, "", remote_version)
      if (local_version ~ /^[0-9]{14}$/ && remote_version == "") {
        print local_version
      }
    }
  '
}

[[ "${CI:-}" != "true" ]] || fail "refusing to run in CI"
[[ "${GITHUB_ACTIONS:-}" != "true" ]] || fail "refusing to run in GitHub Actions"
command -v git >/dev/null || fail "git is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run inside the Solaris Studio repository"
cd "$repo_root"

# Supabase CLI link metadata is generated runtime state, never source. Remove a
# stale copy before enforcing the clean-tree gate, and remove any new copy again
# on exit so the commit-gated rerun starts from the same clean checkout.
rm -rf "$repo_root/supabase/.temp"

[[ -z "$(git status --porcelain)" ]] || fail "working tree must be clean"

actual_repo_head="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort | tail -n 1 | cut -d_ -f1)"
[[ "$actual_repo_head" == "$EXPECTED_REPO_HEAD" ]] || fail "repository migration head is $actual_repo_head, expected $EXPECTED_REPO_HEAD; refresh the deployment candidate"
[[ "${#EXPECTED_PENDING_VERSIONS[@]}" -eq "$EXPECTED_PENDING_COUNT" ]] || fail "deployment script pending-version manifest is internally inconsistent"

[[ "${SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF:-}" == "$PRODUCTION_PROJECT_REF" ]] || fail "set SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF=$PRODUCTION_PROJECT_REF explicitly"
[[ "${SOLARIS_PRODUCTION_DEPLOY_APPROVED:-}" == "YES" ]] || fail "set SOLARIS_PRODUCTION_DEPLOY_APPROVED=YES after reviewing the deployment candidate"

compatibility_stubs=()
historical_hold_dir="$(mktemp -d)"
cleanup() {
  local status=$?
  local stub
  trap - EXIT INT TERM
  for stub in "${compatibility_stubs[@]:-}"; do
    [[ -n "$stub" ]] && rm -f "$stub"
  done
  if compgen -G "$historical_hold_dir/*.sql" >/dev/null; then
    mv "$historical_hold_dir"/*.sql "$repo_root/supabase/migrations/"
  fi
  rm -rf "$historical_hold_dir" "$repo_root/supabase/.temp"
  exit "$status"
}
trap cleanup EXIT INT TERM

printf 'Target project: %s\n' "$PRODUCTION_PROJECT_REF"
printf 'Expected remote migration head before push: %s\n' "$EXPECTED_REMOTE_HEAD"
printf 'Repository migration head: %s\n' "$EXPECTED_REPO_HEAD"
printf 'Expected canonical pending migrations: %s\n' "$EXPECTED_PENDING_COUNT"
printf 'Git SHA: %s\n' "$(git rev-parse HEAD)"

# Link interactively/local-only. The CLI may request the production DB password.
supabase link --project-ref "$PRODUCTION_PROJECT_REF"

printf '\nMigration parity before deployment:\n'
list_before="$(supabase migration list --linked)"
printf '%s\n' "$list_before"
remote_head="$(printf '%s\n' "$list_before" | remote_head_from_list)"
[[ "$remote_head" == "$EXPECTED_REMOTE_HEAD" ]] || fail "remote migration head is ${remote_head:-unknown}, expected $EXPECTED_REMOTE_HEAD; do not deploy until drift is understood"

# The production project has two intentional pre-cutover history shapes:
#
# 1. canonical source migration files that were folded into the October hosted
#    bootstrap and therefore do not have individual remote history rows; and
# 2. hosted bootstrap history timestamps that are not canonical source files.
#
# Supabase CLI 2.121+ refuses db push while either side is unmatched. Never use
# --include-all and never rewrite production migration history to make the CLI
# happy. Instead, construct a temporary local compatibility view:
# - hold only local-only versions at or before the exact production head;
# - add no-op aliases only for remote-only versions at or before that head.
# Every held file is restored and every alias is deleted by the exit trap.
mapfile -t initial_local_only < <(printf '%s\n' "$list_before" | local_only_versions_from_list | sort)
historical_held=0
for version in "${initial_local_only[@]}"; do
  [[ "$version" =~ ^[0-9]{14}$ ]] || fail "invalid local-only migration version: $version"
  if [[ "$version" < "$EXPECTED_REMOTE_HEAD" || "$version" == "$EXPECTED_REMOTE_HEAD" ]]; then
    mapfile -t matches < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name "${version}_*.sql" -print | sort)
    (( ${#matches[@]} == 1 )) || fail "historical local-only migration $version resolves to ${#matches[@]} files, expected exactly one"
    mv "${matches[0]}" "$historical_hold_dir/"
    ((historical_held += 1))
  fi
done
if (( historical_held > 0 )); then
  printf '\nHolding %d pre-production local-only historical migrations during push.\n' "$historical_held"
fi

mapfile -t remote_only_versions < <(printf '%s\n' "$list_before" | remote_only_versions_from_list | sort)
if (( ${#remote_only_versions[@]} > 0 )); then
  printf 'Preparing %d temporary remote-history compatibility stubs.\n' "${#remote_only_versions[@]}"
  for version in "${remote_only_versions[@]}"; do
    [[ "$version" =~ ^[0-9]{14}$ ]] || fail "invalid remote-only migration version: $version"
    [[ "$version" < "$EXPECTED_REMOTE_HEAD" || "$version" == "$EXPECTED_REMOTE_HEAD" ]] \
      || fail "remote-only migration $version is newer than expected production head $EXPECTED_REMOTE_HEAD"
    if compgen -G "$repo_root/supabase/migrations/${version}_*.sql" >/dev/null; then
      fail "remote-only migration $version unexpectedly has a local migration file"
    fi
    stub="$repo_root/supabase/migrations/${version}_remote_history_compat.sql"
    printf '%s\n' \
      '-- Temporary Solaris Studio production-history compatibility stub.' \
      '-- This version is already applied remotely and this file must never execute.' \
      > "$stub"
    compatibility_stubs+=("$stub")
  done
fi

# Re-read parity through the temporary compatibility view. After reconciliation,
# every unmatched local version must be part of the exact rehearsed 55-migration
# production delta, and there must be no remote-only versions left.
list_compatible="$(supabase migration list --linked)"
mapfile -t remaining_remote_only < <(printf '%s\n' "$list_compatible" | remote_only_versions_from_list | sort)
(( ${#remaining_remote_only[@]} == 0 )) || fail "remote-only migration history remains after compatibility preparation: ${remaining_remote_only[*]}"

mapfile -t pending_versions < <(printf '%s\n' "$list_compatible" | local_only_versions_from_list | sort)
for version in "${pending_versions[@]}"; do
  [[ "$version" > "$EXPECTED_REMOTE_HEAD" ]] || fail "pre-production local-only migration $version remained after compatibility preparation"
done
(( ${#pending_versions[@]} == EXPECTED_PENDING_COUNT )) \
  || fail "canonical pending migration count is ${#pending_versions[@]}, expected $EXPECTED_PENDING_COUNT; refresh the deployment candidate"
for i in "${!EXPECTED_PENDING_VERSIONS[@]}"; do
  [[ "${pending_versions[$i]}" == "${EXPECTED_PENDING_VERSIONS[$i]}" ]] \
    || fail "canonical pending migration manifest differs at position $((i + 1)): found ${pending_versions[$i]}, expected ${EXPECTED_PENDING_VERSIONS[$i]}"
done
printf '\nCanonical pending migration manifest validated: %d migrations.\n' "${#pending_versions[@]}"
printf 'First pending: %s\n' "${pending_versions[0]}"
printf 'Last pending: %s\n' "${pending_versions[$((${#pending_versions[@]} - 1))]}"

printf '\nCanonical dry-run:\n'
supabase db push --linked --dry-run

printf '\nDry-run complete. Re-run with SOLARIS_PRODUCTION_COMMIT=YES to commit.\n'
[[ "${SOLARIS_PRODUCTION_COMMIT:-}" == "YES" ]] || exit 0

supabase db push --linked

printf '\nMigration parity after deployment:\n'
list_after="$(supabase migration list --linked)"
printf '%s\n' "$list_after"
remote_after="$(printf '%s\n' "$list_after" | remote_head_from_list)"
[[ "$remote_after" == "$EXPECTED_REPO_HEAD" ]] || fail "post-deploy head is ${remote_after:-unknown}, expected $EXPECTED_REPO_HEAD"

printf 'Production migration deployment completed at %s UTC\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
