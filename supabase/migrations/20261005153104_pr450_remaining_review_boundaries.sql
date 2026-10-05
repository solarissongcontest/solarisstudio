begin;

-- Confirmations is a canonical projection. Delegation management does not
-- confer permission to destroy the canonical edition and its cascaded data.
create or replace function public.admin_confirmation_delete_edition(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null
     or public.studio2_access_allowed('edition.manage', _id, true) is not true then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;
  if exists (select 1 from public.shows where edition_id = _id)
     or exists (select 1 from public.participants where edition_id = _id) then
    raise exception 'This is a canonical contest edition. Delete it from Organizer edition management, not Confirmations.' using errcode = '22023';
  end if;
  delete from public.editions where id = _id;
  return found;
end;
$$;
revoke all on function public.admin_confirmation_delete_edition(uuid) from public, anon;
grant execute on function public.admin_confirmation_delete_edition(uuid) to authenticated;

-- Production had this legacy table out of band; clean replay must expose the
-- same Organizer reminder contract. Grants only open the API door; RLS remains
-- the row-level authorization boundary.
create table if not exists public.admin_deadlines (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  show_id uuid references public.shows(id) on delete cascade,
  kind text not null default 'reminder',
  label text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.admin_deadlines enable row level security;
drop policy if exists "Organizers manage deadlines" on public.admin_deadlines;
create policy "Organizers manage deadlines" on public.admin_deadlines
for all to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, true)
  and (show_id is null or private.studio2_show_access_allowed('edition.manage', show_id, true)))
with check (public.studio2_access_allowed('edition.manage', edition_id, true)
  and (show_id is null or private.studio2_show_access_allowed('edition.manage', show_id, true)));
grant select, insert, update, delete on public.admin_deadlines to authenticated;
-- These canonical tables already have RLS policies but lacked explicit Data
-- API grants on clean installs. Avoid privileged writes through these grants.
grant select on public.submission_rounds, public.jury_voting_windows to authenticated;
grant select, update on public.admin_notifications to authenticated;

notify pgrst, 'reload schema';
commit;
