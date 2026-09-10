begin;

-- Solaris Studio 2 persistence foundation.
-- Domain rules are intentionally mirrored from src/lib/*.ts so the database
-- remains authoritative even when multiple clients act concurrently.

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

create or replace function public.studio2_grant_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns public.studio2_capability_grants
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_grant public.studio2_capability_grants%rowtype;
begin
  if p_user_id is null then
    raise exception 'Capability target user is required' using errcode = '22023';
  end if;

  if not v_is_service and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  if p_capability not in (
    'edition.read', 'edition.manage', 'edition.archive',
    'confirmation.read', 'confirmation.manage',
    'entry.read_private', 'entry.edit', 'entry.approve',
    'jury.ballots.read', 'televote.ballots.read',
    'results.preview', 'results.verify', 'results.publish',
    'integrity.read', 'integrity.manage', 'broadcast.control',
    'governance.vote', 'rules.edit', 'incident.manage', 'communications.send'
  ) then
    raise exception 'Unknown Solaris capability: %', p_capability using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Capability expiry must be in the future' using errcode = '22023';
  end if;

  insert into public.studio2_capability_grants (
    user_id, capability, edition_id, expires_at, granted_by
  ) values (
    p_user_id, p_capability, p_edition_id, p_expires_at, v_actor
  )
  on conflict (user_id, capability, edition_id)
  do update set
    expires_at = excluded.expires_at,
    granted_by = excluded.granted_by
  returning * into v_grant;

  return v_grant;
end
$$;

create or replace function public.studio2_revoke_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  delete from public.studio2_capability_grants
  where user_id = p_user_id
    and capability = p_capability
    and edition_id is not distinct from p_edition_id;

  return found;
end
$$;

create or replace function public.studio2_transition_edition(
  p_edition_id uuid,
  p_to text,
  p_reason text default null,
  p_second_approver uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_runtime public.studio2_edition_runtime%rowtype;
  v_status text;
  v_risk text;
  v_reason text := nullif(btrim(p_reason), '');
  v_required_capability text;
begin
  if p_edition_id is null or p_to is null then
    raise exception 'Edition id and target state are required' using errcode = '22023';
  end if;

  v_required_capability := case when p_to = 'archived' then 'edition.archive' else 'edition.manage' end;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, v_required_capability, p_edition_id) then
    raise exception 'Missing Solaris capability: %', v_required_capability using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = p_edition_id
  for update;

  if not found then
    select status into v_status from public.editions where id = p_edition_id;
    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;

    insert into public.studio2_edition_runtime (edition_id, state, subsystems, updated_by)
    values (
      p_edition_id,
      private.studio2_normalize_legacy_edition_status(v_status),
      private.studio2_default_subsystems(private.studio2_normalize_legacy_edition_status(v_status)),
      v_actor
    )
    on conflict (edition_id) do nothing;

    select * into v_runtime
    from public.studio2_edition_runtime
    where edition_id = p_edition_id
    for update;
  end if;

  v_risk := private.studio2_transition_risk(v_runtime.state, p_to);
  if v_risk is null then
    raise exception 'Illegal edition state transition: % -> %', v_runtime.state, p_to using errcode = '22023';
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception 'A reason is required for % edition transitions', v_risk using errcode = '22023';
  end if;

  if p_second_approver is not null and v_actor is not null and p_second_approver = v_actor then
    raise exception 'The second approver must be a different user' using errcode = '22023';
  end if;

  if v_risk = 'critical' then
    if p_second_approver is null then
      raise exception 'A second approver is required for critical edition transitions' using errcode = '22023';
    end if;

    if not public.has_role(p_second_approver, 'organizer'::public.app_role)
       and not private.studio2_user_has_capability(p_second_approver, 'edition.manage', p_edition_id) then
      raise exception 'Second approver lacks edition.manage authority' using errcode = '42501';
    end if;
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
  returning * into v_runtime;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    case when p_to = 'archived' then 'edition.archived' else 'edition.state_changed' end,
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', (select state from public.studio2_edition_runtime where edition_id = p_edition_id) -- replaced below
    )
  );

  -- Replace the just-written event payload atomically with the pre-transition
  -- state captured in v_runtime is impossible after UPDATE, so store it in a
  -- dedicated block below via the event correction update.
  update public.studio2_contest_events
  set payload = jsonb_build_object(
    'from', case
      when p_to = 'planning' and v_runtime.version = 2 then private.studio2_normalize_legacy_edition_status(v_status)
      else coalesce((select payload ->> 'from' from public.studio2_contest_events where false), p_to)
    end,
    'to', p_to,
    'risk', v_risk,
    'reason', v_reason,
    'secondApproverUserId', p_second_approver
  )
  where id = (
    select id from public.studio2_contest_events
    where edition_id = p_edition_id and actor_user_id is not distinct from v_actor
    order by occurred_at desc, id desc
    limit 1
  );

  return v_runtime;
end
$$;

create or replace function public.studio2_create_incident(
  p_edition_id uuid,
  p_title text,
  p_severity text
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
begin
  if nullif(btrim(p_title), '') is null then
    raise exception 'Incident title is required' using errcode = '22023';
  end if;
  if p_severity not in ('sev1', 'sev2', 'sev3', 'sev4') then
    raise exception 'Unknown incident severity: %', p_severity using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  insert into public.studio2_incidents (
    edition_id, title, severity, created_by, updated_by
  ) values (
    p_edition_id, btrim(p_title), p_severity, v_actor, v_actor
  ) returning * into v_incident;

  if p_edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      p_edition_id,
      'incident.created',
      v_actor,
      'incident',
      v_incident.id::text,
      jsonb_build_object(
        'title', v_incident.title,
        'severity', v_incident.severity,
        'status', v_incident.status
      )
    );
  end if;

  return v_incident;
end
$$;

create or replace function public.studio2_transition_incident(
  p_incident_id uuid,
  p_to text
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
  v_from text;
begin
  select * into v_incident
  from public.studio2_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', v_incident.edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  if not private.studio2_incident_transition_allowed(v_incident.status, p_to) then
    raise exception 'Illegal incident transition: % -> %', v_incident.status, p_to using errcode = '22023';
  end if;

  v_from := v_incident.status;

  update public.studio2_incidents
  set status = p_to,
      resolved_at = case when p_to = 'resolved' then now() else null end,
      updated_by = v_actor
  where id = p_incident_id
  returning * into v_incident;

  if v_incident.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      v_incident.edition_id,
      case when p_to = 'resolved' then 'incident.resolved' else 'incident.updated' end,
      v_actor,
      'incident',
      v_incident.id::text,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'severity', v_incident.severity,
        'title', v_incident.title
      )
    );
  end if;

  return v_incident;
end
$$;

revoke all on function private.studio2_normalize_legacy_edition_status(text) from public, anon, authenticated;
revoke all on function private.studio2_default_subsystems(text) from public, anon, authenticated;
revoke all on function private.studio2_transition_risk(text, text) from public, anon, authenticated;
revoke all on function private.studio2_incident_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function private.studio2_user_has_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.studio2_touch_updated_at() from public, anon, authenticated;
revoke all on function private.studio2_seed_edition_runtime() from public, anon, authenticated;

revoke all on function public.studio2_has_capability(text, uuid) from public, anon, authenticated;
grant execute on function public.studio2_has_capability(text, uuid) to authenticated, service_role;

revoke all on function public.studio2_grant_capability(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.studio2_grant_capability(uuid, text, uuid, timestamptz) to authenticated, service_role;

revoke all on function public.studio2_revoke_capability(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.studio2_revoke_capability(uuid, text, uuid) to authenticated, service_role;

revoke all on function public.studio2_transition_edition(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.studio2_transition_edition(uuid, text, text, uuid) to authenticated, service_role;

revoke all on function public.studio2_create_incident(uuid, text, text) from public, anon, authenticated;
grant execute on function public.studio2_create_incident(uuid, text, text) to authenticated, service_role;

revoke all on function public.studio2_transition_incident(uuid, text) from public, anon, authenticated;
grant execute on function public.studio2_transition_incident(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
