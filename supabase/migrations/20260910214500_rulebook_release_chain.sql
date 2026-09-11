begin;

-- A published release records only the rules changed in that release. The live
-- rulebook still needs every inherited override from its base-version chain.
-- Return both the local change list (for history) and a de-duplicated effective
-- change list (for runtime application), with the closest/newest release winning.
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
    where r.status = 'published' and r.is_current = true
    order by r.published_at desc nulls last
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

-- Archiving is a draft-discard action. Published releases form the public audit
-- history and must not disappear merely because they are no longer current.
create or replace function public.admin_archive_rulebook_release(_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_current boolean;
begin
  if not public.rulebook_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  select status, is_current
  into v_status, v_current
  from public.ssc_rulebook_releases
  where id = _release_id
  for update;

  if v_status is null then
    raise exception 'Rulebook release not found';
  end if;
  if v_current then
    raise exception 'The current published release cannot be archived';
  end if;
  if v_status <> 'draft' then
    raise exception 'Published rulebook history cannot be archived';
  end if;

  update public.ssc_rulebook_releases
  set status = 'archived', updated_at = now()
  where id = _release_id;

  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (_release_id, 'release.archived', 'Draft rulebook release archived', auth.uid());

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_archive_rulebook_release(uuid) from public;
grant execute on function public.admin_archive_rulebook_release(uuid) to authenticated;

commit;
