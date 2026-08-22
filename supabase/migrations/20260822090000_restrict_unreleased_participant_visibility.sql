drop policy if exists "participants unreleased entry protection" on public.participants;

create policy "participants unreleased entry protection"
on public.participants
as restrictive
for select
to public
using (
  publication_status = 'published'
  or (
    publication_status = 'scheduled'
    and scheduled_publish_at is not null
    and scheduled_publish_at <= now()
  )
  or has_role((select auth.uid()), 'organizer'::app_role)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);
