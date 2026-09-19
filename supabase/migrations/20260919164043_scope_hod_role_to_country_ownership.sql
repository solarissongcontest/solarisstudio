delete from public.studio2_role_capabilities
where role_key = 'hod'
  and capability in (
    'delegation.read',
    'confirmation.read',
    'confirmation.manage',
    'entry.read_private',
    'entry.edit'
  );

drop policy if exists "entries country owner read" on public.entries;
create policy "entries country owner read"
on public.entries
for select
to authenticated
using (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "entries country owner insert" on public.entries;
create policy "entries country owner insert"
on public.entries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "entries country owner update" on public.entries;
create policy "entries country owner update"
on public.entries
for update
to authenticated
using (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
)
with check (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "entries country owner delete" on public.entries;
create policy "entries country owner delete"
on public.entries
for delete
to authenticated
using (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = entries.country_id
  )
);

drop policy if exists "participants country owner insert" on public.participants;
create policy "participants country owner insert"
on public.participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

drop policy if exists "participants country owner update" on public.participants;
create policy "participants country owner update"
on public.participants
for update
to authenticated
using (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
)
with check (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

drop policy if exists "participants country owner delete" on public.participants;
create policy "participants country owner delete"
on public.participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = (select auth.uid())
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

notify pgrst, 'reload schema';
