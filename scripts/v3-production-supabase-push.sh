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

[[ "${CI:-}" != "true" ]] || fail "refusing to run in CI"
[[ "${GITHUB_ACTIONS:-}" != "true" ]] || fail "refusing to run in GitHub Actions"
command -v git >/dev/null || fail "git is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run inside the Solaris Studio repository"
cd "$repo_root"

[[ -z "$(git status --porcelain)" ]] || fail "working tree must be clean"

actual_repo_head="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort | tail -n 1 | cut -d_ -f1)"
[[ "$actual_repo_head" == "$EXPECTED_REPO_HEAD" ]] || fail "repository migration head is $actual_repo_head, expected $EXPECTED_REPO_HEAD; refresh the deployment candidate"

[[ "${SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF:-}" == "$PRODUCTION_PROJECT_REF" ]] || fail "set SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF=$PRODUCTION_PROJECT_REF explicitly"
[[ "${SOLARIS_PRODUCTION_DEPLOY_APPROVED:-}" == "YES" ]] || fail "set SOLARIS_PRODUCTION_DEPLOY_APPROVED=YES after reviewing the deployment candidate"

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
