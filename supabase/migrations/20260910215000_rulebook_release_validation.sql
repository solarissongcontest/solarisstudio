begin;

-- The organizer UI normally bases a draft on the current published version, but
-- governance rules must hold even when an RPC is called directly. Reject missing
-- bases and refuse to publish a release whose ancestry is broken or cyclic.
create or replace function public.admin_create_rulebook_release(
  _version text,
  _title text,
  _summary text,
  _base_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_base_version text;
begin
  if not public.rulebook_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  _version := trim(coalesce(_version, ''));
  _title := trim(coalesce(_title, ''));
  _summary := trim(coalesce(_summary, ''));
  v_base_version := nullif(trim(coalesce(_base_version, '')), '');

  if _version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$' then
    raise exception 'Version must look like 4.1 or 4.1.1';
  end if;
  if char_length(_title) < 3 or char_length(_title) > 120 then
    raise exception 'Title must be between 3 and 120 characters';
  end if;
  if char_length(_summary) < 10 or char_length(_summary) > 1200 then
    raise exception 'Summary must be between 10 and 1200 characters';
  end if;
  if exists (select 1 from public.ssc_rulebook_releases where version = _version) then
    raise exception 'That rulebook version already exists';
  end if;
  if v_base_version = _version then
    raise exception 'A rulebook release cannot inherit from itself';
  end if;
  if v_base_version is not null and not exists (
    select 1
    from public.ssc_rulebook_releases
    where version = v_base_version and status = 'published'
  ) then
    raise exception 'Base rulebook version must be a published release';
  end if;

  insert into public.ssc_rulebook_releases(
    version,
    title,
    summary,
    base_version,
    created_by
  )
  values (
    _version,
    _title,
    _summary,
    v_base_version,
    auth.uid()
  )
  returning id into v_id;

  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (
    v_id,
    'release.created',
    case
      when v_base_version is null then 'Draft rulebook release created without a base version'
      else 'Draft rulebook release created from published version ' || v_base_version
    end,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'id', v_id, 'version', _version);
end;
$$;
revoke all on function public.admin_create_rulebook_release(text, text, text, text) from public;
grant execute on function public.admin_create_rulebook_release(text, text, text, text) to authenticated;

create or replace function public.admin_publish_rulebook_release(
  _release_id uuid,
  _effective_from timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_version text;
  v_base_version text;
  v_changes bigint;
  v_missing_base boolean := false;
  v_cycle boolean := false;
begin
  if not public.rulebook_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  select status, version, base_version
  into v_status, v_version, v_base_version
  from public.ssc_rulebook_releases
  where id = _release_id
  for update;

  if v_status is null then
    raise exception 'Rulebook release not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only draft releases can be published';
  end if;

  select count(*) into v_changes
  from public.ssc_rulebook_change_items
  where release_id = _release_id;
  if v_changes < 1 then
    raise exception 'A release needs at least one recorded rule change before publication';
  end if;

  if v_base_version is not null then
    if not exists (
      select 1
      from public.ssc_rulebook_releases
      where version = v_base_version and status = 'published'
    ) then
      v_missing_base := true;
    end if;

    with recursive ancestry as (
      select
        r.version,
        r.base_version,
        array[r.version]::text[] as visited,
        false as cycle,
        0 as depth
      from public.ssc_rulebook_releases r
      where r.version = v_base_version and r.status = 'published'

      union all

      select
        parent.version,
        parent.base_version,
        child.visited || parent.version,
        parent.version = any(child.visited),
        child.depth + 1
      from ancestry child
      join public.ssc_rulebook_releases parent
        on parent.version = child.base_version
       and parent.status = 'published'
      where child.base_version is not null
        and child.depth < 50
        and not child.cycle
    )
    select coalesce(bool_or(cycle), false)
    into v_cycle
    from ancestry;
  end if;

  if v_missing_base then
    raise exception 'The draft base version is no longer a published rulebook release';
  end if;
  if v_cycle then
    raise exception 'Rulebook release ancestry contains a cycle';
  end if;

  update public.ssc_rulebook_releases
  set is_current = false
  where is_current = true;

  update public.ssc_rulebook_releases
  set
    status = 'published',
    is_current = true,
    effective_from = coalesce(_effective_from, now()),
    published_at = now(),
    updated_at = now()
  where id = _release_id;

  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (
    _release_id,
    'release.published',
    'Rulebook version ' || v_version || ' published with validated release ancestry',
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;
revoke all on function public.admin_publish_rulebook_release(uuid, timestamptz) from public;
grant execute on function public.admin_publish_rulebook_release(uuid, timestamptz) to authenticated;

commit;
