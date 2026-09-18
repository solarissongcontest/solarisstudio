begin;

-- Permission Engine v2 cutover batch 23.
--
-- The local `televoting` schema uses its own edition UUID namespace. Live
-- verification shows those UUIDs do not match canonical public.editions IDs,
-- and there are currently no public.televoting_round_bindings rows that could
-- safely translate every raw row to a canonical edition scope. Do not pretend
-- these tables are scope-aware: retain their historical Organizer-only
-- population with global manage capabilities.
--
-- Raw ballot / moderation data requires televote.ballots.manage. The remaining
-- configuration, aggregation, result and audit surfaces require voting.manage.

-- General televoting administration / configuration / result surfaces.
drop policy if exists "televoting organizer full access" on televoting.admin_audit_log;
create policy "televoting organizer full access"
on televoting.admin_audit_log for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.combined_televote_component_results;
create policy "televoting organizer full access"
on televoting.combined_televote_component_results for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.combined_televote_results;
create policy "televoting organizer full access"
on televoting.combined_televote_results for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.countries;
create policy "televoting organizer full access"
on televoting.countries for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.editions;
create policy "televoting organizer full access"
on televoting.editions for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.external_score_entries;
create policy "televoting organizer full access"
on televoting.external_score_entries for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.external_score_entry_log;
create policy "televoting organizer full access"
on televoting.external_score_entry_log for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.round_countries;
create policy "televoting organizer full access"
on televoting.round_countries for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.round_entries;
create policy "televoting organizer full access"
on televoting.round_entries for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.round_results;
create policy "televoting organizer full access"
on televoting.round_results for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.rounds;
create policy "televoting organizer full access"
on televoting.rounds for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.televote_aggregation_participants;
create policy "televoting organizer full access"
on televoting.televote_aggregation_participants for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.televote_aggregation_sources;
create policy "televoting organizer full access"
on televoting.televote_aggregation_sources for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.televote_aggregations;
create policy "televoting organizer full access"
on televoting.televote_aggregations for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

-- Raw ballots, abuse signals and moderation events remain the narrower ballot
-- management domain rather than generic voting administration.
drop policy if exists "televoting organizer full access" on televoting.anti_abuse_events;
create policy "televoting organizer full access"
on televoting.anti_abuse_events for all to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false))
with check (public.studio2_access_allowed('televote.ballots.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.vote_entries;
create policy "televoting organizer full access"
on televoting.vote_entries for all to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false))
with check (public.studio2_access_allowed('televote.ballots.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.vote_moderation_events;
create policy "televoting organizer full access"
on televoting.vote_moderation_events for all to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false))
with check (public.studio2_access_allowed('televote.ballots.manage', null, false));

drop policy if exists "televoting organizer full access" on televoting.vote_submissions;
create policy "televoting organizer full access"
on televoting.vote_submissions for all to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', null, false))
with check (public.studio2_access_allowed('televote.ballots.manage', null, false));

-- This batch is the final legacy-role RLS policy batch. Fail if any direct
-- has_role policy predicate survives in any application schema.
do $verify$
declare
  v_televoting_remaining bigint;
  v_total_remaining bigint;
begin
  select count(*) into v_televoting_remaining
  from pg_policies
  where schemaname = 'televoting'
    and (
      coalesce(qual, '') ilike '%has_role%'
      or coalesce(with_check, '') ilike '%has_role%'
    );

  if v_televoting_remaining <> 0 then
    raise exception 'televoting legacy role policy debt remains after Batch 23: %', v_televoting_remaining;
  end if;

  select count(*) into v_total_remaining
  from pg_policies
  where schemaname in ('public', 'storage', 'televoting')
    and (
      coalesce(qual, '') ilike '%has_role%'
      or coalesce(with_check, '') ilike '%has_role%'
    );

  if v_total_remaining <> 0 then
    raise exception 'legacy role policy debt remains after final RLS cutover: %', v_total_remaining;
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
