begin;

-- Structured case-to-rule links keep allegations, review and findings tied to
-- the public Rulebook without turning a case status into a substitute for the
-- reasoning behind a decision.
create table if not exists public.integrity_case_rule_links (
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[0-9]+\.[0-9]+$'),
  relevance text not null default 'reviewed' check (relevance in (
    'alleged',
    'reviewed',
    'context',
    'supported',
    'not_supported'
  )),
  note text null,
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, rule_id)
);

create table if not exists public.integrity_case_findings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  outcome text not null check (outcome in (
    'violation',
    'no_violation',
    'insufficient_evidence',
    'outside_jurisdiction',
    'duplicate',
    'administrative_resolution'
  )),
  summary text not null,
  rationale text not null,
  rule_ids text[] not null default '{}',
  visible_to_reporter boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists integrity_case_findings_case_created_idx
  on public.integrity_case_findings(case_id, created_at desc);

alter table public.integrity_case_rule_links enable row level security;
alter table public.integrity_case_findings enable row level security;

revoke all on public.integrity_case_rule_links from anon, authenticated;
revoke all on public.integrity_case_findings from anon, authenticated;

create or replace function public.admin_upsert_integrity_rule_link(
  _case_id uuid,
  _rule_id text,
  _relevance text default 'reviewed',
  _note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  _rule_id := trim(coalesce(_rule_id, ''));
  _relevance := lower(trim(coalesce(_relevance, 'reviewed')));
  _note := nullif(trim(coalesce(_note, '')), '');

  if _rule_id !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'Invalid SSC rule id';
  end if;

  if _relevance not in ('alleged', 'reviewed', 'context', 'supported', 'not_supported') then
    raise exception 'Invalid rule relevance';
  end if;

  if _note is not null and char_length(_note) > 4000 then
    raise exception 'Rule-link note is too long';
  end if;

  if not exists (select 1 from public.integrity_cases where id = _case_id) then
    raise exception 'Integrity case not found';
  end if;

  insert into public.integrity_case_rule_links(
    case_id,
    rule_id,
    relevance,
    note,
    added_by
  ) values (
    _case_id,
    _rule_id,
    _relevance,
    _note,
    auth.uid()
  )
  on conflict (case_id, rule_id)
  do update set
    relevance = excluded.relevance,
    note = excluded.note,
    added_by = excluded.added_by,
    updated_at = now();

  insert into public.integrity_case_events(
    case_id,
    event_type,
    detail,
    visible_to_reporter,
    actor_user_id
  ) values (
    _case_id,
    'rule.linked',
    'Rule ' || _rule_id || ' marked as ' || replace(_relevance, '_', ' '),
    false,
    auth.uid()
  );

  update public.integrity_cases
  set updated_at = now()
  where id = _case_id;

  return jsonb_build_object('ok', true, 'rule_id', _rule_id, 'relevance', _relevance);
end;
$$;

revoke all on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) from public;
grant execute on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) to authenticated;

create or replace function public.admin_remove_integrity_rule_link(
  _case_id uuid,
  _rule_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  delete from public.integrity_case_rule_links
  where case_id = _case_id
    and rule_id = trim(coalesce(_rule_id, ''));

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.integrity_case_events(
      case_id,
      event_type,
      detail,
      visible_to_reporter,
      actor_user_id
    ) values (
      _case_id,
      'rule.unlinked',
      'Rule ' || trim(_rule_id) || ' removed from case review',
      false,
      auth.uid()
    );

    update public.integrity_cases set updated_at = now() where id = _case_id;
  end if;

  return jsonb_build_object('ok', true, 'removed', v_deleted > 0);
end;
$$;

revoke all on function public.admin_remove_integrity_rule_link(uuid, text) from public;
grant execute on function public.admin_remove_integrity_rule_link(uuid, text) to authenticated;

create or replace function public.admin_record_integrity_finding(
  _case_id uuid,
  _outcome text,
  _summary text,
  _rationale text,
  _rule_ids text[] default '{}',
  _visible_to_reporter boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_finding_id uuid;
  v_next_status text;
  v_rule text;
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  _outcome := lower(trim(coalesce(_outcome, '')));
  _summary := trim(coalesce(_summary, ''));
  _rationale := trim(coalesce(_rationale, ''));
  _rule_ids := coalesce(_rule_ids, '{}');

  if _outcome not in (
    'violation',
    'no_violation',
    'insufficient_evidence',
    'outside_jurisdiction',
    'duplicate',
    'administrative_resolution'
  ) then
    raise exception 'Invalid integrity finding outcome';
  end if;

  if char_length(_summary) < 5 or char_length(_summary) > 240 then
    raise exception 'Finding summary must be between 5 and 240 characters';
  end if;

  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then
    raise exception 'Finding rationale must be between 20 and 12000 characters';
  end if;

  if coalesce(array_length(_rule_ids, 1), 0) > 20 then
    raise exception 'Too many rules attached to one finding';
  end if;

  foreach v_rule in array _rule_ids loop
    if trim(v_rule) !~ '^[0-9]+\.[0-9]+$' then
      raise exception 'Invalid SSC rule id in finding: %', v_rule;
    end if;
  end loop;

  if not exists (select 1 from public.integrity_cases where id = _case_id) then
    raise exception 'Integrity case not found';
  end if;

  insert into public.integrity_case_findings(
    case_id,
    outcome,
    summary,
    rationale,
    rule_ids,
    visible_to_reporter,
    created_by
  ) values (
    _case_id,
    _outcome,
    _summary,
    _rationale,
    _rule_ids,
    _visible_to_reporter,
    auth.uid()
  ) returning id into v_finding_id;

  foreach v_rule in array _rule_ids loop
    insert into public.integrity_case_rule_links(
      case_id,
      rule_id,
      relevance,
      note,
      added_by
    ) values (
      _case_id,
      trim(v_rule),
      case when _outcome = 'violation' then 'supported' else 'reviewed' end,
      null,
      auth.uid()
    )
    on conflict (case_id, rule_id)
    do update set
      relevance = case
        when _outcome = 'violation' then 'supported'
        when public.integrity_case_rule_links.relevance = 'alleged' then 'reviewed'
        else public.integrity_case_rule_links.relevance
      end,
      added_by = excluded.added_by,
      updated_at = now();
  end loop;

  v_next_status := case _outcome
    when 'violation' then 'action_taken'
    when 'no_violation' then 'closed_no_violation'
    when 'insufficient_evidence' then 'closed_insufficient_evidence'
    when 'outside_jurisdiction' then 'closed_outside_jurisdiction'
    when 'duplicate' then 'closed_duplicate'
    else 'closed'
  end;

  update public.integrity_cases
  set status = v_next_status,
      updated_at = now(),
      closed_at = case
        when v_next_status like 'closed%' then coalesce(closed_at, now())
        else null
      end
  where id = _case_id;

  insert into public.integrity_case_events(
    case_id,
    event_type,
    detail,
    visible_to_reporter,
    actor_user_id
  ) values (
    _case_id,
    'finding.recorded',
    _summary,
    _visible_to_reporter,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'finding_id', v_finding_id,
    'outcome', _outcome,
    'status', v_next_status
  );
end;
$$;

revoke all on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) from public;
grant execute on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) to authenticated;

-- Extend the reporter snapshot with only findings explicitly marked as visible.
create or replace function public.integrity_case_snapshot(_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', c.id,
      'public_code', c.public_code,
      'category', c.category,
      'identity_mode', c.identity_mode,
      'summary', c.summary,
      'details', c.details,
      'observed_facts', c.observed_facts,
      'uncertainties', c.uncertainties,
      'related_countries', c.related_countries,
      'edition_reference', c.edition_reference,
      'status', c.status,
      'priority', c.priority,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'closed_at', c.closed_at
    ),
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'author_role', m.author_role,
          'body', m.body,
          'created_at', m.created_at
        ) order by m.created_at, m.id
      )
      from public.integrity_case_messages m
      where m.case_id = c.id
        and m.visible_to_reporter = true
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'detail', e.detail,
          'created_at', e.created_at
        ) order by e.created_at, e.id
      )
      from public.integrity_case_events e
      where e.case_id = c.id
        and e.visible_to_reporter = true
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'outcome', f.outcome,
          'summary', f.summary,
          'rationale', f.rationale,
          'rule_ids', f.rule_ids,
          'created_at', f.created_at
        ) order by f.created_at, f.id
      )
      from public.integrity_case_findings f
      where f.case_id = c.id
        and f.visible_to_reporter = true
    ), '[]'::jsonb)
  )
  from public.integrity_cases c
  where c.id = _case_id;
$$;

revoke all on function public.integrity_case_snapshot(uuid) from public;

-- Extend the organizer detail without exposing recovery-secret data.
create or replace function public.admin_integrity_case(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  return (
    select jsonb_build_object(
      'case', to_jsonb(c) - 'reporter_user_id',
      'messages', coalesce((
        select jsonb_agg(to_jsonb(m) order by m.created_at, m.id)
        from public.integrity_case_messages m
        where m.case_id = c.id
      ), '[]'::jsonb),
      'notes', coalesce((
        select jsonb_agg(to_jsonb(n) order by n.created_at, n.id)
        from public.integrity_case_internal_notes n
        where n.case_id = c.id
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.integrity_case_events e
        where e.case_id = c.id
      ), '[]'::jsonb),
      'rule_links', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.rule_id)
        from public.integrity_case_rule_links r
        where r.case_id = c.id
      ), '[]'::jsonb),
      'findings', coalesce((
        select jsonb_agg(to_jsonb(f) order by f.created_at, f.id)
        from public.integrity_case_findings f
        where f.case_id = c.id
      ), '[]'::jsonb)
    )
    from public.integrity_cases c
    where c.id = _case_id
  );
end;
$$;

revoke all on function public.admin_integrity_case(uuid) from public;
grant execute on function public.admin_integrity_case(uuid) to authenticated;

commit;
