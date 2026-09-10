begin;

-- SSC Trust & Integrity ------------------------------------------------------
-- Fully anonymous reports deliberately do not store a Solaris account id.
-- Public access happens only through narrow SECURITY DEFINER RPCs using a
-- high-entropy recovery secret whose SHA-256 digest is stored separately.

create table if not exists public.integrity_cases (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  category text not null check (category in (
    'voting_integrity',
    'vote_coordination',
    'entry_eligibility',
    'account_abuse',
    'conduct',
    'safety',
    'privacy',
    'technical_exploit',
    'tsbc_conduct',
    'other'
  )),
  identity_mode text not null default 'anonymous' check (identity_mode in ('anonymous', 'sealed', 'confidential')),
  reporter_user_id uuid null references auth.users(id) on delete set null,
  summary text not null,
  details text not null,
  observed_facts text null,
  uncertainties text null,
  related_countries text[] not null default '{}',
  edition_reference text null,
  status text not null default 'received' check (status in (
    'received',
    'awaiting_review',
    'under_review',
    'waiting_for_reporter',
    'investigation_opened',
    'action_taken',
    'closed_no_violation',
    'closed_insufficient_evidence',
    'closed_outside_jurisdiction',
    'closed_duplicate',
    'closed'
  )),
  priority text not null default 'standard' check (priority in ('information', 'standard', 'high', 'urgent')),
  assigned_to uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint fully_anonymous_has_no_reporter_identity
    check (identity_mode <> 'anonymous' or reporter_user_id is null)
);

create index if not exists integrity_cases_status_created_idx
  on public.integrity_cases(status, created_at desc);
create index if not exists integrity_cases_category_created_idx
  on public.integrity_cases(category, created_at desc);

create table if not exists public.integrity_case_access (
  case_id uuid primary key references public.integrity_cases(id) on delete cascade,
  recovery_secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integrity_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  author_role text not null check (author_role in ('reporter', 'tsbc')),
  body text not null,
  visible_to_reporter boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists integrity_case_messages_case_created_idx
  on public.integrity_case_messages(case_id, created_at asc);

create table if not exists public.integrity_case_internal_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  body text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.integrity_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  event_type text not null,
  detail text null,
  visible_to_reporter boolean not null default true,
  actor_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists integrity_case_events_case_created_idx
  on public.integrity_case_events(case_id, created_at asc);

alter table public.integrity_cases enable row level security;
alter table public.integrity_case_access enable row level security;
alter table public.integrity_case_messages enable row level security;
alter table public.integrity_case_internal_notes enable row level security;
alter table public.integrity_case_events enable row level security;

revoke all on public.integrity_cases from anon, authenticated;
revoke all on public.integrity_case_access from anon, authenticated;
revoke all on public.integrity_case_messages from anon, authenticated;
revoke all on public.integrity_case_internal_notes from anon, authenticated;
revoke all on public.integrity_case_events from anon, authenticated;

create or replace function public.integrity_is_organizer()
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
      where ur.user_id = auth.uid()
        and ur.role::text = 'organizer'
    );
$$;

revoke all on function public.integrity_is_organizer() from public;
grant execute on function public.integrity_is_organizer() to authenticated;

create or replace function public.integrity_normalize_secret(_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select upper(regexp_replace(coalesce(_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

revoke all on function public.integrity_normalize_secret(text) from public;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'integrity_case_snapshot'
  ) then
    drop function public.integrity_case_snapshot(uuid);
  end if;
end $$;

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
    ), '[]'::jsonb)
  )
  from public.integrity_cases c
  where c.id = _case_id;
$$;

revoke all on function public.integrity_case_snapshot(uuid) from public;

create or replace function public.public_create_anonymous_integrity_case(
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_code text;
  v_secret_raw text;
  v_secret_pretty text;
  v_hash text;
  v_attempt integer := 0;
  v_priority text := 'standard';
begin
  _category := lower(trim(coalesce(_category, '')));
  _summary := trim(coalesce(_summary, ''));
  _details := trim(coalesce(_details, ''));
  _observed_facts := nullif(trim(coalesce(_observed_facts, '')), '');
  _uncertainties := nullif(trim(coalesce(_uncertainties, '')), '');
  _edition_reference := nullif(trim(coalesce(_edition_reference, '')), '');

  if _category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then
    raise exception 'Invalid integrity report category';
  end if;

  if char_length(_summary) < 5 or char_length(_summary) > 180 then
    raise exception 'Summary must be between 5 and 180 characters';
  end if;
  if char_length(_details) < 20 or char_length(_details) > 12000 then
    raise exception 'Details must be between 20 and 12000 characters';
  end if;
  if _observed_facts is not null and char_length(_observed_facts) > 8000 then
    raise exception 'Observed facts are too long';
  end if;
  if _uncertainties is not null and char_length(_uncertainties) > 6000 then
    raise exception 'Uncertainties are too long';
  end if;
  if coalesce(array_length(_related_countries, 1), 0) > 12 then
    raise exception 'Too many related countries';
  end if;

  if _category = 'safety' then
    v_priority := 'urgent';
  elsif _category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then
    v_priority := 'high';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.integrity_cases where public_code = v_code);
    if v_attempt > 8 then
      raise exception 'Could not allocate anonymous case code';
    end if;
  end loop;

  v_secret_raw := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_secret_pretty := regexp_replace(v_secret_raw, '(.{4})(?=.)', '\1-', 'g');
  v_hash := encode(extensions.digest(convert_to(v_secret_raw, 'UTF8'), 'sha256'), 'hex');

  insert into public.integrity_cases (
    public_code,
    category,
    identity_mode,
    reporter_user_id,
    summary,
    details,
    observed_facts,
    uncertainties,
    related_countries,
    edition_reference,
    status,
    priority
  ) values (
    v_code,
    _category,
    'anonymous',
    null,
    _summary,
    _details,
    _observed_facts,
    _uncertainties,
    coalesce(_related_countries, '{}'),
    _edition_reference,
    'received',
    v_priority
  ) returning id into v_case_id;

  insert into public.integrity_case_access(case_id, recovery_secret_hash)
  values (v_case_id, v_hash);

  insert into public.integrity_case_messages(case_id, author_role, body, visible_to_reporter, created_by)
  values (v_case_id, 'reporter', _details, true, null);

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'case.created', 'Anonymous report received', true, null);

  return jsonb_build_object(
    'ok', true,
    'case_code', v_code,
    'recovery_key', v_secret_pretty,
    'status', 'received',
    'priority', v_priority,
    'created_at', now()
  );
end;
$$;

revoke all on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text) from public;
grant execute on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text) to anon, authenticated;

create or replace function public.public_get_anonymous_integrity_case(
  _case_code text,
  _recovery_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_hash text;
begin
  v_hash := encode(
    extensions.digest(
      convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;

  if v_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.');
  end if;

  return jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));
end;
$$;

revoke all on function public.public_get_anonymous_integrity_case(text, text) from public;
grant execute on function public.public_get_anonymous_integrity_case(text, text) to anon, authenticated;

create or replace function public.public_reply_anonymous_integrity_case(
  _case_code text,
  _recovery_key text,
  _body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_hash text;
  v_status text;
begin
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select c.id, c.status into v_case_id, v_status
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;

  if v_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.');
  end if;

  insert into public.integrity_case_messages(case_id, author_role, body, visible_to_reporter, created_by)
  values (v_case_id, 'reporter', _body, true, null);

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'reporter.message', 'Additional information received', true, null);

  if v_status = 'waiting_for_reporter' then
    update public.integrity_cases
    set status = 'under_review', updated_at = now()
    where id = v_case_id;
  else
    update public.integrity_cases set updated_at = now() where id = v_case_id;
  end if;

  return jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));
end;
$$;

revoke all on function public.public_reply_anonymous_integrity_case(text, text, text) from public;
grant execute on function public.public_reply_anonymous_integrity_case(text, text, text) to anon, authenticated;

create or replace function public.admin_integrity_cases()
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'public_code', c.public_code,
        'category', c.category,
        'identity_mode', c.identity_mode,
        'summary', c.summary,
        'status', c.status,
        'priority', c.priority,
        'related_countries', c.related_countries,
        'edition_reference', c.edition_reference,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'assigned_to', c.assigned_to,
        'reporter_identity_available', c.reporter_user_id is not null
      ) order by
        case c.priority when 'urgent' then 1 when 'high' then 2 when 'standard' then 3 else 4 end,
        c.updated_at desc
    )
    from public.integrity_cases c
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_integrity_cases() from public;
grant execute on function public.admin_integrity_cases() to authenticated;

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
      ), '[]'::jsonb)
    )
    from public.integrity_cases c
    where c.id = _case_id
  );
end;
$$;

revoke all on function public.admin_integrity_case(uuid) from public;
grant execute on function public.admin_integrity_case(uuid) to authenticated;

create or replace function public.admin_reply_integrity_case(
  _case_id uuid,
  _body text,
  _request_response boolean default true
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

  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;

  if not exists (select 1 from public.integrity_cases where id = _case_id) then
    raise exception 'Integrity case not found';
  end if;

  insert into public.integrity_case_messages(case_id, author_role, body, visible_to_reporter, created_by)
  values (_case_id, 'tsbc', _body, true, auth.uid());

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    case when _request_response then 'tsbc.question' else 'tsbc.message' end,
    case when _request_response then 'TSBC requested more information' else 'TSBC sent a case update' end,
    true,
    auth.uid()
  );

  update public.integrity_cases
  set status = case when _request_response then 'waiting_for_reporter' else status end,
      updated_at = now()
  where id = _case_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_reply_integrity_case(uuid, text, boolean) from public;
grant execute on function public.admin_reply_integrity_case(uuid, text, boolean) to authenticated;

create or replace function public.admin_update_integrity_case_status(
  _case_id uuid,
  _status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  if _status not in (
    'received', 'awaiting_review', 'under_review', 'waiting_for_reporter',
    'investigation_opened', 'action_taken', 'closed_no_violation',
    'closed_insufficient_evidence', 'closed_outside_jurisdiction',
    'closed_duplicate', 'closed'
  ) then
    raise exception 'Invalid integrity case status';
  end if;

  select status into v_old from public.integrity_cases where id = _case_id for update;
  if v_old is null then raise exception 'Integrity case not found'; end if;

  update public.integrity_cases
  set status = _status,
      updated_at = now(),
      closed_at = case when _status like 'closed%' then coalesce(closed_at, now()) else null end
  where id = _case_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'status.changed',
    'Status changed from ' || v_old || ' to ' || _status,
    true,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'status', _status);
end;
$$;

revoke all on function public.admin_update_integrity_case_status(uuid, text) from public;
grant execute on function public.admin_update_integrity_case_status(uuid, text) to authenticated;

create or replace function public.admin_add_integrity_case_note(
  _case_id uuid,
  _body text
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

  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then
    raise exception 'Note must be between 2 and 8000 characters';
  end if;

  insert into public.integrity_case_internal_notes(case_id, body, created_by)
  values (_case_id, _body, auth.uid());

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (_case_id, 'internal.note', 'Internal investigator note added', false, auth.uid());

  update public.integrity_cases set updated_at = now() where id = _case_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_add_integrity_case_note(uuid, text) from public;
grant execute on function public.admin_add_integrity_case_note(uuid, text) to authenticated;

commit;
