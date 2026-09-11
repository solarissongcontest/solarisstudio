begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is distinct from 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$$;

create table if not exists public.integrity_cases (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  case_kind text not null default 'report' check (case_kind in (
    'report', 'self_report', 'rule_question', 'vulnerability', 'safety'
  )),
  category text not null check (category in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  )),
  identity_mode text not null default 'anonymous' check (identity_mode in (
    'anonymous', 'sealed', 'confidential'
  )),
  reporter_user_id uuid null references auth.users(id) on delete set null,
  summary text not null,
  details text not null,
  observed_facts text null,
  uncertainties text null,
  related_countries text[] not null default '{}',
  edition_reference text null,
  status text not null default 'received' check (status in (
    'received', 'awaiting_review', 'under_review', 'waiting_for_reporter',
    'investigation_opened', 'action_taken', 'closed_no_violation',
    'closed_insufficient_evidence', 'closed_outside_jurisdiction',
    'closed_duplicate', 'closed'
  )),
  priority text not null default 'standard' check (priority in (
    'information', 'standard', 'high', 'urgent'
  )),
  assigned_to uuid null references auth.users(id) on delete set null,
  retention_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint fully_anonymous_has_no_reporter_identity
    check (identity_mode <> 'anonymous' or reporter_user_id is null),
  constraint protected_reports_have_reporter_identity
    check (identity_mode = 'anonymous' or reporter_user_id is not null)
);

create index if not exists integrity_cases_status_created_idx
  on public.integrity_cases(status, created_at desc);
create index if not exists integrity_cases_category_created_idx
  on public.integrity_cases(category, created_at desc);
create index if not exists integrity_cases_reporter_idx
  on public.integrity_cases(reporter_user_id, updated_at desc)
  where reporter_user_id is not null;

create table if not exists public.integrity_case_access (
  case_id uuid primary key references public.integrity_cases(id) on delete cascade,
  recovery_secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integrity_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  author_role text not null check (author_role in (
    'reporter', 'tsbc', 'witness', 'participant'
  )),
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

create table if not exists public.integrity_case_rule_links (
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[0-9]+\.[0-9]+$'),
  relevance text not null default 'reviewed' check (relevance in (
    'alleged', 'reviewed', 'context', 'supported', 'not_supported'
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
    'violation', 'no_violation', 'insufficient_evidence', 'outside_jurisdiction',
    'duplicate', 'administrative_resolution'
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

create table if not exists public.integrity_case_reviewers (
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_role text not null check (review_role in (
    'triage', 'investigator', 'decision_maker', 'appeal_reviewer'
  )),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  recused_at timestamptz null,
  recusal_reason text null,
  primary key (case_id, user_id, review_role)
);

create table if not exists public.integrity_case_relations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  related_case_id uuid not null references public.integrity_cases(id) on delete cascade,
  relation_type text not null check (relation_type in (
    'related', 'duplicate', 'corroborating', 'same_incident', 'appeal_of'
  )),
  note text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint integrity_case_relation_not_self check (case_id <> related_case_id),
  unique (case_id, related_case_id, relation_type)
);

create table if not exists public.integrity_case_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  request_kind text not null default 'clarification' check (request_kind in (
    'clarification', 'evidence', 'response', 'identity_consent'
  )),
  prompt text not null,
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  visible_to_reporter boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

create table if not exists public.integrity_evidence_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  object_path text not null unique,
  original_name text not null,
  mime_type text not null,
  expected_size bigint not null check (expected_size > 0 and expected_size <= 15728640),
  created_by uuid null references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.integrity_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  source_role text not null check (source_role in (
    'reporter', 'tsbc', 'witness', 'participant', 'system'
  )),
  evidence_type text not null default 'file' check (evidence_type in (
    'file', 'url', 'text', 'voting_analysis', 'statement'
  )),
  title text not null,
  description text null,
  storage_path text null,
  original_name text null,
  mime_type text null,
  size_bytes bigint null,
  external_url text null,
  provenance text null,
  redacted_from_id uuid null references public.integrity_case_evidence(id) on delete set null,
  disclosure_copy_of_id uuid null references public.integrity_case_evidence(id) on delete set null,
  visible_to_reporter boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists integrity_case_evidence_case_created_idx
  on public.integrity_case_evidence(case_id, created_at asc);

create table if not exists public.integrity_public_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid null references public.integrity_cases(id) on delete set null,
  title text not null,
  category text not null,
  summary text not null,
  rationale text not null,
  rule_ids text[] not null default '{}',
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now()
);

alter table public.integrity_cases enable row level security;
alter table public.integrity_case_access enable row level security;
alter table public.integrity_case_messages enable row level security;
alter table public.integrity_case_internal_notes enable row level security;
alter table public.integrity_case_events enable row level security;
alter table public.integrity_case_rule_links enable row level security;
alter table public.integrity_case_findings enable row level security;
alter table public.integrity_case_reviewers enable row level security;
alter table public.integrity_case_relations enable row level security;
alter table public.integrity_case_requests enable row level security;
alter table public.integrity_evidence_upload_tokens enable row level security;
alter table public.integrity_case_evidence enable row level security;
alter table public.integrity_public_decisions enable row level security;

revoke all on public.integrity_cases from anon, authenticated;
revoke all on public.integrity_case_access from anon, authenticated;
revoke all on public.integrity_case_messages from anon, authenticated;
revoke all on public.integrity_case_internal_notes from anon, authenticated;
revoke all on public.integrity_case_events from anon, authenticated;
revoke all on public.integrity_case_rule_links from anon, authenticated;
revoke all on public.integrity_case_findings from anon, authenticated;
revoke all on public.integrity_case_reviewers from anon, authenticated;
revoke all on public.integrity_case_relations from anon, authenticated;
revoke all on public.integrity_case_requests from anon, authenticated;
revoke all on public.integrity_evidence_upload_tokens from anon, authenticated;
revoke all on public.integrity_case_evidence from anon, authenticated;
revoke all on public.integrity_public_decisions from anon, authenticated;

create or replace function public.integrity_is_organizer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role::text = 'organizer'
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

create or replace function public.integrity_case_snapshot(_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', c.id,
      'public_code', c.public_code,
      'case_kind', c.case_kind,
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
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_role', m.author_role,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at, m.id)
      from public.integrity_case_messages m
      where m.case_id = c.id and m.visible_to_reporter = true
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'detail', e.detail,
        'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.integrity_case_events e
      where e.case_id = c.id and e.visible_to_reporter = true
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'outcome', f.outcome,
        'summary', f.summary,
        'rationale', f.rationale,
        'rule_ids', f.rule_ids,
        'created_at', f.created_at
      ) order by f.created_at, f.id)
      from public.integrity_case_findings f
      where f.case_id = c.id and f.visible_to_reporter = true
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ev.id,
        'source_role', ev.source_role,
        'evidence_type', ev.evidence_type,
        'title', ev.title,
        'description', ev.description,
        'original_name', ev.original_name,
        'mime_type', ev.mime_type,
        'size_bytes', ev.size_bytes,
        'external_url', ev.external_url,
        'redacted_from_id', ev.redacted_from_id,
        'disclosure_copy_of_id', ev.disclosure_copy_of_id,
        'created_at', ev.created_at
      ) order by ev.created_at, ev.id)
      from public.integrity_case_evidence ev
      where ev.case_id = c.id and ev.visible_to_reporter = true
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'request_kind', r.request_kind,
        'prompt', r.prompt,
        'status', r.status,
        'created_at', r.created_at,
        'responded_at', r.responded_at
      ) order by r.created_at, r.id)
      from public.integrity_case_requests r
      where r.case_id = c.id and r.visible_to_reporter = true
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
  _edition_reference text default null,
  _case_kind text default 'report'
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
  v_priority text := 'standard';
  v_attempt integer := 0;
begin
  _category := lower(trim(coalesce(_category, '')));
  _case_kind := lower(trim(coalesce(_case_kind, 'report')));
  _summary := trim(coalesce(_summary, ''));
  _details := trim(coalesce(_details, ''));
  _observed_facts := nullif(trim(coalesce(_observed_facts, '')), '');
  _uncertainties := nullif(trim(coalesce(_uncertainties, '')), '');
  _edition_reference := nullif(trim(coalesce(_edition_reference, '')), '');

  if _category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then raise exception 'Invalid integrity report category'; end if;
  if _case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then
    raise exception 'Invalid case kind';
  end if;
  if char_length(_summary) < 5 or char_length(_summary) > 180 then
    raise exception 'Summary must be between 5 and 180 characters';
  end if;
  if char_length(_details) < 20 or char_length(_details) > 12000 then
    raise exception 'Details must be between 20 and 12000 characters';
  end if;
  if coalesce(array_length(_related_countries, 1), 0) > 12 then
    raise exception 'Too many related countries';
  end if;

  if _category = 'safety' or _case_kind = 'safety' then v_priority := 'urgent';
  elsif _category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then
    v_priority := 'high';
  elsif _case_kind = 'rule_question' then v_priority := 'information';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.integrity_cases where public_code = v_code);
    if v_attempt > 8 then raise exception 'Could not allocate anonymous case code'; end if;
  end loop;

  v_secret_raw := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_secret_pretty := regexp_replace(v_secret_raw, '(.{4})(?=.)', '\1-', 'g');
  v_hash := encode(extensions.digest(convert_to(v_secret_raw, 'UTF8'), 'sha256'), 'hex');

  insert into public.integrity_cases(
    public_code, case_kind, category, identity_mode, reporter_user_id,
    summary, details, observed_facts, uncertainties, related_countries,
    edition_reference, status, priority
  ) values (
    v_code, _case_kind, _category, 'anonymous', null,
    _summary, _details, _observed_facts, _uncertainties,
    coalesce(_related_countries, '{}'), _edition_reference, 'received', v_priority
  ) returning id into v_case_id;

  insert into public.integrity_case_access(case_id, recovery_secret_hash)
  values (v_case_id, v_hash);
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', _details, null);
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'case.created', 'Anonymous case received', null);

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
revoke all on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) from public;
grant execute on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) to anon, authenticated;

create or replace function public.public_get_anonymous_integrity_case(_case_code text, _recovery_key text)
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
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
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

create or replace function public.public_reply_anonymous_integrity_case(_case_code text, _recovery_key text, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_hash text;
begin
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;

  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
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

  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', _body, null);
  update public.integrity_case_requests
  set status = 'responded', responded_at = now()
  where case_id = v_case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases
  set status = case when status = 'waiting_for_reporter' then 'under_review' else status end,
      updated_at = now()
  where id = v_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'reporter.message', 'Additional information received', null);

  return jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));
end;
$$;
revoke all on function public.public_reply_anonymous_integrity_case(text, text, text) from public;
grant execute on function public.public_reply_anonymous_integrity_case(text, text, text) to anon, authenticated;

create or replace function public.create_protected_integrity_case(
  _identity_mode text,
  _case_kind text,
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
  v_user uuid := auth.uid();
  v_case_id uuid;
  v_code text;
  v_priority text := 'standard';
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  _identity_mode := lower(trim(coalesce(_identity_mode, '')));
  _case_kind := lower(trim(coalesce(_case_kind, 'report')));
  _category := lower(trim(coalesce(_category, 'other')));
  _summary := trim(coalesce(_summary, ''));
  _details := trim(coalesce(_details, ''));

  if _identity_mode not in ('sealed', 'confidential') then
    raise exception 'Protected cases must use sealed or confidential identity mode';
  end if;
  if _case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then
    raise exception 'Invalid case kind';
  end if;
  if _category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then raise exception 'Invalid category'; end if;
  if char_length(_summary) < 5 or char_length(_summary) > 180 then
    raise exception 'Summary must be between 5 and 180 characters';
  end if;
  if char_length(_details) < 20 or char_length(_details) > 12000 then
    raise exception 'Details must be between 20 and 12000 characters';
  end if;

  if _category = 'safety' or _case_kind = 'safety' then v_priority := 'urgent';
  elsif _category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then v_priority := 'high';
  elsif _case_kind = 'rule_question' then v_priority := 'information'; end if;

  v_code := case when _identity_mode = 'sealed' then 'SR-' else 'CR-' end || upper(encode(extensions.gen_random_bytes(5), 'hex'));

  insert into public.integrity_cases(
    public_code, case_kind, category, identity_mode, reporter_user_id,
    summary, details, observed_facts, uncertainties, related_countries,
    edition_reference, priority
  ) values (
    v_code, _case_kind, _category, _identity_mode, v_user,
    _summary, _details, nullif(trim(coalesce(_observed_facts, '')), ''),
    nullif(trim(coalesce(_uncertainties, '')), ''), coalesce(_related_countries, '{}'),
    nullif(trim(coalesce(_edition_reference, '')), ''), v_priority
  ) returning id into v_case_id;

  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', _details, v_user);
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'case.created', case when _identity_mode = 'sealed' then 'Sealed-identity case received' else 'Confidential case received' end, v_user);

  return jsonb_build_object('ok', true, 'case_id', v_case_id, 'case_code', v_code);
end;
$$;
revoke all on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) from public;
grant execute on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) to authenticated;

create or replace function public.reporter_integrity_cases()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'public_code', c.public_code,
    'case_kind', c.case_kind,
    'category', c.category,
    'identity_mode', c.identity_mode,
    'summary', c.summary,
    'status', c.status,
    'priority', c.priority,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
  from public.integrity_cases c
  where c.reporter_user_id = auth.uid();
$$;
revoke all on function public.reporter_integrity_cases() from public;
grant execute on function public.reporter_integrity_cases() to authenticated;

create or replace function public.reporter_integrity_case(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id and c.reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;
  return public.integrity_case_snapshot(_case_id);
end;
$$;
revoke all on function public.reporter_integrity_case(uuid) from public;
grant execute on function public.reporter_integrity_case(uuid) to authenticated;

create or replace function public.reporter_reply_integrity_case(_case_id uuid, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id and c.reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (_case_id, 'reporter', _body, auth.uid());
  update public.integrity_case_requests set status = 'responded', responded_at = now()
  where case_id = _case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases
  set status = case when status = 'waiting_for_reporter' then 'under_review' else status end,
      updated_at = now()
  where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (_case_id, 'reporter.message', 'Reporter response received', auth.uid());
  return public.integrity_case_snapshot(_case_id);
end;
$$;
revoke all on function public.reporter_reply_integrity_case(uuid, text) from public;
grant execute on function public.reporter_reply_integrity_case(uuid, text) to authenticated;

create or replace function public.admin_integrity_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'public_code', c.public_code,
      'case_kind', c.case_kind,
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
      'reporter_identity_available', (c.identity_mode = 'confidential' and c.reporter_user_id is not null)
    ) order by
      case c.priority when 'urgent' then 1 when 'high' then 2 when 'standard' then 3 else 4 end,
      c.updated_at desc
    ) from public.integrity_cases c
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
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return (
    select jsonb_build_object(
      'case', to_jsonb(c) - 'reporter_user_id',
      'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from public.integrity_case_messages m where m.case_id = c.id), '[]'::jsonb),
      'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at, n.id) from public.integrity_case_internal_notes n where n.case_id = c.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id) from public.integrity_case_events e where e.case_id = c.id), '[]'::jsonb),
      'rule_links', coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_id) from public.integrity_case_rule_links r where r.case_id = c.id), '[]'::jsonb),
      'findings', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at, f.id) from public.integrity_case_findings f where f.case_id = c.id), '[]'::jsonb),
      'reviewers', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', rv.user_id,
        'email', au.email,
        'review_role', rv.review_role,
        'assigned_at', rv.assigned_at,
        'recused_at', rv.recused_at,
        'recusal_reason', rv.recusal_reason
      ) order by rv.assigned_at) from public.integrity_case_reviewers rv left join auth.users au on au.id = rv.user_id where rv.case_id = c.id), '[]'::jsonb),
      'relations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rel.id,
        'related_case_id', rel.related_case_id,
        'related_public_code', rc.public_code,
        'relation_type', rel.relation_type,
        'note', rel.note,
        'created_at', rel.created_at
      ) order by rel.created_at) from public.integrity_case_relations rel join public.integrity_cases rc on rc.id = rel.related_case_id where rel.case_id = c.id), '[]'::jsonb),
      'requests', coalesce((select jsonb_agg(to_jsonb(rq) order by rq.created_at) from public.integrity_case_requests rq where rq.case_id = c.id), '[]'::jsonb),
      'evidence', coalesce((select jsonb_agg(to_jsonb(ev) order by ev.created_at, ev.id) from public.integrity_case_evidence ev where ev.case_id = c.id), '[]'::jsonb)
    ) from public.integrity_cases c where c.id = _case_id
  );
end;
$$;
revoke all on function public.admin_integrity_case(uuid) from public;
grant execute on function public.admin_integrity_case(uuid) to authenticated;

create or replace function public.admin_reply_integrity_case(_case_id uuid, _body text, _request_response boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Message must be between 2 and 8000 characters'; end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (_case_id, 'tsbc', _body, auth.uid());
  if _request_response then
    insert into public.integrity_case_requests(case_id, request_kind, prompt, created_by)
    values (_case_id, 'clarification', _body, auth.uid());
  end if;
  update public.integrity_cases set status = case when _request_response then 'waiting_for_reporter' else status end, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (_case_id, case when _request_response then 'tsbc.question' else 'tsbc.message' end, case when _request_response then 'TSBC requested more information' else 'TSBC sent a case update' end, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_reply_integrity_case(uuid, text, boolean) from public;
grant execute on function public.admin_reply_integrity_case(uuid, text, boolean) to authenticated;

create or replace function public.admin_update_integrity_case_status(_case_id uuid, _status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _status not in (
    'received', 'awaiting_review', 'under_review', 'waiting_for_reporter',
    'investigation_opened', 'action_taken', 'closed_no_violation',
    'closed_insufficient_evidence', 'closed_outside_jurisdiction', 'closed_duplicate', 'closed'
  ) then raise exception 'Invalid integrity case status'; end if;
  select status into v_old from public.integrity_cases where id = _case_id for update;
  if v_old is null then raise exception 'Integrity case not found'; end if;
  update public.integrity_cases set status = _status, updated_at = now(), closed_at = case when _status like 'closed%' then coalesce(closed_at, now()) else null end where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (_case_id, 'status.changed', 'Status changed from ' || v_old || ' to ' || _status, auth.uid());
  return jsonb_build_object('ok', true, 'status', _status);
end;
$$;
revoke all on function public.admin_update_integrity_case_status(uuid, text) from public;
grant execute on function public.admin_update_integrity_case_status(uuid, text) to authenticated;

create or replace function public.admin_add_integrity_case_note(_case_id uuid, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Note must be between 2 and 8000 characters'; end if;
  insert into public.integrity_case_internal_notes(case_id, body, created_by) values (_case_id, _body, auth.uid());
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'internal.note', 'Internal investigator note added', false, auth.uid());
  update public.integrity_cases set updated_at = now() where id = _case_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_add_integrity_case_note(uuid, text) from public;
grant execute on function public.admin_add_integrity_case_note(uuid, text) to authenticated;

create or replace function public.admin_set_integrity_priority(_case_id uuid, _priority text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _priority not in ('information', 'standard', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  update public.integrity_cases set priority = _priority, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'priority.changed', 'Case priority changed to ' || _priority, false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_integrity_priority(uuid, text) from public;
grant execute on function public.admin_set_integrity_priority(uuid, text) to authenticated;

create or replace function public.admin_upsert_integrity_rule_link(_case_id uuid, _rule_id text, _relevance text default 'reviewed', _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _rule_id := trim(coalesce(_rule_id, ''));
  _relevance := lower(trim(coalesce(_relevance, 'reviewed')));
  if _rule_id !~ '^[0-9]+\.[0-9]+$' then raise exception 'Invalid SSC rule id'; end if;
  if _relevance not in ('alleged', 'reviewed', 'context', 'supported', 'not_supported') then raise exception 'Invalid rule relevance'; end if;
  insert into public.integrity_case_rule_links(case_id, rule_id, relevance, note, added_by)
  values (_case_id, _rule_id, _relevance, nullif(trim(coalesce(_note, '')), ''), auth.uid())
  on conflict (case_id, rule_id) do update set relevance = excluded.relevance, note = excluded.note, added_by = excluded.added_by, updated_at = now();
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'rule.linked', 'Rule ' || _rule_id || ' marked ' || replace(_relevance, '_', ' '), false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) from public;
grant execute on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) to authenticated;

create or replace function public.admin_remove_integrity_rule_link(_case_id uuid, _rule_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  delete from public.integrity_case_rule_links where case_id = _case_id and rule_id = trim(_rule_id);
  return jsonb_build_object('ok', true);
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
declare v_finding_id uuid; v_status text; v_rule text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _outcome not in ('violation', 'no_violation', 'insufficient_evidence', 'outside_jurisdiction', 'duplicate', 'administrative_resolution') then raise exception 'Invalid outcome'; end if;
  _summary := trim(coalesce(_summary, ''));
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_summary) < 5 or char_length(_summary) > 240 then raise exception 'Finding summary must be between 5 and 240 characters'; end if;
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then raise exception 'Finding rationale must be between 20 and 12000 characters'; end if;
  foreach v_rule in array coalesce(_rule_ids, '{}') loop
    if trim(v_rule) !~ '^[0-9]+\.[0-9]+$' then raise exception 'Invalid SSC rule id: %', v_rule; end if;
  end loop;
  insert into public.integrity_case_findings(case_id, outcome, summary, rationale, rule_ids, visible_to_reporter, created_by)
  values (_case_id, _outcome, _summary, _rationale, coalesce(_rule_ids, '{}'), _visible_to_reporter, auth.uid()) returning id into v_finding_id;
  foreach v_rule in array coalesce(_rule_ids, '{}') loop
    insert into public.integrity_case_rule_links(case_id, rule_id, relevance, added_by)
    values (_case_id, trim(v_rule), case when _outcome = 'violation' then 'supported' else 'reviewed' end, auth.uid())
    on conflict (case_id, rule_id) do update set relevance = excluded.relevance, added_by = excluded.added_by, updated_at = now();
  end loop;
  v_status := case _outcome when 'violation' then 'action_taken' when 'no_violation' then 'closed_no_violation' when 'insufficient_evidence' then 'closed_insufficient_evidence' when 'outside_jurisdiction' then 'closed_outside_jurisdiction' when 'duplicate' then 'closed_duplicate' else 'closed' end;
  update public.integrity_cases set status = v_status, updated_at = now(), closed_at = case when v_status like 'closed%' then coalesce(closed_at, now()) else null end where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'finding.recorded', _summary, _visible_to_reporter, auth.uid());
  return jsonb_build_object('ok', true, 'finding_id', v_finding_id, 'status', v_status);
end;
$$;
revoke all on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) from public;
grant execute on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) to authenticated;

create or replace function public.admin_assign_integrity_reviewer(_case_id uuid, _user_id uuid, _review_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _review_role not in ('triage', 'investigator', 'decision_maker', 'appeal_reviewer') then raise exception 'Invalid review role'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role::text = 'organizer') then raise exception 'Reviewer must be an organizer'; end if;
  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (_case_id, _user_id, _review_role, auth.uid())
  on conflict (case_id, user_id, review_role) do update set assigned_by = excluded.assigned_by, assigned_at = now(), recused_at = null, recusal_reason = null;
  update public.integrity_cases set assigned_to = case when _review_role = 'investigator' then _user_id else assigned_to end, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'reviewer.assigned', 'A ' || replace(_review_role, '_', ' ') || ' was assigned', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_assign_integrity_reviewer(uuid, uuid, text) from public;
grant execute on function public.admin_assign_integrity_reviewer(uuid, uuid, text) to authenticated;

create or replace function public.admin_recuse_from_integrity_case(_case_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if char_length(_reason) < 5 then raise exception 'Provide a short recusal reason'; end if;
  update public.integrity_case_reviewers set recused_at = now(), recusal_reason = _reason
  where case_id = _case_id and user_id = auth.uid() and recused_at is null;
  update public.integrity_cases set assigned_to = null, updated_at = now() where id = _case_id and assigned_to = auth.uid();
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'reviewer.recused', 'Reviewer recused due to a recorded conflict of interest', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_recuse_from_integrity_case(uuid, text) from public;
grant execute on function public.admin_recuse_from_integrity_case(uuid, text) to authenticated;

create or replace function public.admin_link_integrity_cases(_case_id uuid, _related_case_id uuid, _relation_type text, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _case_id = _related_case_id then raise exception 'A case cannot be related to itself'; end if;
  if _relation_type not in ('related', 'duplicate', 'corroborating', 'same_incident', 'appeal_of') then raise exception 'Invalid relation type'; end if;
  insert into public.integrity_case_relations(case_id, related_case_id, relation_type, note, created_by)
  values (_case_id, _related_case_id, _relation_type, nullif(trim(coalesce(_note, '')), ''), auth.uid())
  on conflict (case_id, related_case_id, relation_type) do update set note = excluded.note;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'case.linked', 'Case linked as ' || replace(_relation_type, '_', ' '), false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_link_integrity_cases(uuid, uuid, text, text) from public;
grant execute on function public.admin_link_integrity_cases(uuid, uuid, text, text) to authenticated;

create or replace function public.admin_integrity_reporter_identity(_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_mode text; v_user uuid; v_email text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select identity_mode, reporter_user_id into v_mode, v_user from public.integrity_cases where id = _case_id;
  if v_mode is null then raise exception 'Case not found'; end if;
  if v_mode = 'anonymous' then raise exception 'Fully anonymous cases have no reporter identity'; end if;
  if v_mode = 'sealed' then raise exception 'Reporter identity is sealed and cannot be revealed to case reviewers'; end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'identity.accessed', 'Confidential reporter identity was accessed by an organizer', false, auth.uid());
  return jsonb_build_object('user_id', v_user, 'email', v_email);
end;
$$;
revoke all on function public.admin_integrity_reporter_identity(uuid) from public;
grant execute on function public.admin_integrity_reporter_identity(uuid) to authenticated;

create or replace function public.admin_organizer_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', ur.user_id, 'email', au.email) order by au.email) from public.user_roles ur left join auth.users au on au.id = ur.user_id where ur.role::text = 'organizer'), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_organizer_directory() from public;
grant execute on function public.admin_organizer_directory() to authenticated;

create or replace function public.admin_publish_integrity_decision(_case_id uuid, _title text, _summary text, _rationale text, _rule_ids text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_category text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select category into v_category from public.integrity_cases where id = _case_id;
  if v_category is null then raise exception 'Case not found'; end if;
  insert into public.integrity_public_decisions(case_id, title, category, summary, rationale, rule_ids, published_by)
  values (_case_id, trim(_title), v_category, trim(_summary), trim(_rationale), coalesce(_rule_ids, '{}'), auth.uid()) returning id into v_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'decision.published', 'An anonymised integrity decision was published', false, auth.uid());
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.admin_publish_integrity_decision(uuid, text, text, text, text[]) from public;
grant execute on function public.admin_publish_integrity_decision(uuid, text, text, text, text[]) to authenticated;

create or replace function public.public_integrity_decisions()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'category', d.category,
    'summary', d.summary,
    'rationale', d.rationale,
    'rule_ids', d.rule_ids,
    'published_at', d.published_at
  ) order by d.published_at desc), '[]'::jsonb)
  from public.integrity_public_decisions d;
$$;
revoke all on function public.public_integrity_decisions() from public;
grant execute on function public.public_integrity_decisions() to anon, authenticated;

create or replace function public.public_integrity_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_cases', count(*),
    'open_cases', count(*) filter (where status not like 'closed%'),
    'resolved_cases', count(*) filter (where status like 'closed%' or status = 'action_taken'),
    'violations_confirmed', (select count(*) from public.integrity_case_findings where outcome = 'violation'),
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.integrity_cases group by category) x), '{}'::jsonb)
  ) from public.integrity_cases;
$$;
revoke all on function public.public_integrity_stats() from public;
grant execute on function public.public_integrity_stats() to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'integrity-evidence',
  'integrity-evidence',
  false,
  15728640,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.integrity_case_id_from_object_path(_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_part text;
begin
  v_part := split_part(coalesce(_name, ''), '/', 2);
  begin return v_part::uuid; exception when others then return null; end;
end;
$$;
revoke all on function public.integrity_case_id_from_object_path(text) from public;

after_setup: begin end;

create or replace function public.integrity_can_upload_evidence(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.integrity_is_organizer()
    or exists (
      select 1 from public.integrity_evidence_upload_tokens t
      where t.object_path = _name and t.expires_at > now() and t.used_at is null
    );
$$;
revoke all on function public.integrity_can_upload_evidence(text) from public;
grant execute on function public.integrity_can_upload_evidence(text) to anon, authenticated;

create or replace function public.integrity_can_read_evidence_object(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.integrity_is_organizer()
    or exists (
      select 1 from public.integrity_cases c
      where c.id = public.integrity_case_id_from_object_path(_name)
        and c.reporter_user_id = auth.uid()
    );
$$;
revoke all on function public.integrity_can_read_evidence_object(text) from public;
grant execute on function public.integrity_can_read_evidence_object(text) to authenticated;

drop policy if exists "integrity evidence token upload" on storage.objects;
create policy "integrity evidence token upload"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'integrity-evidence' and public.integrity_can_upload_evidence(name));

drop policy if exists "integrity evidence protected read" on storage.objects;
create policy "integrity evidence protected read"
on storage.objects for select to authenticated
using (bucket_id = 'integrity-evidence' and public.integrity_can_read_evidence_object(name));

drop policy if exists "integrity evidence organizer delete" on storage.objects;
create policy "integrity evidence organizer delete"
on storage.objects for delete to authenticated
using (bucket_id = 'integrity-evidence' and public.integrity_is_organizer());

create or replace function public.integrity_validate_evidence_file(_name text, _mime text, _size bigint)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(coalesce(_name, ''))) < 1 or char_length(_name) > 180 then raise exception 'Invalid file name'; end if;
  if _mime not in ('image/png','image/jpeg','image/webp','application/pdf','text/plain') then raise exception 'Unsupported evidence file type'; end if;
  if _size <= 0 or _size > 15728640 then raise exception 'Evidence files must be 15 MB or smaller'; end if;
end;
$$;
revoke all on function public.integrity_validate_evidence_file(text, text, bigint) from public;

create or replace function public.public_create_anonymous_evidence_upload(_case_code text, _recovery_key text, _name text, _mime text, _size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case uuid; v_hash text; v_token uuid; v_path text; v_safe text;
begin
  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case from public.integrity_cases c join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(_case_code)) and c.identity_mode = 'anonymous' and a.recovery_secret_hash = v_hash;
  if v_case is null then raise exception 'Case code or recovery key is incorrect'; end if;
  v_safe := regexp_replace(_name, '[^A-Za-z0-9._-]+', '-', 'g');
  v_path := 'case/' || v_case::text || '/reporter/' || encode(extensions.gen_random_bytes(10), 'hex') || '-' || v_safe;
  insert into public.integrity_evidence_upload_tokens(case_id, object_path, original_name, mime_type, expected_size)
  values (v_case, v_path, _name, _mime, _size) returning id into v_token;
  return jsonb_build_object('token_id', v_token, 'object_path', v_path, 'bucket', 'integrity-evidence');
end;
$$;
revoke all on function public.public_create_anonymous_evidence_upload(text, text, text, text, bigint) from public;
grant execute on function public.public_create_anonymous_evidence_upload(text, text, text, text, bigint) to anon, authenticated;

create or replace function public.create_protected_evidence_upload(_case_id uuid, _name text, _mime text, _size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token uuid; v_path text; v_safe text;
begin
  if auth.uid() is null or not exists (select 1 from public.integrity_cases where id = _case_id and reporter_user_id = auth.uid()) then raise exception 'Case not available'; end if;
  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_safe := regexp_replace(_name, '[^A-Za-z0-9._-]+', '-', 'g');
  v_path := 'case/' || _case_id::text || '/reporter/' || encode(extensions.gen_random_bytes(10), 'hex') || '-' || v_safe;
  insert into public.integrity_evidence_upload_tokens(case_id, object_path, original_name, mime_type, expected_size, created_by)
  values (_case_id, v_path, _name, _mime, _size, auth.uid()) returning id into v_token;
  return jsonb_build_object('token_id', v_token, 'object_path', v_path, 'bucket', 'integrity-evidence');
end;
$$;
revoke all on function public.create_protected_evidence_upload(uuid, text, text, bigint) from public;
grant execute on function public.create_protected_evidence_upload(uuid, text, text, bigint) to authenticated;

create or replace function public.integrity_finalize_evidence_token(_token_id uuid, _case_id uuid, _created_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare v_token public.integrity_evidence_upload_tokens%rowtype; v_id uuid;
begin
  select * into v_token from public.integrity_evidence_upload_tokens where id = _token_id and case_id = _case_id for update;
  if v_token.id is null or v_token.used_at is not null or v_token.expires_at <= now() then raise exception 'Evidence upload token is invalid or expired'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'integrity-evidence' and name = v_token.object_path) then raise exception 'Evidence file has not been uploaded'; end if;
  insert into public.integrity_case_evidence(case_id, source_role, evidence_type, title, storage_path, original_name, mime_type, size_bytes, provenance, created_by)
  values (_case_id, 'reporter', 'file', v_token.original_name, v_token.object_path, v_token.original_name, v_token.mime_type, v_token.expected_size, 'Submitted by protected reporter channel', _created_by)
  returning id into v_id;
  update public.integrity_evidence_upload_tokens set used_at = now() where id = _token_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (_case_id, 'evidence.added', 'Reporter added evidence: ' || v_token.original_name, _created_by);
  return v_id;
end;
$$;
revoke all on function public.integrity_finalize_evidence_token(uuid, uuid, uuid) from public;

create or replace function public.public_finalize_anonymous_evidence(_case_code text, _recovery_key text, _token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case uuid; v_hash text; v_id uuid;
begin
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case from public.integrity_cases c join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(_case_code)) and c.identity_mode = 'anonymous' and a.recovery_secret_hash = v_hash;
  if v_case is null then raise exception 'Case code or recovery key is incorrect'; end if;
  v_id := public.integrity_finalize_evidence_token(_token_id, v_case, null);
  return jsonb_build_object('ok', true, 'evidence_id', v_id, 'snapshot', public.integrity_case_snapshot(v_case));
end;
$$;
revoke all on function public.public_finalize_anonymous_evidence(text, text, uuid) from public;
grant execute on function public.public_finalize_anonymous_evidence(text, text, uuid) to anon, authenticated;

create or replace function public.finalize_protected_evidence(_case_id uuid, _token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.integrity_cases where id = _case_id and reporter_user_id = auth.uid()) then raise exception 'Case not available'; end if;
  v_id := public.integrity_finalize_evidence_token(_token_id, _case_id, auth.uid());
  return jsonb_build_object('ok', true, 'evidence_id', v_id, 'snapshot', public.integrity_case_snapshot(_case_id));
end;
$$;
revoke all on function public.finalize_protected_evidence(uuid, uuid) from public;
grant execute on function public.finalize_protected_evidence(uuid, uuid) to authenticated;

create or replace function public.admin_register_integrity_evidence(_case_id uuid, _evidence_type text, _title text, _description text default null, _external_url text default null, _visible_to_reporter boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _evidence_type not in ('url','text','voting_analysis','statement') then raise exception 'Invalid evidence type'; end if;
  insert into public.integrity_case_evidence(case_id, source_role, evidence_type, title, description, external_url, visible_to_reporter, created_by)
  values (_case_id, 'tsbc', _evidence_type, trim(_title), nullif(trim(coalesce(_description, '')), ''), nullif(trim(coalesce(_external_url, '')), ''), _visible_to_reporter, auth.uid()) returning id into v_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'evidence.added', 'TSBC added evidence: ' || trim(_title), _visible_to_reporter, auth.uid());
  return jsonb_build_object('ok', true, 'evidence_id', v_id);
end;
$$;
revoke all on function public.admin_register_integrity_evidence(uuid, text, text, text, text, boolean) from public;
grant execute on function public.admin_register_integrity_evidence(uuid, text, text, text, text, boolean) to authenticated;

commit;
