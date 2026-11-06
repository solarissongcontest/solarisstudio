#!/usr/bin/env bash
set -euo pipefail

# Run in the intended disposable project's worktree. Never select another
# project, use linked commands, or clean unrelated Docker containers/volumes.
[[ $# == 0 && -f supabase/config.toml ]] || {
  echo '::error::Run local Supabase bootstrap from its disposable project worktree' >&2
  exit 1
}

for attempt in 1 2; do
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    [[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ && "${GITHUB_JOB:-}" =~ ^[A-Za-z0-9_-]+$ ]] || {
      echo '::error::Missing disposable CI stack identity; refusing shared default ports' >&2
      exit 1
    }
    # A retry follows successful cleanup of this exact project below. Select
    # fresh free ports rather than stopping a different job's listener.
    job_namespace="${GITHUB_JOB//_/-}"
    job_namespace="${job_namespace,,}"
    python3 "$(dirname "${BASH_SOURCE[0]}")/prepare-archive-local-config.py" \
      supabase/config.toml "archive-v3-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${job_namespace}"
  fi
  if supabase start; then
    exit 0
  fi
  echo "Local Supabase startup attempt $attempt failed; stopping this project's partial stack" >&2
  if ! supabase stop --no-backup; then
    echo '::error::Partial local stack cleanup failed; refusing another startup' >&2
    exit 1
  fi
  if [[ "$attempt" == 1 ]]; then
    sleep 8
  fi
done

echo '::error::Disposable local Supabase failed twice; no hosted fallback' >&2
exit 1
