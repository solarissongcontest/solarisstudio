begin;

-- One canonical communication may be displayed in multiple product surfaces.
-- Existing notices remain delegation-inbox-only for backwards compatibility.
alter table public.studio2_official_notices
  add column if not exists display_surfaces text[] not null default array['delegation_inbox']::text[];

alter table public.studio2_notice_versions
  add column if not exists display_surfaces text[] not null default array['delegation_inbox']::text[];

alter table public.studio2_official_notices
  drop constraint if exists studio2_official_notices_display_surfaces_check,
  add constraint studio2_official_notices_display_surfaces_check check (
    cardinality(display_surfaces) > 0
    and display_surfaces <@ array['delegation_inbox', 'mysolaris_home', 'public_home']::text[]
    and array_position(display_surfaces, null) is null
  );

alter table public.studio2_notice_versions
  drop constraint if exists studio2_notice_versions_display_surfaces_check,
  add constraint studio2_notice_versions_display_surfaces_check check (
    cardinality(display_surfaces) > 0
    and display_surfaces <@ array['delegation_inbox', 'mysolaris_home', 'public_home']::text[]
    and array_position(display_surfaces, null) is null
  );

create index if not exists studio2_official_notices_display_surfaces_idx
  on public.studio2_official_notices using gin (display_surfaces);

create index if not exists studio2_official_notices_published_sent_idx
  on public.studio2_official_notices (sent_at desc)
  where status = 'published' and sent_at is not null;

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
    display_surfaces, status, scheduled_at, sent_at, changed_by, changed_at
  ) values (
    old.id, old.revision, old.edition_id, old.notice_type, old.title, old.body, old.severity,
    old.audience, old.audience_group, old.country_ids, old.acknowledgement_required,
    old.display_surfaces, old.status, old.scheduled_at, old.sent_at, auth.uid(), now()
  )
  on conflict (notice_id, revision) do nothing;

  new.revision := old.revision + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

create or replace function private.studio2_validate_notice_surfaces(p_display_surfaces text[])
returns text[]
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  v_surfaces text[];
begin
  select coalesce(array_agg(distinct surface order by surface), '{}'::text[])
    into v_surfaces
  from unnest(coalesce(p_display_surfaces, '{}'::text[])) surface;

  if cardinality(v_surfaces) = 0 then
    raise exception 'Choose at least one communication destination' using errcode = '22023';
  end if;

  if not v_surfaces <@ array['delegation_inbox', 'mysolaris_home', 'public_home']::text[] then
    raise exception 'Unknown communication destination' using errcode = '22023';
  end if;

  return v_surfaces;
end
$$;

revoke all on function private.studio2_validate_notice_surfaces(text[]) from public, anon, authenticated;

create or replace function public.studio2_set_notice_surfaces(
  p_notice_id uuid,
  p_display_surfaces text[]
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_surfaces text[];
begin
  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
  for update;

  if not found then
    raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);

  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can change destinations' using errcode = '23514';
  end if;

  v_surfaces := private.studio2_validate_notice_surfaces(p_display_surfaces);

  update public.studio2_official_notices
  set display_surfaces = v_surfaces,
      acknowledgement_required = case
        when 'delegation_inbox' = any(v_surfaces) then acknowledgement_required
        else false
      end
  where id = p_notice_id
  returning * into v_notice;

  return v_notice;
end
$$;

revoke all on function public.studio2_set_notice_surfaces(uuid, text[]) from public, anon, authenticated;
grant execute on function public.studio2_set_notice_surfaces(uuid, text[]) to authenticated, service_role;

-- Superseding a notice should preserve where the original communication appeared.
create or replace function public.studio2_create_superseding_notice_draft(p_notice_id uuid)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_source public.studio2_official_notices%rowtype;
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_source from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_source.edition_id);
  if v_source.status <> 'published' then
    raise exception 'Only a published notice can be superseded' using errcode = '23514';
  end if;

  insert into public.studio2_official_notices (
    edition_id, notice_type, title, body, severity, audience, audience_group,
    country_ids, acknowledgement_required, display_surfaces, status,
    supersedes_id, created_by, updated_by
  ) values (
    v_source.edition_id, v_source.notice_type, v_source.title, v_source.body,
    v_source.severity, v_source.audience, v_source.audience_group,
    v_source.country_ids, v_source.acknowledgement_required, v_source.display_surfaces,
    'draft', v_source.id, v_actor, v_actor
  ) returning * into v_notice;
  return v_notice;
end
$$;

-- Safe public projection. This is intentionally a SECURITY DEFINER RPC rather
-- than opening the operational notice table to anonymous SELECT.
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
    and n.sent_at is not null
    and 'public_home' = any(n.display_surfaces)
    and exists (
      select 1
      from public.studio2_feature_flags f
      where f.key = 'official_communications'
        and f.enabled = true
        and f.admins_only = false
        and cardinality(f.user_ids) = 0
    )
  order by n.sent_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 10)
$$;

revoke all on function public.studio2_public_home_announcements(integer) from public, anon, authenticated;
grant execute on function public.studio2_public_home_announcements(integer) to anon, authenticated, service_role;

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

revoke all on function public.studio2_mysolaris_home_announcements(integer) from public, anon, authenticated;
grant execute on function public.studio2_mysolaris_home_announcements(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
