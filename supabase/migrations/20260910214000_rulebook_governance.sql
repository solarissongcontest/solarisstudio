begin;

create table if not exists public.ssc_rulebook_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_current boolean not null default false,
  title text not null,
  summary text not null,
  base_version text null,
  effective_from timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint ssc_rulebook_release_version_format check (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
  constraint ssc_rulebook_current_requires_published check (not is_current or status = 'published')
);

create unique index if not exists ssc_rulebook_one_current_idx
  on public.ssc_rulebook_releases ((is_current))
  where is_current = true;
create index if not exists ssc_rulebook_release_status_idx
  on public.ssc_rulebook_releases(status, created_at desc);

create table if not exists public.ssc_rulebook_change_items (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.ssc_rulebook_releases(id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[0-9]+\.[0-9]+$'),
  change_kind text not null default 'modified' check (change_kind in ('added', 'modified', 'removed', 'interpretation')),
  before_snapshot jsonb null,
  after_snapshot jsonb null,
  rationale text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, rule_id),
  constraint ssc_rulebook_snapshot_shape check (
    (before_snapshot is null or jsonb_typeof(before_snapshot) = 'object')
    and (after_snapshot is null or jsonb_typeof(after_snapshot) = 'object')
  ),
  constraint ssc_rulebook_change_snapshot_requirements check (
    (change_kind = 'added' and before_snapshot is null and after_snapshot is not null)
    or (change_kind in ('modified', 'interpretation') and before_snapshot is not null and after_snapshot is not null)
    or (change_kind = 'removed' and before_snapshot is not null and after_snapshot is null)
  )
);
create index if not exists ssc_rulebook_change_release_idx
  on public.ssc_rulebook_change_items(release_id, rule_id);

create table if not exists public.ssc_rulebook_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.ssc_rulebook_releases(id) on delete cascade,
  event_type text not null,
  detail text null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ssc_rulebook_events_release_created_idx
  on public.ssc_rulebook_events(release_id, created_at desc);

alter table public.ssc_rulebook_releases enable row level security;
alter table public.ssc_rulebook_change_items enable row level security;
alter table public.ssc_rulebook_events enable row level security;

revoke all on public.ssc_rulebook_releases from anon, authenticated;
revoke all on public.ssc_rulebook_change_items from anon, authenticated;
revoke all on public.ssc_rulebook_events from anon, authenticated;

create or replace function public.rulebook_is_organizer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role::text = 'organizer'
    );
$$;
revoke all on function public.rulebook_is_organizer() from public;
grant execute on function public.rulebook_is_organizer() to authenticated;

insert into public.ssc_rulebook_releases(
  version,
  status,
  is_current,
  title,
  summary,
  base_version,
  effective_from,
  published_at
)
select
  '4.0',
  'published',
  true,
  'Online-first 21-chapter edition',
  'Rebuilt the SSC General Regulations around a completely online fan contest, with explicit voting-integrity safeguards, protected reporting, proportionate sanctions and edition-specific configuration.',
  null,
  now(),
  now()
where not exists (
  select 1 from public.ssc_rulebook_releases where version = '4.0'
);

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
            'updated_at', c.updated_at
          ) order by split_part(c.rule_id, '.', 1)::int, split_part(c.rule_id, '.', 2)::int
        )
        from public.ssc_rulebook_change_items c
        where c.release_id = r.id
      ), '[]'::jsonb)
    )
    from public.ssc_rulebook_releases r
    where r.status = 'published' and r.is_current = true
    order by r.published_at desc nulls last
    limit 1
  ), jsonb_build_object('version', '4.0', 'changes', '[]'::jsonb));
$$;
revoke all on function public.public_current_rulebook_release() from public;
grant execute on function public.public_current_rulebook_release() to anon, authenticated;

create or replace function public.public_rulebook_release_history()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'version', r.version,
      'is_current', r.is_current,
      'title', r.title,
      'summary', r.summary,
      'base_version', r.base_version,
      'effective_from', r.effective_from,
      'published_at', r.published_at,
      'changes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rule_id', c.rule_id,
            'change_kind', c.change_kind,
            'before_snapshot', c.before_snapshot,
            'after_snapshot', c.after_snapshot,
            'rationale', c.rationale
          ) order by split_part(c.rule_id, '.', 1)::int, split_part(c.rule_id, '.', 2)::int
        )
        from public.ssc_rulebook_change_items c
        where c.release_id = r.id
      ), '[]'::jsonb)
    ) order by r.published_at desc nulls last, r.created_at desc
  ), '[]'::jsonb)
  from public.ssc_rulebook_releases r
  where r.status = 'published';
$$;
revoke all on function public.public_rulebook_release_history() from public;
grant execute on function public.public_rulebook_release_history() to anon, authenticated;

create or replace function public.admin_rulebook_releases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'version', r.version,
        'status', r.status,
        'is_current', r.is_current,
        'title', r.title,
        'summary', r.summary,
        'base_version', r.base_version,
        'effective_from', r.effective_from,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'published_at', r.published_at,
        'change_count', (select count(*) from public.ssc_rulebook_change_items c where c.release_id = r.id),
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
            ) order by split_part(c.rule_id, '.', 1)::int, split_part(c.rule_id, '.', 2)::int
          )
          from public.ssc_rulebook_change_items c
          where c.release_id = r.id
        ), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', e.id,
              'event_type', e.event_type,
              'detail', e.detail,
              'created_at', e.created_at
            ) order by e.created_at desc
          )
          from public.ssc_rulebook_events e
          where e.release_id = r.id
        ), '[]'::jsonb)
      ) order by r.is_current desc, r.created_at desc
    )
    from public.ssc_rulebook_releases r
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_rulebook_releases() from public;
grant execute on function public.admin_rulebook_releases() to authenticated;

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
declare v_id uuid;
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  _version := trim(coalesce(_version, ''));
  _title := trim(coalesce(_title, ''));
  _summary := trim(coalesce(_summary, ''));
  if _version !~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$' then raise exception 'Version must look like 4.1 or 4.1.1'; end if;
  if char_length(_title) < 3 or char_length(_title) > 120 then raise exception 'Title must be between 3 and 120 characters'; end if;
  if char_length(_summary) < 10 or char_length(_summary) > 1200 then raise exception 'Summary must be between 10 and 1200 characters'; end if;
  if exists (select 1 from public.ssc_rulebook_releases where version = _version) then raise exception 'That rulebook version already exists'; end if;
  insert into public.ssc_rulebook_releases(version, title, summary, base_version, created_by)
  values (_version, _title, _summary, nullif(trim(coalesce(_base_version, '')), ''), auth.uid())
  returning id into v_id;
  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (v_id, 'release.created', 'Draft rulebook release created', auth.uid());
  return jsonb_build_object('ok', true, 'id', v_id, 'version', _version);
end;
$$;
revoke all on function public.admin_create_rulebook_release(text, text, text, text) from public;
grant execute on function public.admin_create_rulebook_release(text, text, text, text) to authenticated;

create or replace function public.admin_upsert_rulebook_change(
  _release_id uuid,
  _rule_id text,
  _change_kind text,
  _before_snapshot jsonb,
  _after_snapshot jsonb,
  _rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_status text;
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  select status into v_status from public.ssc_rulebook_releases where id = _release_id for update;
  if v_status is null then raise exception 'Rulebook release not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft releases can be edited'; end if;
  _rule_id := trim(coalesce(_rule_id, ''));
  _change_kind := lower(trim(coalesce(_change_kind, 'modified')));
  _rationale := trim(coalesce(_rationale, ''));
  if _rule_id !~ '^[0-9]+\.[0-9]+$' then raise exception 'Invalid SSC rule id'; end if;
  if _change_kind not in ('added', 'modified', 'removed', 'interpretation') then raise exception 'Invalid change kind'; end if;
  if char_length(_rationale) < 5 or char_length(_rationale) > 4000 then raise exception 'Rationale must be between 5 and 4000 characters'; end if;
  if _before_snapshot is not null and jsonb_typeof(_before_snapshot) <> 'object' then raise exception 'Before snapshot must be a JSON object'; end if;
  if _after_snapshot is not null and jsonb_typeof(_after_snapshot) <> 'object' then raise exception 'After snapshot must be a JSON object'; end if;
  if _change_kind = 'added' and (_before_snapshot is not null or _after_snapshot is null) then raise exception 'Added rules require only an after snapshot'; end if;
  if _change_kind in ('modified', 'interpretation') and (_before_snapshot is null or _after_snapshot is null) then raise exception 'Modified rules require before and after snapshots'; end if;
  if _change_kind = 'removed' and (_before_snapshot is null or _after_snapshot is not null) then raise exception 'Removed rules require only a before snapshot'; end if;

  insert into public.ssc_rulebook_change_items(release_id, rule_id, change_kind, before_snapshot, after_snapshot, rationale, created_by)
  values (_release_id, _rule_id, _change_kind, _before_snapshot, _after_snapshot, _rationale, auth.uid())
  on conflict (release_id, rule_id) do update set
    change_kind = excluded.change_kind,
    before_snapshot = excluded.before_snapshot,
    after_snapshot = excluded.after_snapshot,
    rationale = excluded.rationale,
    created_by = excluded.created_by,
    updated_at = now()
  returning id into v_id;

  update public.ssc_rulebook_releases set updated_at = now() where id = _release_id;
  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (_release_id, 'change.saved', 'Rule ' || _rule_id || ' ' || _change_kind || ' change saved', auth.uid());
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.admin_upsert_rulebook_change(uuid, text, text, jsonb, jsonb, text) from public;
grant execute on function public.admin_upsert_rulebook_change(uuid, text, text, jsonb, jsonb, text) to authenticated;

create or replace function public.admin_delete_rulebook_change(_release_id uuid, _rule_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  select status into v_status from public.ssc_rulebook_releases where id = _release_id for update;
  if v_status is null then raise exception 'Rulebook release not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft releases can be edited'; end if;
  delete from public.ssc_rulebook_change_items where release_id = _release_id and rule_id = trim(_rule_id);
  update public.ssc_rulebook_releases set updated_at = now() where id = _release_id;
  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (_release_id, 'change.deleted', 'Draft change for Rule ' || trim(_rule_id) || ' removed', auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_delete_rulebook_change(uuid, text) from public;
grant execute on function public.admin_delete_rulebook_change(uuid, text) to authenticated;

create or replace function public.admin_publish_rulebook_release(_release_id uuid, _effective_from timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text; v_version text; v_changes bigint;
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  select status, version into v_status, v_version from public.ssc_rulebook_releases where id = _release_id for update;
  if v_status is null then raise exception 'Rulebook release not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft releases can be published'; end if;
  select count(*) into v_changes from public.ssc_rulebook_change_items where release_id = _release_id;
  if v_changes < 1 then raise exception 'A release needs at least one recorded rule change before publication'; end if;

  update public.ssc_rulebook_releases set is_current = false where is_current = true;
  update public.ssc_rulebook_releases
  set status = 'published', is_current = true, effective_from = coalesce(_effective_from, now()), published_at = now(), updated_at = now()
  where id = _release_id;
  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (_release_id, 'release.published', 'Rulebook version ' || v_version || ' published', auth.uid());
  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;
revoke all on function public.admin_publish_rulebook_release(uuid, timestamptz) from public;
grant execute on function public.admin_publish_rulebook_release(uuid, timestamptz) to authenticated;

create or replace function public.admin_archive_rulebook_release(_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_current boolean;
begin
  if not public.rulebook_is_organizer() then raise exception 'Organizer access required'; end if;
  select is_current into v_current from public.ssc_rulebook_releases where id = _release_id for update;
  if v_current is null then raise exception 'Rulebook release not found'; end if;
  if v_current then raise exception 'The current published release cannot be archived'; end if;
  update public.ssc_rulebook_releases set status = 'archived', updated_at = now() where id = _release_id;
  insert into public.ssc_rulebook_events(release_id, event_type, detail, actor_user_id)
  values (_release_id, 'release.archived', 'Rulebook release archived', auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_archive_rulebook_release(uuid) from public;
grant execute on function public.admin_archive_rulebook_release(uuid) to authenticated;

commit;
