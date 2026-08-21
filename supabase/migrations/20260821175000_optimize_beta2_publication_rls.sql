-- Beta 2 performance follow-up.
-- Cache auth.uid() once per statement inside the restrictive participant RLS
-- policy, and index the national-final child lookup used by history + Pulse.

drop policy if exists "participants unreleased entry protection" on public.participants;

create policy "participants unreleased entry protection"
on public.participants
as restrictive
for select
to public
using (
  publication_status = 'published'
  or public.has_role((select auth.uid()), 'organizer')
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

create index if not exists national_final_entries_national_final_id_idx
  on public.national_final_entries (national_final_id)
  where coalesce(removed, false) = false;
