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
  or public.has_role((select auth.uid()), 'organizer')
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

create or replace function public.protect_confirmation_synced_entry_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.show_id is null
     and new.notes = 'Synced from Confirmations'
     and coalesce(new.publication_source, 'legacy') = 'legacy'
     and coalesce(new.publication_overridden, false) = false then
    new.publication_status := 'draft';
    new.scheduled_publish_at := null;
    new.published_at := null;
    new.publication_source := 'confirmation';
    new.publication_overridden := false;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_confirmation_synced_entry_default() from public, anon, authenticated;

drop trigger if exists participants_protect_confirmation_synced_entry_default on public.participants;
create trigger participants_protect_confirmation_synced_entry_default
before insert on public.participants
for each row
execute function public.protect_confirmation_synced_entry_default();
