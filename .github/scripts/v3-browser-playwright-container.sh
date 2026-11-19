#!/usr/bin/env bash
# Exact-version Playwright browsers with baked, OS-provided shared libraries.
# This runs only the browser process: local Supabase and the preview Worker
# remain on the GitHub runner and are independently checked before navigation.
set -euo pipefail

mode="${1:-}"
shift || true
case "$mode" in
  probe|run) ;;
  *) echo "Expected browser container mode: probe|run" >&2; exit 1 ;;
esac
[[ "$#" -gt 0 ]] || { echo "Missing browser command" >&2; exit 1; }
workspace="${GITHUB_WORKSPACE:-$PWD}"
[[ -f "$workspace/package.json" && -f "$workspace/playwright.config.ts" ]] || {
  echo "Browser workspace missing source and Playwright config" >&2; exit 1;
}
image="mcr.microsoft.com/playwright:v1.55.0-noble"
network="none"
if [[ "$mode" == run ]]; then
  # Fail closed on hosted credentials, deceptive URL userinfo and remote API
  # target. Host-network is necessary solely for the runner's loopback Worker
  # and isolated Supabase ports.
  BROWSER_TARGET="${E2E_SUPABASE_URL:-}" node --input-type=module <<'VALIDATE_LOCAL'
const url = new URL(process.env.BROWSER_TARGET ?? "");
if (url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) ||
    !url.port || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash) {
  throw Error("Browser container refused non-local Supabase target");
}
VALIDATE_LOCAL
  network="host"
fi

args=(
  run --rm -i --init --ipc=host --network "$network"
  --mount "type=bind,src=${workspace},dst=/workspace"
  --workdir /workspace
  --env "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright"
  --env "GITHUB_WORKSPACE=/workspace"
  --env "SUPABASE_PROJECT_ID=local"
  --env "SUPABASE_PROJECT_REF=local"
  --env "CI=true"
)
if [[ "$mode" == run ]]; then
  # Deliberately whitelist only local-e2e application and browser controls;
  # never forward GITHUB_TOKEN, hosted credentials or host env wholesale.
  for key in \
    E2E_SUPABASE_URL E2E_SUPABASE_PUBLISHABLE_KEY E2E_BASE_URL \
    E2E_ORGANIZER_EMAIL E2E_ORGANIZER_PASSWORD \
    E2E_ORGANIZER_B_EMAIL E2E_ORGANIZER_B_PASSWORD \
    E2E_COUNTRY_EMAIL E2E_COUNTRY_PASSWORD \
    E2E_SUSPENDED_EMAIL E2E_SUSPENDED_PASSWORD \
    GITHUB_EVENT_NAME GITHUB_REF \
    SOLARIS_E2E_BYPASS_MAINTENANCE SOLARIS_PR455_PREFLIGHT_ALREADY_PASSED \
    VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY \
    SUPABASE_URL SUPABASE_PUBLISHABLE_KEY \
    VITE_CONFIRMATIONS_SUPABASE_URL VITE_CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY \
    CONFIRMATIONS_SUPABASE_URL CONFIRMATIONS_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID VITE_SUPABASE_PROJECT_REF \
    E2E_FULL_AUDIT PERSONALITY_REFERENCE_CAPTURE E2E_VISUAL_CAPTURE; do
    if [[ -v "$key" ]]; then args+=(--env "$key"); fi
  done
fi
exec docker "${args[@]}" "$image" "$@"
