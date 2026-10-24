#!/usr/bin/env bash
set -euo pipefail

# Runs one S14 Playwright leg against an explicitly owned local Vite process.
# The caller must already have exported the local Supabase environment used by
# the app. This helper never falls back to hosted infrastructure.
run_s14_browser_test() {
  local port="$1"
  local config="$2"
  local smoke_path="$3"
  local bootstrap_stage="$4"
  local run_stage="$5"
  local base_url="http://127.0.0.1:${port}"
  local evidence_dir="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}/s14-browser-runtime"
  local safe_name
  safe_name="${run_stage//[:\/]/-}"
  local vite_log="$evidence_dir/${safe_name}.vite.log"
  local readiness_body="$evidence_dir/${safe_name}.readiness-body.txt"
  local app_body="$evidence_dir/${safe_name}.app-smoke-body.txt"
  local playwright_list_log="$evidence_dir/${safe_name}.playwright-list.log"
  local playwright_artifact_dir="$evidence_dir/${safe_name}.playwright"
  local vite_pid=""
  local listening=0
  local ready=0
  local status=0
  local code=""

  [[ "$port" =~ ^[0-9]+$ ]] || fail "S14 browser runtime requires a numeric loopback port"
  case "$base_url" in
    http://127.0.0.1:*) ;;
    *) fail "S14 browser runtime refuses non-loopback base URL $base_url" ;;
  esac

  mkdir -p "$evidence_dir"
  : >"$vite_log"
  : >"$readiness_body"
  : >"$app_body"
  : >"$playwright_list_log"

  CURRENT_STAGE="${bootstrap_stage}:vite-bootstrap"
  log "S14 browser runtime: starting Vite explicitly on $base_url for $run_stage (context=$bootstrap_stage)"
  SOLARIS_E2E_BYPASS_MAINTENANCE=1 \
    bun run dev --host 127.0.0.1 --port "$port" --strictPort \
    >"$vite_log" 2>&1 &
  vite_pid=$!

  # A live process is not enough: prove Vite actually bound the exact strict
  # loopback port before any HTTP or Playwright work starts.
  for attempt in $(seq 1 40); do
    if ! kill -0 "$vite_pid" 2>/dev/null; then
      status=89
      break
    fi
    if ss -ltn 2>/dev/null | grep -Eq "127\\.0\\.0\\.1:${port}[[:space:]]"; then
      listening=1
      break
    fi
    sleep 0.5
  done
  if [[ "$status" == "0" && "$listening" != "1" ]]; then
    status=89
  fi

  CURRENT_STAGE="${bootstrap_stage}:http-readiness"
  if [[ "$status" == "0" ]]; then
    for attempt in $(seq 1 60); do
      if ! kill -0 "$vite_pid" 2>/dev/null; then
        status=90
        break
      fi

      code="$(
        curl \
          --silent \
          --show-error \
          --max-time 5 \
          --output "$readiness_body" \
          --write-out '%{http_code}' \
          --header 'Cookie: solaris_e2e_maintenance_bypass=1' \
          "$base_url/" \
          || true
      )"
      printf '[v3-s14-browser-runtime] readiness attempt=%s status=%s\n' "$attempt" "${code:-curl-error}" | tee -a "$vite_log"

      case "$code" in
        2*|3*|400|401|403)
          ready=1
          break
          ;;
      esac
      sleep 2
    done
  fi

  if [[ "$status" == "0" && "$ready" != "1" ]]; then
    status=91
  fi

  if [[ "$status" == "0" ]]; then
    code="$(
      curl \
        --silent \
        --show-error \
        --max-time 15 \
        --output "$app_body" \
        --write-out '%{http_code}' \
        --header 'Cookie: solaris_e2e_maintenance_bypass=1' \
        "$base_url$smoke_path" \
        || true
    )"
    printf '[v3-s14-browser-runtime] app-smoke path=%s status=%s\n' "$smoke_path" "${code:-curl-error}" | tee -a "$vite_log"

    case "$code" in
      2*|3*|400|401|403) ;;
      *) status=92 ;;
    esac
  fi

  if [[ "$status" == "0" ]]; then
    CURRENT_STAGE="${bootstrap_stage}:playwright-bootstrap"
    if ! E2E_BASE_URL="$base_url" \
      SOLARIS_E2E_BYPASS_MAINTENANCE=1 \
      bunx playwright test --list --config="$config" \
      >"$playwright_list_log" 2>&1; then
      status=93
    fi
  fi

  if [[ "$status" == "0" ]]; then
    CURRENT_STAGE="$run_stage"
    if ! E2E_BASE_URL="$base_url" \
      SOLARIS_E2E_BYPASS_MAINTENANCE=1 \
      bunx playwright test --config="$config"; then
      status=94
    fi
  fi

  if [[ -n "$vite_pid" ]] && kill -0 "$vite_pid" 2>/dev/null; then
    kill "$vite_pid" 2>/dev/null || true
    wait "$vite_pid" 2>/dev/null || true
  fi

  if [[ "$status" != "0" ]]; then
    # Playwright retains traces/screenshots on failure, but they normally live
    # under test-results/ outside the workflow's uploaded release-evidence tree.
    # Copy them into the exact-SHA evidence bundle before returning the failure.
    if [[ -d test-results ]]; then
      rm -rf "$playwright_artifact_dir"
      mkdir -p "$playwright_artifact_dir"
      cp -a test-results/. "$playwright_artifact_dir/"
    fi
    for summary in playwright-*.json; do
      [[ -f "$summary" ]] || continue
      cp "$summary" "$evidence_dir/${safe_name}.$(basename "$summary")"
    done

    printf '\n[v3-s14-browser-runtime] failure status=%s stage=%s context=%s run_stage=%s\n' \
      "$status" "$CURRENT_STAGE" "$bootstrap_stage" "$run_stage" >&2
    case "$status" in
      89) printf '[v3-s14-browser-runtime] Vite process started but port %s never listened\n' "$port" >&2 ;;
      90) printf '[v3-s14-browser-runtime] Vite exited before HTTP readiness\n' >&2 ;;
      91) printf '[v3-s14-browser-runtime] GET / never became HTTP-ready\n' >&2 ;;
      92) printf '[v3-s14-browser-runtime] application smoke route was not HTTP-ready\n' >&2 ;;
      93) printf '[v3-s14-browser-runtime] Playwright failed during collection/bootstrap\n' >&2 ;;
      94) printf '[v3-s14-browser-runtime] Playwright reached the application leg and failed there\n' >&2 ;;
    esac
    if grep -Fq "No StartEvent found in AsyncLocalStorage" "$readiness_body" "$app_body" 2>/dev/null; then
      printf '[v3-s14-browser-runtime] TanStack runtime failure: No StartEvent found in AsyncLocalStorage\n' >&2
    fi
    printf '\n[v3-s14-browser-runtime] Vite tail for %s\n' "$run_stage" >&2
    tail -300 "$vite_log" >&2 || true
    printf '\n[v3-s14-browser-runtime] listening sockets for port %s\n' "$port" >&2
    ss -ltnp 2>/dev/null | grep ":$port" >&2 || true
    printf '\n[v3-s14-browser-runtime] readiness body\n' >&2
    cat "$readiness_body" >&2 || true
    printf '\n[v3-s14-browser-runtime] app smoke body\n' >&2
    cat "$app_body" >&2 || true
    printf '\n[v3-s14-browser-runtime] Playwright collection log\n' >&2
    tail -200 "$playwright_list_log" >&2 || true
    return "$status"
  fi

  log "S14_BROWSER_RUNTIME_READY stage=$run_stage base_url=$base_url"
}
