begin;

-- System V3 / S14 Stage 7 compatibility repair.
--
-- The governed submit_vote_checked RPC already owns Televote round lifecycle
-- validation (including requiring status = open). This write-boundary trigger
-- exists for one narrower reason: a configured closes_at must remain
-- authoritative even if a future/internal write path reaches vote_submissions
-- without first consulting a browser timer.
--
-- Do not duplicate the round-status state machine here. Legacy/internal
-- invariant fixtures and historical maintenance can legitimately create a
-- non-historical canonical row outside the public submit RPC, while legacy
-- rounds with closes_at IS NULL are explicitly unbounded during the Stage 7
-- compatibility window. A configured deadline, however, is always enforced by
-- database server time at the final ballot-row boundary.
create or replace function private.v3_enforce_televote_submission_deadline()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $deadline$
declare
  v_deadline timestamptz;
begin
  if coalesce(new.is_historical, false) then
    return new;
  end if;

  select round_row.closes_at
  into v_deadline
  from televoting.rounds round_row
  where round_row.id = new.round_id
  for share;

  if not found then
    raise exception 'Voting round not found' using errcode = '23503';
  end if;

  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Voting deadline has passed' using errcode = '22023';
  end if;

  return new;
end
$deadline$;

revoke all on function private.v3_enforce_televote_submission_deadline()
  from public, anon, authenticated;

commit;
