#!/usr/bin/env bash
set -euo pipefail

# QA-only failure evidence for the persistent Stage 7 fixture. This wrapper does
# not mutate canonical contest state beyond delegating to the existing fixture
# reset. It records a small, non-secret local snapshot so an exact-head failure
# can distinguish fixture drift from governed status/deadline failures.

s14_stage7_persist_round_open_diagnostic() {
  local round_id="$1" phase="$2"
  local evidence_dir="${V3_RELEASE_EVIDENCE_DIR:-v3-release-evidence}"
  local evidence_path="$evidence_dir/stage7-round-open-diagnostics.json"
  local target_snapshot open_rounds global_version

  mkdir -p "$evidence_dir"

  target_snapshot="$(db_scalar "
select coalesce((
  select jsonb_build_object(
    'roundId', r.id,
    'editionId', r.edition_id,
    'status', r.status,
    'openedAt', r.opened_at,
    'closesAt', r.closes_at,
    'closedAt', r.closed_at,
    'resultsStatus', r.results_status,
    'calculationVersion', r.calculation_version,
    'entryCount', (select count(*) from televoting.round_entries e where e.round_id=r.id),
    'roundVersion', coalesce(v.version,0)
  )::text
  from televoting.rounds r
  left join public.studio2_televote_round_versions v on v.round_id=r.id
  where r.id='$round_id'::uuid
), 'null');
" 2>/dev/null || printf 'null')"

  open_rounds="$(db_scalar "
select coalesce(jsonb_agg(jsonb_build_object(
  'roundId', r.id,
  'editionId', r.edition_id,
  'status', r.status
) order by r.id), '[]'::jsonb)::text
from televoting.rounds r
where r.status='open';
" 2>/dev/null || printf '[]')"

  global_version="$(db_scalar "
select coalesce((select version from public.studio2_televote_global_versions where singleton=true),0)::text;
" 2>/dev/null || printf '0')"

  STAGE7_OPEN_PHASE="$phase" \
  STAGE7_OPEN_ROUND_ID="$round_id" \
  STAGE7_OPEN_TARGET="$target_snapshot" \
  STAGE7_OPEN_ROUNDS="$open_rounds" \
  STAGE7_OPEN_GLOBAL_VERSION="$global_version" \
  STAGE7_OPEN_EVIDENCE_PATH="$evidence_path" \
  python3 <<'PY' || {
import json
import os
from pathlib import Path


def load_json(name, fallback):
    try:
        return json.loads(os.environ.get(name, ""))
    except Exception:
        return fallback

try:
    global_version = int(os.environ.get("STAGE7_OPEN_GLOBAL_VERSION", "0"))
except ValueError:
    global_version = None

payload = {
    "phase": os.environ.get("STAGE7_OPEN_PHASE"),
    "roundId": os.environ.get("STAGE7_OPEN_ROUND_ID"),
    "targetRound": load_json("STAGE7_OPEN_TARGET", None),
    "openRounds": load_json("STAGE7_OPEN_ROUNDS", []),
    "globalVersion": global_version,
}

Path(os.environ["STAGE7_OPEN_EVIDENCE_PATH"]).write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY
    log "S14 Stage 7 round-open diagnostic serialization failed; continuing canonical rehearsal"
    return 0
  }

  log "S14_STAGE7_ROUND_OPEN_EVIDENCE phase=$phase round=$round_id path=$evidence_path"
}

eval "$(declare -f s14_stage7_reset_fixture_lifecycle_before_open | sed '1s/s14_stage7_reset_fixture_lifecycle_before_open/s14_stage7_reset_fixture_lifecycle_before_open_without_open_diagnostics/')"

s14_stage7_reset_fixture_lifecycle_before_open() {
  local round_id="$1"

  CURRENT_STAGE="stage-7-public-voting:fixture-reset:$round_id"
  s14_stage7_persist_round_open_diagnostic "$round_id" "before-fixture-reset"
  s14_stage7_reset_fixture_lifecycle_before_open_without_open_diagnostics "$@"
  s14_stage7_persist_round_open_diagnostic "$round_id" "after-fixture-reset"
}
