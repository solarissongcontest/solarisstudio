begin;

-- Repair any legacy state where a future-effective release was marked current.
-- A scheduled release must never displace the rulebook that is effective now.
do $$
begin
  if exists (
    select 1
    from public.ssc_rulebook_releases
    where status = 'published'
      and is_current = true
      and (effective_from is null or effective_from > now())
  ) then
    update public.ssc_rulebook_releases set is_current = false where is_current = true;

    update public.ssc_rulebook_releases
    set is_current = true
    where id = (
      select id
      from public.ssc_rulebook_releases
      where status = 'published'
        and effective_from is not null
        and effective_from <= now()
      order by effective_from desc, published_at desc nulls last, created_at desc
      limit 1
    );
  end if;
end;
$$;

-- The public runtime defensively resolves only a release that is already in
-- force. This also recovers sensibly from historical data created before the
-- publication guard below existed.
create or replace function public.public_current_rulebook_release()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive current_release as (
    select r.*
    from public.ssc_rulebook_releases r
    where r.status = 'published'
      and r.effective_from is not null
      and r.effective_from <= now()
    order by r.is_current desc, r.effective_from desc, r.published_at desc nulls last
    limit 1
  ),
  release_chain as (
    select r.id, r.version, r.base_version, 0 as depth
    from current_release r

    union all

    select parent.id, parent.version, parent.base_version, child.depth + 1
    from release_chain child
    join public.ssc_rulebook_releases parent
      on parent.version = child.base_version
     and parent.status = 'published'
    where child.depth < 50
  ),
  effective_ranked as (
    select
      c.id,
      c.rule_id,
      c.change_kind,
      c.before_snapshot,
      c.after_snapshot,
      c.rationale,
      c.updated_at,
      chain.depth,
      row_number() over (
        partition by c.rule_id
        order by chain.depth asc, c.updated_at desc, c.id desc
      ) as precedence
    from release_chain chain
    join public.ssc_rulebook_change_items c on c.release_id = chain.id
  )
  select coalesce((
    select jsonb_build_object(
      'id', r.id,
      'version', r.version,
      'title', r.title,
      'summary', r.summary,
      'base_version', r.base_version,
      'effective_from', r.effective_from,
      'published_at', r.published_at,
      'changes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'rule_id', c.rule_id,
            'change_kind', c.change_kind,
            'before_snapshot', c.before_snapshot,
            'after_snapshot', c.after_snapshot,
            'rationale', c.rationale,
            'updated_at', c.updated_at
          ) order by split_part(c.rule_id, '.', 1)::int, split_part(c.rule_id, '.', 2)::int
        )
        from public.ssc_rulebook_change_items c
        where c.release_id = r.id
      ), '[]'::jsonb),
      'effective_changes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'rule_id', e.rule_id,
            'change_kind', e.change_kind,
            'before_snapshot', e.before_snapshot,
            'after_snapshot', e.after_snapshot,
            'rationale', e.rationale,
            'updated_at', e.updated_at
          ) order by split_part(e.rule_id, '.', 1)::int, split_part(e.rule_id, '.', 2)::int
        )
        from effective_ranked e
        where e.precedence = 1
      ), '[]'::jsonb)
    )
    from current_release r
  ), jsonb_build_object(
    'version', '4.0',
    'changes', '[]'::jsonb,
    'effective_changes', '[]'::jsonb
  ));
$$;
revoke all on function public.public_current_rulebook_release() from public;
grant execute on function public.public_current_rulebook_release() to anon, authenticated;

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
  v_current_version text;
  v_changes bigint;
  v_missing_ancestor boolean := false;
  v_cycle boolean := false;
  v_depth_exhausted boolean := false;
  v_new_parts bigint[];
  v_base_parts bigint[];
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
  if _effective_from is null or _effective_from > now() then
    raise exception 'A rulebook release can only be published once its effective time has arrived';
  end if;

  select version
  into v_current_version
  from public.ssc_rulebook_releases
  where status = 'published' and is_current = true
  order by published_at desc nulls last
  limit 1;

  if v_current_version is not null and v_base_version is distinct from v_current_version then
    raise exception 'Draft base is no longer the current rulebook release; create or rebase the draft before publishing';
  end if;

  if v_base_version is not null then
    v_new_parts := array[
      split_part(v_version, '.', 1)::bigint,
      split_part(v_version, '.', 2)::bigint,
      coalesce(nullif(split_part(v_version, '.', 3), ''), '0')::bigint
    ];
    v_base_parts := array[
      split_part(v_base_version, '.', 1)::bigint,
      split_part(v_base_version, '.', 2)::bigint,
      coalesce(nullif(split_part(v_base_version, '.', 3), ''), '0')::bigint
    ];
    if v_new_parts <= v_base_parts then
      raise exception 'A new rulebook version must be greater than its base version';
    end if;
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
    effective_from = _effective_from,
    published_at = now(),
    updated_at = now()
  where id = _release_id;

  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (
    _release_id,
    'release.published',
    'Rulebook version ' || v_version || ' published from current base ' || coalesce(v_base_version, 'none'),
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;
revoke all on function public.admin_publish_rulebook_release(uuid, timestamptz) from public;
grant execute on function public.admin_publish_rulebook_release(uuid, timestamptz) to authenticated;

commit;
