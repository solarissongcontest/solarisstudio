begin;

-- Existing Solaris flows can legitimately open older Televote rounds whose
-- closes_at is NULL. There is no canonical default duration to backfill. Keep
-- NULL as the explicit legacy-unbounded state; once a deadline is configured,
-- the canonical ballot write guard enforces it with server time.
--
-- Stage 7 certification exercises the governed set -> expiry -> extend path.
-- A later product cutover may make deadline configuration mandatory only after
-- every caller owns an explicit duration/deadline contract.

drop trigger if exists v3_require_televote_deadline_on_open
  on televoting.rounds;

drop function if exists private.v3_require_televote_deadline_on_open();

commit;
