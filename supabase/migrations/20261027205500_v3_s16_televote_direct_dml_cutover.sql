begin;

select public.v3_register_migration_contract(
  'v3.televote.direct-dml-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 revokes browser/service-role DML where Televote callers have been cut over to governed commands while retaining the frozen Results binding writer explicitly'
);

-- Integrity Organizer wrappers are the user-facing authority. The underlying
-- Televote mutation helpers are owner-only implementations, not service-role
-- APIs with caller-supplied organizer identifiers.
alter function televoting.record_integrity_decision(uuid, text, text, text, uuid)
  security definer;
alter function televoting.record_integrity_decision(uuid, text, text, text, uuid)
  set search_path = pg_catalog, televoting, pg_temp;
revoke all on function televoting.record_integrity_decision(uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;

alter function televoting.exclude_integrity_ballot(uuid, text, uuid)
  security definer;
alter function televoting.exclude_integrity_ballot(uuid, text, uuid)
  set search_path = pg_catalog, televoting, pg_temp;
revoke all on function televoting.exclude_integrity_ballot(uuid, text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function televoting.organizer_record_integrity_decision(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function televoting.organizer_record_integrity_decision(uuid, text, text, text)
  to authenticated;
revoke all on function televoting.organizer_exclude_integrity_ballot(uuid, text)
  from public, anon, service_role;
grant execute on function televoting.organizer_exclude_integrity_ballot(uuid, text)
  to authenticated;

-- These functions are trigger-only derived writers. Make their authority
-- explicit and owner-scoped rather than leaving them executable by PUBLIC.
alter function televoting.flag_aggregation_outdated()
  security definer;
alter function televoting.flag_aggregation_outdated()
  set search_path = pg_catalog, televoting, pg_temp;
revoke all on function televoting.flag_aggregation_outdated()
  from public, anon, authenticated, service_role;

alter function televoting.flag_round_results_outdated()
  security definer;
alter function televoting.flag_round_results_outdated()
  set search_path = pg_catalog, televoting, pg_temp;
revoke all on function televoting.flag_round_results_outdated()
  from public, anon, authenticated, service_role;

alter function televoting.round_entries_sync_countries()
  security definer;
alter function televoting.round_entries_sync_countries()
  set search_path = pg_catalog, televoting, pg_temp;
revoke all on function televoting.round_entries_sync_countries()
  from public, anon, authenticated, service_role;

-- Canonical ballot and lineup mutations are RPC-only after the S16 cutovers.
revoke insert, update, delete, truncate
  on table televoting.vote_submissions
  from anon, authenticated, service_role;
revoke insert, update, delete, truncate
  on table televoting.vote_entries
  from anon, authenticated, service_role;
revoke insert, update, delete, truncate
  on table televoting.round_entries
  from anon, authenticated, service_role;

-- round_countries is a derived compatibility mirror maintained by the
-- round_entries trigger. It has no production runtime reader under src/** and
-- is not an independent canonical membership store.
revoke insert, update, delete, truncate
  on table televoting.round_countries
  from anon, authenticated, service_role;

-- Aggregate show totals are now written by the versioned Televote aggregate
-- command or the published-source projection, both SECURITY DEFINER.
revoke insert, update, delete, truncate
  on table public.televote_votes
  from anon, authenticated, service_role;

-- Config-side binding writes are governed. service_role intentionally remains
-- temporarily writable because PR #1400's frozen Results writer still updates
-- frozen_at; S16 must continue reporting that remaining Results-owned authority.
revoke insert, update, delete, truncate
  on table public.televoting_round_bindings
  from anon, authenticated;

-- Replace permissive Organizer FOR ALL policies with read-only policies on the
-- critical remote tables whose mutations are now command-only.
drop policy if exists "televoting organizer full access" on televoting.vote_submissions;
create policy "televoting organizer ballot read"
on televoting.vote_submissions for select to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.vote_entries;
create policy "televoting organizer ballot entry read"
on televoting.vote_entries for select to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.round_entries;
create policy "televoting organizer round entry read"
on televoting.round_entries for select to authenticated
using (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.round_countries;
create policy "televoting organizer round country read"
on televoting.round_countries for select to authenticated
using (public.studio2_access_allowed('voting.manage', null, false));

-- Keep public published reads and add a separate Organizer read policy after
-- removing the old mutation-capable policy.
drop policy if exists "televote organizer write" on public.televote_votes;
drop policy if exists "televote capability write" on public.televote_votes;
drop policy if exists "televote capability read" on public.televote_votes;
create policy "televote capability read"
on public.televote_votes for select to authenticated
using (public.studio2_access_allowed('voting.manage', edition_id, false));

notify pgrst, 'reload schema';
commit;
