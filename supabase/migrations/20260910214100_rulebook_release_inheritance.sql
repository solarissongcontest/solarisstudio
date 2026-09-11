begin;

-- Return the effective rule overrides for one release, following its published
-- base-version chain. The nearest release wins for each rule id, so a v4.2
-- change replaces v4.1 for that rule while unrelated v4.1 changes remain live.
create or replace function public.rulebook_effective_changes(_release_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive lineage as (
    select
      r.id,
      r.version,
      r.base_version,
      0::integer as depth
    from public.ssc_rulebook_releases r
    where r.id = _release_id

    union all

    select
      base.id,
      base.version,
      base.base_version,
      lineage.depth + 1
    from lineage
    join public.ssc_rulebook_releases base
      on base.version = lineage.base_version
    where lineage.depth < 100
      and base.status = 'published'
  ),
  ranked as (
    select
      c.*,
      lineage.depth,
      row_number() over (
        partition by c.rule_id
        order by lineage.depth asc, c.updated_at desc, c.created_at desc
      ) as precedence
    from lineage
    join public.ssc_rulebook_change_items c
      on c.release_id = lineage.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ranked.id,
        'rule_id', ranked.rule_id,
        'change_kind', ranked.change_kind,
        'before_snapshot', ranked.before_snapshot,
        'after_snapshot', ranked.after_snapshot,
        'rationale', ranked.rationale,
        'created_at', ranked.created_at,
        'updated_at', ranked.updated_at
      )
      order by split_part(ranked.rule_id, '.', 1)::int,
               split_part(ranked.rule_id, '.', 2)::int
    ),
    '[]'::jsonb
  )
  from ranked
  where ranked.precedence = 1;
$$;

revoke all on function public.rulebook_effective_changes(uuid) from public;

-- Public consumers receive both the local delta and the cumulative effective
-- overrides. History can therefore remain a truthful "what changed here?"
-- view while runtime rendering receives the full inherited state.
create or replace function public.public_current_rulebook_release()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
            'created_at', c.created_at,
            'updated_at', c.updated_at
          )
          order by split_part(c.rule_id, '.', 1)::int,
                   split_part(c.rule_id, '.', 2)::int
        )
        from public.ssc_rulebook_change_items c
        where c.release_id = r.id
      ), '[]'::jsonb),
      'effective_changes', public.rulebook_effective_changes(r.id)
    )
    from public.ssc_rulebook_releases r
    where r.status = 'published'
      and r.is_current = true
    order by r.published_at desc nulls last
    limit 1
  ), jsonb_build_object(
    'version', '4.0',
    'changes', '[]'::jsonb,
    'effective_changes', '[]'::jsonb
  ));
$$;

revoke all on function public.public_current_rulebook_release() from public;
grant execute on function public.public_current_rulebook_release() to anon, authenticated;

-- Drafts must branch from a real published release. Besides preventing typos,
-- this guarantees the ancestry graph is finite because drafts may only point
-- backwards to an already-published version.
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
  if exists (
    select 1 from public.ssc_rulebook_releases where version = _version
  ) then
    raise exception 'That rulebook version already exists';
  end if;

  if v_base_version is not null and not exists (
    select 1
    from public.ssc_rulebook_releases
    where version = v_base_version
      and status = 'published'
  ) then
    raise exception 'Base version must be an existing published rulebook release';
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

  insert into public.ssc_rulebook_events(
    release_id,
    event_type,
    detail,
    actor_user_id
  )
  values (
    v_id,
    'release.created',
    case
      when v_base_version is null then 'Draft rulebook release created without a base version'
      else 'Draft rulebook release created from published v' || v_base_version
    end,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'version', _version,
    'base_version', v_base_version
  );
end;
$$;

revoke all on function public.admin_create_rulebook_release(text, text, text, text) from public;
grant execute on function public.admin_create_rulebook_release(text, text, text, text) to authenticated;

commit;
