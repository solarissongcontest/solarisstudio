#!/usr/bin/env bash
set -euo pipefail

# Run in the intended disposable project's worktree. Never select another
# project, use linked commands, or clean unrelated Docker containers/volumes.
[[ $# == 0 && -f supabase/config.toml ]] || {
  echo '::error::Run local Supabase bootstrap from its disposable project worktree' >&2
  exit 1
}

for attempt in 1 2; do
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
