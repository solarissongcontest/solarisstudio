begin;

-- Validate the entire published ancestry chain, not merely the draft's immediate
-- base. A historical release with a dangling base must never become an invisible
-- hole in the effective rulebook, and an absurdly deep chain should fail loudly
-- instead of being silently truncated by a defensive recursion limit.
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
  v_missing_ancestor boolean := false;
  v_cycle boolean := false;
  v_depth_exhausted boolean := false;
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
    with recursive ancestry as (
      select
        r.version,
        r.base_version,
        array[r.version]::text[] as visited,
        false as cycle,
        false as missing_parent,
        0 as depth
      from public.ssc_rulebook_releases r
      where r.version = v_base_version
        and r.status = 'published'

      union all

      select
        child.base_version as version,
        parent.base_version,
        child.visited || child.base_version,
        child.base_version = any(child.visited) as cycle,
        parent.version is null as missing_parent,
        child.depth + 1
      from ancestry child
      left join public.ssc_rulebook_releases parent
        on parent.version = child.base_version
       and parent.status = 'published'
      where child.base_version is not null
        and child.depth < 50
        and not child.cycle
        and not child.missing_parent
    ),
    validation as (
      select
        not exists (select 1 from ancestry) as missing_immediate_base,
        coalesce(bool_or(missing_parent), false) as has_missing_parent,
        coalesce(bool_or(cycle), false) as has_cycle,
        coalesce(bool_or(depth >= 50 and base_version is not null and not cycle and not missing_parent), false) as hit_depth_limit
      from ancestry
    )
    select
      missing_immediate_base or has_missing_parent,
      has_cycle,
      hit_depth_limit
    into
      v_missing_ancestor,
      v_cycle,
      v_depth_exhausted
    from validation;
  end if;

  if v_missing_ancestor then
    raise exception 'Rulebook release ancestry contains a missing or unpublished base version';
  end if;
  if v_cycle then
    raise exception 'Rulebook release ancestry contains a cycle';
  end if;
  if v_depth_exhausted then
    raise exception 'Rulebook release ancestry exceeds the supported depth';
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
    'Rulebook version ' || v_version || ' published with complete ancestry validation',
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

revoke all on function public.admin_publish_rulebook_release(uuid, timestamptz) from public;
grant execute on function public.admin_publish_rulebook_release(uuid, timestamptz) to authenticated;

commit;
