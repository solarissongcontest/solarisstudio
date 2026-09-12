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
  author_role text not null check (author_role in ('reporter', 'tsbc', 'witness', 'participant')),
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
  review_role text not null check (review_role in ('triage', 'investigator', 'decision_maker', 'appeal_reviewer')),
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
  relation_type text not null check (relation_type in ('related', 'duplicate', 'corroborating', 'same_incident', 'appeal_of')),
  note text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint integrity_case_relation_not_self check (case_id <> related_case_id),
  unique (case_id, related_case_id, relation_type)
);

create table if not exists public.integrity_case_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  request_kind text not null default 'clarification' check (request_kind in ('clarification', 'evidence', 'response', 'identity_consent')),
  prompt text not null,
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  visible_to_reporter boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

create table if not exists public.integrity_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  source_role text not null check (source_role in ('reporter', 'tsbc', 'witness', 'participant', 'system')),
  evidence_type text not null default 'file' check (evidence_type in ('file', 'url', 'text', 'voting_analysis', 'statement')),
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
alter table public.integrity_case_evidence enable row level security;
alter table public.integrity_evidence_upload_tokens enable row level security;
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
revoke all on public.integrity_case_evidence from anon, authenticated;
revoke all on public.integrity_evidence_upload_tokens from anon, authenticated;
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
      select jsonb_agg(jsonb_build_object('id', m.id, 'author_role', m.author_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at, m.id)
      from public.integrity_case_messages m
      where m.case_id = c.id and m.visible_to_reporter = true
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'detail', e.detail, 'created_at', e.created_at) order by e.created_at, e.id)
      from public.integrity_case_events e
      where e.case_id = c.id and e.visible_to_reporter = true
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'outcome', f.outcome, 'summary', f.summary, 'rationale', f.rationale, 'rule_ids', f.rule_ids, 'created_at', f.created_at) order by f.created_at, f.id)
      from public.integrity_case_findings f
      where f.case_id = c.id and f.visible_to_reporter = true
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object('id', ev.id, 'source_role', ev.source_role, 'evidence_type', ev.evidence_type, 'title', ev.title, 'description', ev.description, 'original_name', ev.original_name, 'mime_type', ev.mime_type, 'size_bytes', ev.size_bytes, 'external_url', ev.external_url, 'redacted_from_id', ev.redacted_from_id, 'disclosure_copy_of_id', ev.disclosure_copy_of_id, 'created_at', ev.created_at) order by ev.created_at, ev.id)
      from public.integrity_case_evidence ev
      where ev.case_id = c.id and ev.visible_to_reporter = true
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'request_kind', r.request_kind, 'prompt', r.prompt, 'status', r.status, 'created_at', r.created_at, 'responded_at', r.responded_at) order by r.created_at, r.id)
      from public.integrity_case_requests r
      where r.case_id = c.id and r.visible_to_reporter = true
    ), '[]'::jsonb)
  )
  from public.integrity_cases c
  where c.id = _case_id;
$$;
revoke all on function public.integrity_case_snapshot(uuid) from public;

commit;
