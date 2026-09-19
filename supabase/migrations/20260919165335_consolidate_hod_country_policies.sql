drop policy if exists "entries country owner read" on public.entries;
drop policy if exists "entries country owner insert" on public.entries;
drop policy if exists "entries country owner update" on public.entries;
drop policy if exists "entries country owner delete" on public.entries;

drop policy if exists "entries capability write insert" on public.entries;
create policy "entries capability write insert"
on public.entries
for insert
to authenticated
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "entries capability write update" on public.entries;
create policy "entries capability write update"
on public.entries
for update
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
)
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "entries capability write delete" on public.entries;
create policy "entries capability write delete"
on public.entries
for delete
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "solaris consolidated authenticated read" on public.entries;
create policy "solaris consolidated authenticated read"
on public.entries
for select
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.editions e
    where e.id = entries.edition_id
      and (
        e.published = true
        or public.studio2_access_allowed('entry.read_private', entries.edition_id, false)
      )
  )
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "participants country owner insert" on public.participants;
drop policy if exists "participants country owner update" on public.participants;
drop policy if exists "participants country owner delete" on public.participants;

drop policy if exists "participants capability write insert" on public.participants;
create policy "participants capability write insert"
on public.participants
for insert
to authenticated
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

drop policy if exists "participants capability write update" on public.participants;
create policy "participants capability write update"
on public.participants
for update
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
)
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

drop policy if exists "participants capability write delete" on public.participants;
create policy "participants capability write delete"
on public.participants
for delete
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

notify pgrst, 'reload schema';
