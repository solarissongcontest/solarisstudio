begin;

-- Organizer-level lifecycle for whole communications. This is distinct from the
-- existing per-recipient inbox archive flag on studio2_notice_receipts.
alter table public.studio2_official_notices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.studio2_notice_versions
  add column if not exists archived_at timestamptz;

create index if not exists studio2_official_notices_archived_idx
  on public.studio2_official_notices (archived_at desc)
  where archived_at is not null;

create table if not exists private.studio2_notice_deletion_audit (
  notice_id uuid not null,
  edition_id uuid,
  notice_type text not null,
  title text not null,
  prior_status text not null,
  was_published boolean not null,
  display_surfaces text[] not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  deletion_reason text not null
);

revoke all on table private.studio2_notice_deletion_audit from public, anon, authenticated;
grant all on table private.studio2_notice_deletion_audit to service_role;

-- Keep the existing revision system authoritative when an organizer archives or
-- restores a communication.
create or replace function private.studio2_capture_notice_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.studio2_notice_versions (
    notice_id, revision, edition_id, notice_type, title, body, severity,
    audience, audience_group, country_ids, acknowledgement_required,
    display_surfaces, status, scheduled_at, sent_at, archived_at,
    changed_by, changed_at
  ) values (
    old.id, old.revision, old.edition_id, old.notice_type, old.title, old.body, old.severity,
    old.audience, old.audience_group, old.country_ids, old.acknowledgement_required,
    old.display_surfaces, old.status, old.scheduled_at, old.sent_at, old.archived_at,
    auth.uid(), now()
  )
  on conflict (notice_id, revision) do nothing;

  new.revision := old.revision + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

create or replace function public.studio2_archive_communication(
  p_notice_id uuid,
  p_reason text default null
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
  for update;

  if not found then
    raise exception 'Communication not found: %', p_notice_id using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);

  if v_notice.archived_at is not null then
    return v_notice;
  end if;

  update public.studio2_official_notices
  set archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      -- Archiving a scheduled message also cancels its future automatic send.
      status = case when status = 'scheduled' then 'draft' else status end,
      scheduled_at = case when status = 'scheduled' then null else scheduled_at end
  where id = p_notice_id
  returning * into v_notice;

  return v_notice;
end
$$;

create or replace function public.studio2_restore_communication(p_notice_id uuid)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
  for update;

  if not found then
    raise exception 'Communication not found: %', p_notice_id using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);

  if v_notice.archived_at is null then
    return v_notice;
  end if;

  update public.studio2_official_notices
  set archived_at = null,
      archived_by = null,
      archive_reason = null
  where id = p_notice_id
  returning * into v_notice;

  return v_notice;
end
$$;

create or replace function public.studio2_delete_communication(
  p_notice_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
  for update;

  if not found then
    raise exception 'Communication not found: %', p_notice_id using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);

  if v_reason is null then
    raise exception 'A deletion reason is required' using errcode = '22023';
  end if;

  if v_notice.sent_at is not null and v_notice.archived_at is null then
    raise exception 'Archive a published communication before deleting it permanently' using errcode = '23514';
  end if;

  insert into private.studio2_notice_deletion_audit (
    notice_id, edition_id, notice_type, title, prior_status, was_published,
    display_surfaces, deleted_by, deletion_reason
  ) values (
    v_notice.id, v_notice.edition_id, v_notice.notice_type, v_notice.title,
    v_notice.status, v_notice.sent_at is not null, v_notice.display_surfaces,
    auth.uid(), v_reason
  );

  delete from public.studio2_official_notices where id = p_notice_id;
  return true;
end
$$;

revoke all on function public.studio2_archive_communication(uuid, text) from public, anon, authenticated;
revoke all on function public.studio2_restore_communication(uuid) from public, anon, authenticated;
revoke all on function public.studio2_delete_communication(uuid, text) from public, anon, authenticated;
grant execute on function public.studio2_archive_communication(uuid, text) to authenticated, service_role;
grant execute on function public.studio2_restore_communication(uuid) to authenticated, service_role;
grant execute on function public.studio2_delete_communication(uuid, text) to authenticated, service_role;

-- Ordinary recipients never see an organizer-archived communication. Organizers
-- and explicitly-capable communications staff can still inspect it.
drop policy if exists studio2_official_notices_read on public.studio2_official_notices;
create policy studio2_official_notices_read
on public.studio2_official_notices
for select
to authenticated
using (
  public.studio2_can_read_notice(
    edition_id, status, sent_at, audience, country_ids, audience_group
  )
  and (
    archived_at is null
    or public.studio2_can_manage_communications(edition_id)
  )
);

create or replace function public.studio2_publish_notice(p_notice_id uuid)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_supersedes uuid;
begin
  select * into v_notice from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.archived_at is not null then
    raise exception 'Restore this communication before publishing it' using errcode = '23514';
  end if;
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be published' using errcode = '23514';
  end if;
  v_supersedes := v_notice.supersedes_id;

  update public.studio2_official_notices
  set status = 'published', sent_at = now(), scheduled_at = null,
      cancelled_at = null, cancelled_by = null, cancellation_reason = null
  where id = p_notice_id
  returning * into v_notice;

  if v_supersedes is not null then
    update public.studio2_official_notices
    set status = 'superseded', superseded_by_id = v_notice.id
    where id = v_supersedes and status = 'published';
  end if;

  perform private.studio2_emit_notice_sent(v_notice);
  return v_notice;
end
$$;

create or replace function public.studio2_schedule_notice(
  p_notice_id uuid,
  p_scheduled_at timestamptz
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.archived_at is not null then
    raise exception 'Restore this communication before scheduling it' using errcode = '23514';
  end if;
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be scheduled' using errcode = '23514';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Scheduled publication time must be in the future' using errcode = '22023';
  end if;

  update public.studio2_official_notices
  set status = 'scheduled', scheduled_at = p_scheduled_at, sent_at = null
  where id = p_notice_id
  returning * into v_notice;
  return v_notice;
end
$$;

create or replace function public.studio2_publish_due_notices()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_count integer := 0;
begin
  for v_notice in
    select * from public.studio2_official_notices
    where status = 'scheduled'
      and archived_at is null
      and scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    update public.studio2_official_notices
    set status = 'published', sent_at = now(), scheduled_at = null
    where id = v_notice.id
    returning * into v_notice;

    if v_notice.supersedes_id is not null then
      update public.studio2_official_notices
      set status = 'superseded', superseded_by_id = v_notice.id
      where id = v_notice.supersedes_id and status = 'published';
    end if;

    perform private.studio2_emit_notice_sent(v_notice);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- Surface projections must stop returning an archived publication immediately.
create or replace function public.studio2_public_home_announcements(p_limit integer default 3)
returns table (
  id uuid,
  edition_id uuid,
  notice_type text,
  title text,
  body text,
  severity text,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id, n.edition_id, n.notice_type, n.title, n.body, n.severity, n.sent_at
  from public.studio2_official_notices n
  where n.status = 'published'
    and n.archived_at is null
    and n.sent_at is not null
    and 'public_home' = any(n.display_surfaces)
    and exists (
      select 1
      from public.studio2_feature_flags f
      where f.key = 'official_communications'
        and f.enabled = true
        and f.admins_only = false
        and cardinality(f.user_ids) = 0
        and cardinality(f.edition_ids) = 0
    )
  order by n.sent_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 10)
$$;

create or replace function public.studio2_mysolaris_home_announcements(p_limit integer default 5)
returns table (
  id uuid,
  edition_id uuid,
  notice_type text,
  title text,
  body text,
  severity text,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id, n.edition_id, n.notice_type, n.title, n.body, n.severity, n.sent_at
  from public.studio2_official_notices n
  where auth.uid() is not null
    and n.status = 'published'
    and n.archived_at is null
    and n.sent_at is not null
    and 'mysolaris_home' = any(n.display_surfaces)
    and exists (
      select 1
      from public.studio2_feature_flags f
      where f.key = 'official_communications'
        and f.enabled = true
        and f.admins_only = false
        and (cardinality(f.user_ids) = 0 or auth.uid() = any(f.user_ids))
        and (cardinality(f.edition_ids) = 0 or n.edition_id is null or n.edition_id = any(f.edition_ids))
    )
  order by n.sent_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10)
$$;

notify pgrst, 'reload schema';

commit;
