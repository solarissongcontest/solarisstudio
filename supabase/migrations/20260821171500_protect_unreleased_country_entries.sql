-- Unreleased country-owned entries must not leak through direct participant
-- queries. Existing publication policies still decide whether a show/edition is
-- public; this restrictive policy adds the per-entry reveal gate on top.

drop policy if exists "participants unreleased entry protection" on public.participants;

create policy "participants unreleased entry protection"
on public.participants
as restrictive
for select
to public
using (
  publication_status = 'published'
  or public.has_role(auth.uid(), 'organizer')
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = auth.uid()
      and ca.status = 'active'
      and (
        ca.country_id = participants.country_id
        or exists (
          select 1
          from public.contest_entities ce
          where ce.id = participants.contest_entity_id
            and ce.country_id = ca.country_id
        )
      )
  )
);
