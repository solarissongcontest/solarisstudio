begin;

-- Solaris Studio 2 persistence schema.
-- Keep privileged helpers out of the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.studio2_edition_runtime (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  state text not null,
  subsystems jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint studio2_edition_runtime_state_check check (
    state in (
      'draft', 'planning', 'host_selection', 'confirmations', 'submissions',
      'pre_show', 'rehearsals', 'jury_voting', 'live_show', 'televoting',
      'vote_verification', 'results', 'post_edition', 'archived'
    )
  ),
  constraint studio2_edition_runtime_subsystems_object_check check (
    jsonb_typeof(subsystems) = 'object'
  ),
  constraint studio2_edition_runtime_subsystems_shape_check check (
    subsystems ?& array['confirmations', 'submissions', 'juryVoting', 'televoting', 'results', 'predictions']
    and subsystems ->> 'confirmations' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
    and subsystems ->> 'submissions' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
    and subsystems ->> 'juryVoting' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
    and subsystems ->> 'televoting' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
    and subsystems ->> 'results' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
    and subsystems ->> 'predictions' in ('not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published')
  )
);

create table public.studio2_contest_events (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  type text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  constraint studio2_contest_events_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint studio2_contest_events_type_check check (
    type in (
      'edition.created', 'edition.state_changed', 'edition.archived',
      'confirmation.opened', 'confirmation.closed', 'country.confirmed',
      'entry.submitted', 'entry.changed', 'entry.locked',
      'jury.opened', 'jury.closed', 'jury.ballot_submitted',
      'televote.opened', 'televote.closed', 'televote.ballot_submitted',
      'vote.flagged', 'integrity.case_created', 'integrity.case_closed',
      'results.calculated', 'results.verified', 'results.published',
      'broadcast.segment_started', 'broadcast.segment_completed',
      'incident.created', 'incident.updated', 'incident.resolved',
      'notice.sent', 'notice.acknowledged', 'rule.changed'
    )
  )
);

create index studio2_contest_events_edition_time_idx
  on public.studio2_contest_events (edition_id, occurred_at desc);
create index studio2_contest_events_edition_type_time_idx
  on public.studio2_contest_events (edition_id, type, occurred_at desc);

create table public.studio2_capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  edition_id uuid references public.editions(id) on delete cascade,
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint studio2_capability_grants_capability_check check (
    capability in (
      'edition.read', 'edition.manage', 'edition.archive',
      'confirmation.read', 'confirmation.manage',
      'entry.read_private', 'entry.edit', 'entry.approve',
      'jury.ballots.read', 'televote.ballots.read',
      'results.preview', 'results.verify', 'results.publish',
      'integrity.read', 'integrity.manage', 'broadcast.control',
      'governance.vote', 'rules.edit', 'incident.manage', 'communications.send'
    )
  ),
  constraint studio2_capability_grants_scope_unique
    unique nulls not distinct (user_id, capability, edition_id)
);

create index studio2_capability_grants_user_idx
  on public.studio2_capability_grants (user_id, edition_id);
create index studio2_capability_grants_active_idx
  on public.studio2_capability_grants (user_id, capability, edition_id, expires_at);

create table public.studio2_incidents (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  severity text not null check (severity in ('sev1', 'sev2', 'sev3', 'sev4')),
  status text not null default 'open' check (status in ('open', 'mitigating', 'monitoring', 'resolved')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_incidents_resolution_check check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create index studio2_incidents_edition_status_idx
  on public.studio2_incidents (edition_id, status, severity, started_at desc);

create or replace function private.studio2_normalize_legacy_edition_status(p_status text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(btrim(coalesce(p_status, '')))
    when 'draft' then 'draft'
    when 'planning' then 'planning'
    when 'active' then 'submissions'
    when 'ongoing' then 'submissions'
    when 'open' then 'submissions'
    when 'voting' then 'televoting'
    when 'results' then 'results'
    when 'completed' then 'post_edition'
    when 'complete' then 'post_edition'
    when 'finished' then 'post_edition'
    when 'archived' then 'archived'
    else 'planning'
  end
$$;

create or replace function private.studio2_default_subsystems(p_state text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_states constant text[] := array[
    'draft', 'planning', 'host_selection', 'confirmations', 'submissions',
    'pre_show', 'rehearsals', 'jury_voting', 'live_show', 'televoting',
    'vote_verification', 'results', 'post_edition', 'archived'
  ];
  v_index integer;
begin
  v_index := array_position(v_states, p_state);
  if v_index is null then
    raise exception 'Unknown Studio 2 edition state: %', p_state using errcode = '22023';
  end if;

  return jsonb_build_object(
    'confirmations', case
      when p_state = 'confirmations' then 'open'
      when v_index > array_position(v_states, 'confirmations') then 'locked'
      else 'not_started'
    end,
    'submissions', case
      when p_state = 'submissions' then 'open'
      when v_index > array_position(v_states, 'submissions') then 'locked'
      else 'not_started'
    end,
    'juryVoting', case
      when p_state = 'jury_voting' then 'open'
      when v_index > array_position(v_states, 'jury_voting') then 'locked'
      else 'not_started'
    end,
    'televoting', case
      when p_state = 'televoting' then 'open'
      when v_index > array_position(v_states, 'televoting') then 'locked'
      else 'not_started'
    end,
    'results', case
      when v_index >= array_position(v_states, 'results') then 'published'
      else 'not_started'
    end,
    'predictions', case
      when p_state in ('confirmations', 'submissions', 'pre_show', 'rehearsals') then 'open'
      when v_index >= array_position(v_states, 'jury_voting') then 'locked'
      else 'not_started'
    end
  );
end
$$;

create or replace function private.studio2_transition_risk(p_from text, p_to text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case p_from || '->' || p_to
    when 'vote_verification->televoting' then 'critical'
    when 'results->vote_verification' then 'critical'
    when 'post_edition->results' then 'critical'
    when 'host_selection->planning' then 'elevated'
    when 'confirmations->planning' then 'elevated'
    when 'submissions->confirmations' then 'elevated'
    when 'pre_show->submissions' then 'elevated'
    when 'rehearsals->pre_show' then 'elevated'
    when 'jury_voting->rehearsals' then 'elevated'
    when 'live_show->jury_voting' then 'elevated'
    when 'televoting->live_show' then 'elevated'
    when 'draft->planning' then 'normal'
    when 'planning->host_selection' then 'normal'
    when 'planning->confirmations' then 'normal'
    when 'host_selection->confirmations' then 'normal'
    when 'confirmations->submissions' then 'normal'
    when 'submissions->pre_show' then 'normal'
    when 'pre_show->rehearsals' then 'normal'
    when 'rehearsals->jury_voting' then 'normal'
    when 'jury_voting->live_show' then 'normal'
    when 'live_show->televoting' then 'normal'
    when 'televoting->vote_verification' then 'normal'
    when 'vote_verification->results' then 'normal'
    when 'results->post_edition' then 'normal'
    when 'post_edition->archived' then 'normal'
    else null
  end
$$;

create or replace function private.studio2_incident_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select (p_from || '->' || p_to) in (
    'open->mitigating', 'open->monitoring', 'open->resolved',
    'mitigating->monitoring', 'mitigating->resolved',
    'monitoring->mitigating', 'monitoring->resolved'
  )
$$;

create or replace function private.studio2_user_has_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.studio2_capability_grants g
    where g.user_id = p_user_id
      and g.capability = p_capability
      and (g.expires_at is null or g.expires_at > now())
      and (
        g.edition_id is null
        or (p_edition_id is not null and g.edition_id = p_edition_id)
      )
  )
$$;

create or replace function public.studio2_has_capability(
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_has_capability(auth.uid(), p_capability, p_edition_id)
$$;

create or replace function private.studio2_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger studio2_edition_runtime_touch_updated_at
before update on public.studio2_edition_runtime
for each row execute function private.studio2_touch_updated_at();

create trigger studio2_incidents_touch_updated_at
before update on public.studio2_incidents
for each row execute function private.studio2_touch_updated_at();

insert into public.studio2_edition_runtime (edition_id, state, subsystems)
select
  e.id,
  private.studio2_normalize_legacy_edition_status(e.status),
  private.studio2_default_subsystems(private.studio2_normalize_legacy_edition_status(e.status))
from public.editions e
on conflict (edition_id) do nothing;

create or replace function private.studio2_seed_edition_runtime()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_state text;
begin
  v_state := private.studio2_normalize_legacy_edition_status(new.status);

  insert into public.studio2_edition_runtime (edition_id, state, subsystems)
  values (new.id, v_state, private.studio2_default_subsystems(v_state))
  on conflict (edition_id) do nothing;

  return new;
end
$$;

create trigger studio2_seed_edition_runtime_after_insert
after insert on public.editions
for each row execute function private.studio2_seed_edition_runtime();

alter table public.studio2_edition_runtime enable row level security;
alter table public.studio2_contest_events enable row level security;
alter table public.studio2_capability_grants enable row level security;
alter table public.studio2_incidents enable row level security;

revoke all on table public.studio2_edition_runtime from public, anon, authenticated;
revoke all on table public.studio2_contest_events from public, anon, authenticated;
revoke all on table public.studio2_capability_grants from public, anon, authenticated;
revoke all on table public.studio2_incidents from public, anon, authenticated;

grant select on table public.studio2_edition_runtime to authenticated;
grant select on table public.studio2_contest_events to authenticated;
grant select on table public.studio2_capability_grants to authenticated;
grant select on table public.studio2_incidents to authenticated;

grant all on table public.studio2_edition_runtime to service_role;
grant all on table public.studio2_contest_events to service_role;
grant all on table public.studio2_capability_grants to service_role;
grant all on table public.studio2_incidents to service_role;

create policy studio2_edition_runtime_read
on public.studio2_edition_runtime
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.studio2_has_capability('edition.read', edition_id)
  or public.studio2_has_capability('edition.manage', edition_id)
);

create policy studio2_contest_events_read
on public.studio2_contest_events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.studio2_has_capability('edition.read', edition_id)
  or public.studio2_has_capability('edition.manage', edition_id)
);

create policy studio2_capability_grants_read
on public.studio2_capability_grants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.has_role((select auth.uid()), 'organizer'::public.app_role)
);

create policy studio2_incidents_read
on public.studio2_incidents
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.studio2_has_capability('incident.manage', edition_id)
  or public.studio2_has_capability('integrity.read', edition_id)
);

revoke all on function private.studio2_normalize_legacy_edition_status(text) from public, anon, authenticated;
revoke all on function private.studio2_default_subsystems(text) from public, anon, authenticated;
revoke all on function private.studio2_transition_risk(text, text) from public, anon, authenticated;
revoke all on function private.studio2_incident_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function private.studio2_user_has_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.studio2_touch_updated_at() from public, anon, authenticated;
revoke all on function private.studio2_seed_edition_runtime() from public, anon, authenticated;

revoke all on function public.studio2_has_capability(text, uuid) from public, anon, authenticated;
grant execute on function public.studio2_has_capability(text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
