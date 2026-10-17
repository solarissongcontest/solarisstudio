#!/usr/bin/env bash
set -euo pipefail

# Solaris Studio production migration deployer.
# Deliberately local/operator-run: production credentials must never be exposed to CI.

PRODUCTION_PROJECT_REF="dkxmnvekiopyesuzggeu"
EXPECTED_REMOTE_HEAD="20261014020000"
EXPECTED_REPO_HEAD="20261017143200"

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

[[ "${SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF:-}" == "$PRODUCTION_PROJECT_REF" ]] || fail "set SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF=$PRODUCTION_PROJECT_REF explicitly"
[[ "${SOLARIS_PRODUCTION_DEPLOY_APPROVED:-}" == "YES" ]] || fail "set SOLARIS_PRODUCTION_DEPLOY_APPROVED=YES after reviewing the deployment candidate"

compatibility_stubs=()
cleanup() {
  local stub
  for stub in "${compatibility_stubs[@]:-}"; do
    [[ -n "$stub" ]] && rm -f "$stub"
  done
  rm -rf "$repo_root/supabase/.temp"
}
trap cleanup EXIT INT TERM

printf 'Target project: %s\n' "$PRODUCTION_PROJECT_REF"
printf 'Expected remote migration head before push: %s\n' "$EXPECTED_REMOTE_HEAD"
printf 'Repository migration head: %s\n' "$EXPECTED_REPO_HEAD"
printf 'Git SHA: %s\n' "$(git rev-parse HEAD)"

# Link interactively/local-only. The CLI may request the production DB password.
supabase link --project-ref "$PRODUCTION_PROJECT_REF"

printf '\nMigration parity before deployment:\n'
list_before="$(supabase migration list --linked)"
printf '%s\n' "$list_before"
remote_head="$(printf '%s\n' "$list_before" | remote_head_from_list)"
[[ "$remote_head" == "$EXPECTED_REMOTE_HEAD" ]] || fail "remote migration head is ${remote_head:-unknown}, expected $EXPECTED_REMOTE_HEAD; do not deploy until drift is understood"

# The October production project retains bootstrap migration-history timestamps
# from its cutover that are intentionally not part of the canonical repository
# migration replay. Supabase CLI compares migration timestamps, so recent CLI
# versions refuse db push while those remote-only history rows lack matching
# local filenames. Do not rewrite the production history table. Instead, create
# temporary no-op timestamp aliases for remote-only versions that are already at
# or before the exact expected production head. Because they are already marked
# applied remotely, the CLI will never execute these stubs; they exist only for
# history comparison and are deleted by the exit trap.
mapfile -t remote_only_versions < <(printf '%s\n' "$list_before" | remote_only_versions_from_list)
if (( ${#remote_only_versions[@]} > 0 )); then
  printf '\nPreparing %d temporary remote-history compatibility stubs.\n' "${#remote_only_versions[@]}"
  for version in "${remote_only_versions[@]}"; do
    [[ "$version" =~ ^[0-9]{14}$ ]] || fail "invalid remote-only migration version: $version"
    [[ "$version" < "$EXPECTED_REMOTE_HEAD" || "$version" == "$EXPECTED_REMOTE_HEAD" ]] \
      || fail "remote-only migration $version is newer than expected production head $EXPECTED_REMOTE_HEAD"
    if compgen -G "supabase/migrations/${version}_*.sql" >/dev/null; then
      fail "remote-only migration $version unexpectedly has a local migration file"
    fi
    stub="supabase/migrations/${version}_remote_history_compat.sql"
    printf '%s\n' \
      '-- Temporary Solaris Studio production-history compatibility stub.' \
      '-- This version is already applied remotely and this file must never execute.' \
      > "$stub"
    compatibility_stubs+=("$stub")
  done
fi

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
