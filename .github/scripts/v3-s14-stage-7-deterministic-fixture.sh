#!/usr/bin/env bash
set -euo pipefail

# The persistent S14 contest intentionally reuses one local database state from
# setup through publication. That makes stale lifecycle timestamps a legitimate
# fixture hazard: Stage 7 deliberately rewinds its seeded Televote rounds to
# draft before exercising the governed open/deadline path, while the canonical
# status operation preserves existing opened_at/closed_at values outside the
# transition it owns.
#
# Reset only the two synthetic semifinal rounds, immediately before their first
# governed open. This is test-fixture preparation, not a second production write
# path. The canonical deadline adapter sourced immediately before this file then
# performs the real deadline set, versioning, receipt, DomainEvent and open
# operation that S14 is supposed to certify.

eval "$(declare -f apply_televote_round_status | sed '1s/apply_televote_round_status/apply_televote_round_status_with_governed_deadline/')"

s14_stage7_is_semifinal_fixture_round() {
  local round_id="$1"
  [[ "$round_id" == "$TV_ROUND_ID" ]] || \
    [[ -n "${TV_ROUND_TWO_ID:-}" && "$round_id" == "$TV_ROUND_TWO_ID" ]]
}

s14_stage7_reset_fixture_lifecycle_before_open() {
  local round_id="$1"

  s14_stage7_is_semifinal_fixture_round "$round_id" || return 0

  db_exec "
update televoting.rounds
set status='draft',
    opens_at=null,
    closes_at=null,
    closed_at=null,
    updated_at=clock_timestamp()
where id='$round_id'::uuid;
"

  [[ "$(db_scalar "
select count(*)
from televoting.rounds
where id='$round_id'::uuid
  and status='draft'
  and opens_at is null
  and closes_at is null
  and closed_at is null;
")" == "1" ]] || fail "S14 Stage 7 could not establish a deterministic lifecycle baseline for $round_id"

  log "S14_STAGE7_FIXTURE_BASELINE round=$round_id status=draft timestamps=clear"
}

apply_televote_round_status() {
  local round_id="$1" status="$2"

  if [[ "$status" == "open" ]]; then
    s14_stage7_reset_fixture_lifecycle_before_open "$round_id"
  fi

  # This captured function is the genuine-deadline adapter. Because the fixture
  # reset happens first, its preview must exercise action=set and establish a
  # fresh short server deadline before the governed status transition to open.
  apply_televote_round_status_with_governed_deadline "$@"
}
