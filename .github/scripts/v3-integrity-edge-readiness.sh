#!/usr/bin/env bash
# Sourced by the isolated hostile rehearsal. request sets HTTP_STATUS/HTTP_BODY.
wait_for_integrity_edge() {
  local runtime_pid="$1" api_url="$2" anon_key="$3" runtime_log="$4"
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$runtime_pid" 2>/dev/null; then
      tail -n 200 "$runtime_log" >&2 || true
      printf '%s\n' 'Evidence Edge runtime exited before readiness' >&2
      return 1
    fi
    REQUEST_TIMEOUT=5 request POST "$api_url/functions/v1/integrity-evidence-download" "$anon_key" "$anon_key" '{}'
    # The real protected handler rejects the anonymous probe. A gateway 404 or
    # crashed worker is not evidence that the application has become ready.
    if [[ "$HTTP_STATUS" == "401" ]] && [[ "$HTTP_BODY" == *'Your session has expired.'* ]]; then
      return 0
    fi
    sleep 1
  done
  tail -n 200 "$runtime_log" >&2 || true
  return 1
}
