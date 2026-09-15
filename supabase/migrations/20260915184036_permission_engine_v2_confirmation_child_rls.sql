begin;

-- Permission Engine v2 cutover batch 3.
--
-- These confirmation tables do not all carry edition_id directly. Resolve the
-- edition through their canonical parent row and keep the Organizer-side write
-- boundary on strict confirmation.manage before authoritative cutover.
--
-- Country/HOD national-final editing RPCs are intentionally not changed here;
-- they are SECURITY DEFINER surfaces and are migrated in a separate batch.

-- NATIONAL FINALS -----------------------------------------------------------

drop policy if exists "national_finals_organizer_all" on public.national_finals;
create policy "national finals capability manage"
on public.national_finals
for all
to authenticated
using (public.studio2_access_allowed('confirmation.manage', edition_id, true))
with check (public.studio2_access_allowed('confirmation.manage', edition_id, true));

drop policy if exists "national_final_entries_organizer_all" on public.national_final_entries;
create policy "national final entries capability manage"
on public.national_final_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.national_finals nf
    where nf.id = national_final_id
      and public.studio2_access_allowed('confirmation.manage', nf.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.national_finals nf
    where nf.id = national_final_id
      and public.studio2_access_allowed('confirmation.manage', nf.edition_id, true)
  )
);

-- SUBMISSION CHILD TABLES ---------------------------------------------------

drop policy if exists "submission_browser_sessions_organizer_all" on public.submission_browser_sessions;
create policy "submission browser sessions capability manage"
on public.submission_browser_sessions
for all
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
);

drop policy if exists "submission_ip_history_organizer_all" on public.submission_ip_history;
create policy "submission ip history capability manage"
on public.submission_ip_history
for all
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
);

drop policy if exists "submission_review_history_organizer_all" on public.submission_review_history;
create policy "submission review history capability manage"
on public.submission_review_history
for all
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
);

drop policy if exists "submission_versions_organizer_all" on public.submission_versions;
create policy "submission versions capability manage"
on public.submission_versions
for all
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = submission_id
      and public.studio2_access_allowed('confirmation.manage', s.edition_id, true)
  )
);

drop policy if exists "submission_drafts_organizer_all" on public.submission_drafts;
create policy "submission drafts capability manage"
on public.submission_drafts
for all
to authenticated
using (
  exists (
    select 1
    from public.submission_rounds r
    where r.id = round_id
      and public.studio2_access_allowed('confirmation.manage', r.edition_id, true)
  )
)
with check (
  exists (
    select 1
    from public.submission_rounds r
    where r.id = round_id
      and public.studio2_access_allowed('confirmation.manage', r.edition_id, true)
  )
);

notify pgrst, 'reload schema';

commit;
