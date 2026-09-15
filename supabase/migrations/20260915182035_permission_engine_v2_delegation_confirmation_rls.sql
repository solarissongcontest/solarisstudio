begin;

-- Permission Engine v2 cutover batch 2.
--
-- Preserve country-owner/self access exactly as it exists today while replacing
-- the legacy Organizer side of delegation and direct-edition confirmation
-- policies with the cutover-aware capability predicate introduced in batch 1.
--
-- Before authoritative cutover, Organizer writes remain strict dual checks.
-- After global cutover, the capability decision becomes authoritative.

-- DELEGATION / COUNTRY -------------------------------------------------------

drop policy if exists "countries organizer write" on public.countries;
create policy "countries capability write"
on public.countries
for all
to authenticated
using (public.studio2_access_allowed('delegation.manage', null, true))
with check (public.studio2_access_allowed('delegation.manage', null, true));

drop policy if exists "country accounts organizer manage" on public.country_accounts;
create policy "country accounts capability manage"
on public.country_accounts
for all
to authenticated
using (public.studio2_access_allowed('delegation.manage', null, true))
with check (public.studio2_access_allowed('delegation.manage', null, true));

drop policy if exists "owners can read own historical identities" on public.country_edition_identities;
create policy "owners or capability read historical identities"
on public.country_edition_identities
for select
to authenticated
using (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.read', edition_id, false)
);

drop policy if exists "country hod claims own read" on public.country_hod_edition_claims;
create policy "country hod claims self or capability read"
on public.country_hod_edition_claims
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.studio2_access_allowed('delegation.read', edition_id, false)
);

drop policy if exists "country hod claims own write" on public.country_hod_edition_claims;
create policy "country hod claims self or capability write"
on public.country_hod_edition_claims
for all
to authenticated
using (
  user_id = (select auth.uid())
  or public.studio2_access_allowed('delegation.manage', edition_id, true)
)
with check (
  user_id = (select auth.uid())
  or public.studio2_access_allowed('delegation.manage', edition_id, true)
);

drop policy if exists "country media owner write" on public.country_media;
create policy "country media owner or capability write"
on public.country_media
for all
to authenticated
using (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
)
with check (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

drop policy if exists "country sections owner write" on public.country_profile_sections;
create policy "country sections owner or capability write"
on public.country_profile_sections
for all
to authenticated
using (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
)
with check (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

drop policy if exists "country profiles owner write" on public.country_profiles;
create policy "country profiles owner or capability write"
on public.country_profiles
for all
to authenticated
using (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
)
with check (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

drop policy if exists "country themes owner write" on public.country_themes;
create policy "country themes owner or capability write"
on public.country_themes
for all
to authenticated
using (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
)
with check (
  public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

-- CONFIRMATIONS / DIRECT EDITION TABLES -------------------------------------
--
-- Only tables that carry edition_id directly are migrated in this batch. Child
-- tables that must resolve scope through a parent submission/national-final row
-- are deliberately left for the next batch so their join-based predicates can be
-- rehearsed independently.

drop policy if exists "next_in_line_responses_organizer_all" on public.next_in_line_responses;
create policy "next in line responses capability manage"
on public.next_in_line_responses
for all
to authenticated
using (public.studio2_access_allowed('confirmation.manage', edition_id, true))
with check (public.studio2_access_allowed('confirmation.manage', edition_id, true));

drop policy if exists "next_in_line_submissions_organizer_all" on public.next_in_line_submissions;
create policy "next in line submissions capability manage"
on public.next_in_line_submissions
for all
to authenticated
using (public.studio2_access_allowed('confirmation.manage', edition_id, true))
with check (public.studio2_access_allowed('confirmation.manage', edition_id, true));

drop policy if exists "submission_rounds_organizer_all" on public.submission_rounds;
create policy "submission rounds capability manage"
on public.submission_rounds
for all
to authenticated
using (public.studio2_access_allowed('confirmation.manage', edition_id, true))
with check (public.studio2_access_allowed('confirmation.manage', edition_id, true));

drop policy if exists "submissions_organizer_all" on public.submissions;
create policy "submissions capability manage"
on public.submissions
for all
to authenticated
using (public.studio2_access_allowed('confirmation.manage', edition_id, true))
with check (public.studio2_access_allowed('confirmation.manage', edition_id, true));

notify pgrst, 'reload schema';

commit;
