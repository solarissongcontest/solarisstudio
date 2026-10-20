#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '[v3-migration-delta] FAIL: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[v3-migration-delta] %s\n' "$*"
}

SOURCE_ROOT="${1:-}"
TARGET_ROOT="${2:-}"
BASE_REF="${3:-origin/main}"

[[ -n "$SOURCE_ROOT" ]] || fail "source repository root is required"
[[ -n "$TARGET_ROOT" ]] || fail "target current-main worktree root is required"
[[ -d "$SOURCE_ROOT/.git" || -f "$SOURCE_ROOT/.git" ]] || fail "source root is not a git worktree: $SOURCE_ROOT"
[[ -d "$TARGET_ROOT/supabase/migrations" ]] || fail "target migration directory is missing: $TARGET_ROOT/supabase/migrations"

git -C "$SOURCE_ROOT" rev-parse --verify "$BASE_REF^{commit}" >/dev/null \
  || fail "base ref is unavailable: $BASE_REF"

mapfile -t deleted_migrations < <(
  git -C "$SOURCE_ROOT" diff --name-only --diff-filter=D "$BASE_REF"...HEAD -- 'supabase/migrations/*.sql'
)
if (( ${#deleted_migrations[@]} > 0 )); then
  printf '%s\n' "${deleted_migrations[@]}" >&2
  fail "feature branch deletes migration files; upgrade rehearsal refuses destructive migration history"
fi

mapfile -t changed_migrations < <(
  git -C "$SOURCE_ROOT" diff --name-only --diff-filter=AM "$BASE_REF"...HEAD -- 'supabase/migrations/*.sql'
)

if (( ${#changed_migrations[@]} == 0 )); then
  log "no migration delta relative to $BASE_REF"
  exit 0
fi

copied=0
reused=0
for relative_path in "${changed_migrations[@]}"; do
  case "$relative_path" in
    supabase/migrations/*.sql) ;;
    *) fail "unexpected migration path: $relative_path" ;;
  esac

  source_path="$SOURCE_ROOT/$relative_path"
  target_path="$TARGET_ROOT/$relative_path"
  [[ -f "$source_path" ]] || fail "changed migration is missing from source branch: $relative_path"

  if [[ -e "$target_path" ]]; then
    cmp -s "$source_path" "$target_path" \
      || fail "current main already contains conflicting migration content: $relative_path"
    reused=$((reused + 1))
    log "preserved identical current-main migration: $relative_path"
    continue
  fi

  install -m 0644 "$source_path" "$target_path"
  copied=$((copied + 1))
  log "copied additive migration delta: $relative_path"
done

log "migration delta ready: copied=$copied identical=$reused; current-main migrations were never deleted"
