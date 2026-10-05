begin;

-- Forensic hardening: delegation ownership must never imply arbitrary row writes.
--
-- Country accounts already have narrow SECURITY DEFINER RPCs for the data they
-- are allowed to manage (entry details, listening links, publication settings,
-- Confirmations, etc.). The previous RLS policies also allowed an owning
-- country account to INSERT/UPDATE/DELETE the entire canonical entries and
-- participants rows. Because PostgreSQL RLS is row-based rather than
-- column-based, that exposed organizer-owned fields such as running_order,
-- qualified, show_id, participation_status, source and publication overrides.
--
-- Keep direct table writes available only to callers holding the authoritative
-- entry.edit capability. Service-role and the narrow owned-country RPCs retain
-- their intended server-side access.

drop policy if exists "entries capability write insert" on public.entries;
drop policy if exists "entries capability write update" on public.entries;
drop policy if exists "entries capability write delete" on public.entries;

create policy "entries capability write insert"
on public.entries
for insert
to authenticated
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

create policy "entries capability write update"
on public.entries
for update
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
)
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

create policy "entries capability write delete"
on public.entries
for delete
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

drop policy if exists "participants capability write insert" on public.participants;
drop policy if exists "participants capability write update" on public.participants;
drop policy if exists "participants capability write delete" on public.participants;

create policy "participants capability write insert"
on public.participants
for insert
to authenticated
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

create policy "participants capability write update"
on public.participants
for update
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
)
with check (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

create policy "participants capability write delete"
on public.participants
for delete
to authenticated
using (
  public.studio2_access_allowed('entry.edit', edition_id, true)
);

notify pgrst, 'reload schema';

commit;
