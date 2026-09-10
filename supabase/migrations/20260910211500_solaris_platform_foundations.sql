-- Solaris Studio platform foundations
--
-- This migration introduces the shared runtime primitives used by the future
-- Control Room, HOD workspace, rules/governance, incident management,
-- simulator, archive and contextual home experiences.
--
-- Deliberately does NOT replace editions.status. Existing code still relies on
-- the legacy active/completed-style values, so runtime phase is layered beside
-- it and can be adopted feature-by-feature.

-- ---------------------------------------------------------------------------
-- Shared validation helpers
-- ---------------------------------------------------------------------------

create or replace function public.platform_valid_edition_phase(p_phase text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_phase = any (array[
    'draft',
    'planning',
    'host_selection',
    'confirmations',
    'submissions',
    'pre_show',
    'rehearsals',
    'jury_voting',
    'live_show',
    'televoting',
    'vote_verification',
    'results',
    'post_edition',
    'archived'
  ]::text[]);
$$;

create or replace function public.platform_edition_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_from = p_to then true
    when p_from = 'draft' and p_to = 'planning' then true
    when p_from = 'planning' and p_to in ('host_selection', 'confirmations') then true
    when p_from = 'host_selection' and p_to = 'confirmations' then true
    when p_from = 'confirmations' and p_to = 'submissions' then true
    when p_from = 'submissions' and p_to = 'pre_show' then true
    when p_from = 'pre_show' and p_to in ('rehearsals', 'jury_voting') then true
    when p_from = 'rehearsals' and p_to = 'jury_voting' then true
    when p_from = 'jury_voting' and p_to = 'live_show' then true
    when p_from = 'live_show' and p_to in ('televoting', 'vote_verification') then true
    when p_from = 'televoting' and p_to = 'vote_verification' then true
    -- Verification may explicitly reopen televoting after an incident.
    when p_from = 'vote_verification' and p_to in ('televoting', 'results') then true
    -- Results may be returned to verification before final publication.
    when p_from = 'results' and p_to in ('vote_verification', 'post_edition') then true
    when p_from = 'post_edition' and p_to = 'archived' then true
    else false
  end;
$$;

create or replace function public.platform_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Edition runtime state
-- ---------------------------------------------------------------------------

create table if not exists public.edition_runtime_state (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  phase text not null default 'planning'
    check (public.platform_valid_edition_phase(phase)),
  confirmations_state text not null default 'not_started'
    check (confirmations_state in ('not_started', 'open', 'closed', 'locked')),
  submissions_state text not null default 'not_started'
    check (submissions_state in ('not_started', 'open', 'closed', 'locked')),
  jury_voting_state text not null default 'not_started'
    check (jury_voting_state in ('not_started', 'open', 'closed', 'locked')),
  televoting_state text not null default 'not_started'
    check (televoting_state in ('not_started', 'open', 'closed', 'locked')),
  results_state text not null default 'hidden'
    check (results_state in ('hidden', 'calculating', 'verification', 'verified', 'published')),
  version bigint not null default 1 check (version > 0),
  last_transition_at timestamptz,
  last_transition_by uuid,
  last_transition_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger edition_runtime_state_touch_updated_at
before update on public.edition_runtime_state
for each row execute function public.platform_touch_updated_at();

alter table public.edition_runtime_state enable row level security;

grant select on public.edition_runtime_state to authenticated;
grant all on public.edition_runtime_state to service_role;

create policy "organizers read edition runtime state"
on public.edition_runtime_state
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role));

-- Runtime writes intentionally happen through RPCs below. This keeps state
-- transitions server-validated instead of trusting whichever button was clicked.

-- ---------------------------------------------------------------------------
-- Append-only platform event stream
-- ---------------------------------------------------------------------------

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  event_type text not null check (length(btrim(event_type)) > 0),
  actor_id uuid,
  entity_type text,
  entity_id text,
  source text not null default 'solaris_studio',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists platform_events_edition_time_idx
  on public.platform_events (edition_id, occurred_at desc);
create index if not exists platform_events_type_time_idx
  on public.platform_events (event_type, occurred_at desc);
create index if not exists platform_events_entity_idx
  on public.platform_events (entity_type, entity_id, occurred_at desc);

alter table public.platform_events enable row level security;

grant select on public.platform_events to authenticated;
grant all on public.platform_events to service_role;

create policy "organizers read platform events"
on public.platform_events
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role));

-- There is intentionally no authenticated INSERT/UPDATE/DELETE policy. Events
-- are emitted by trusted RPCs/services and are append-only from the app.

-- ---------------------------------------------------------------------------
-- Capability layer on top of the existing organizer/viewer roles
-- ---------------------------------------------------------------------------

create table if not exists public.platform_capabilities (
  key text primary key,
  description text not null,
  risk_level text not null default 'normal'
    check (risk_level in ('normal', 'elevated', 'critical')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  capability_key text not null references public.platform_capabilities(key) on delete cascade,
  edition_id uuid references public.editions(id) on delete cascade,
  granted_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists user_capability_grants_global_unique
  on public.user_capability_grants (user_id, capability_key)
  where edition_id is null;
create unique index if not exists user_capability_grants_edition_unique
  on public.user_capability_grants (user_id, capability_key, edition_id)
  where edition_id is not null;
create index if not exists user_capability_grants_user_idx
  on public.user_capability_grants (user_id, edition_id, expires_at);

insert into public.platform_capabilities (key, description, risk_level)
values
  ('edition.manage', 'Manage edition configuration and runtime state.', 'elevated'),
  ('edition.archive', 'Create or finalize immutable edition archives.', 'critical'),
  ('confirmation.manage', 'Manage confirmation workflows and rounds.', 'normal'),
  ('entry.manage', 'Manage participant entries and submission state.', 'normal'),
  ('jury.ballots.read', 'Read confidential jury ballots.', 'critical'),
  ('televote.ballots.read', 'Read confidential televote ballots.', 'critical'),
  ('results.preview', 'Preview unpublished contest results.', 'critical'),
  ('results.verify', 'Verify calculated contest results.', 'critical'),
  ('results.publish', 'Publish official contest results.', 'critical'),
  ('integrity.read', 'Read integrity signals and investigations.', 'elevated'),
  ('integrity.manage', 'Manage integrity cases and rulings.', 'critical'),
  ('broadcast.control', 'Operate live broadcast state and cues.', 'elevated'),
  ('rules.manage', 'Manage structured contest rules.', 'elevated'),
  ('governance.manage', 'Manage proposals, amendments and votes.', 'elevated'),
  ('workflow.manage', 'Manage operational workflows and tasks.', 'normal'),
  ('feature_flags.manage', 'Manage platform feature rollouts.', 'elevated')
on conflict (key) do update
set description = excluded.description,
    risk_level = excluded.risk_level;

alter table public.platform_capabilities enable row level security;
alter table public.user_capability_grants enable row level security;

grant select on public.platform_capabilities to authenticated;
grant select on public.user_capability_grants to authenticated;
grant all on public.platform_capabilities to service_role;
grant all on public.user_capability_grants to service_role;

create policy "authenticated read capability definitions"
on public.platform_capabilities
for select
to authenticated
using (true);

create policy "users read own capability grants"
on public.user_capability_grants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

create policy "organizers manage capability grants"
on public.user_capability_grants
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create or replace function public.has_platform_capability(
  p_user_id uuid,
  p_capability_key text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and (
      public.has_role(p_user_id, 'organizer'::public.app_role)
      or exists (
        select 1
        from public.user_capability_grants g
        where g.user_id = p_user_id
          and g.capability_key = p_capability_key
          and (g.expires_at is null or g.expires_at > now())
          and (g.edition_id is null or g.edition_id = p_edition_id)
      )
    );
$$;

grant execute on function public.has_platform_capability(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Feature flags with global, edition and user overrides
-- ---------------------------------------------------------------------------

create table if not exists public.platform_feature_flags (
  key text primary key,
  description text not null,
  enabled_by_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.platform_feature_flags(key) on delete cascade,
  edition_id uuid references public.editions(id) on delete cascade,
  user_id uuid,
  enabled boolean not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (edition_id is not null or user_id is not null)
);

create unique index if not exists platform_feature_override_scope_unique
on public.platform_feature_flag_overrides (
  flag_key,
  coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create trigger platform_feature_flags_touch_updated_at
before update on public.platform_feature_flags
for each row execute function public.platform_touch_updated_at();

create trigger platform_feature_flag_overrides_touch_updated_at
before update on public.platform_feature_flag_overrides
for each row execute function public.platform_touch_updated_at();

insert into public.platform_feature_flags (key, description, enabled_by_default)
values
  ('edition_runtime_state', 'Edition State Engine and runtime phase controls.', false),
  ('live_control_room', 'SSC Live Control Room.', false),
  ('edition_simulator', 'Edition digital-twin simulator and scenario runner.', false),
  ('voting_laboratory', 'Voting-system laboratory.', false),
  ('hod_workspace_v2', 'Next-generation Head of Delegation workspace.', false),
  ('results_replay', 'Interactive results replay and forensics.', false),
  ('structured_rules', 'Structured contest rules and dependency graph.', false),
  ('public_encyclopedia', 'Expanded public SSC encyclopedia.', false),
  ('broadcast_rundown', 'Broadcast rundown and cue control.', false),
  ('time_machine', 'Historical runtime reconstruction.', false)
on conflict (key) do update
set description = excluded.description;

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_overrides enable row level security;

grant select on public.platform_feature_flags to authenticated;
grant select on public.platform_feature_flag_overrides to authenticated;
grant all on public.platform_feature_flags to service_role;
grant all on public.platform_feature_flag_overrides to service_role;

create policy "authenticated read platform feature flags"
on public.platform_feature_flags
for select
to authenticated
using (true);

create policy "users read applicable feature flag overrides"
on public.platform_feature_flag_overrides
for select
to authenticated
using (
  user_id = auth.uid()
  or user_id is null
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

create policy "organizers manage platform feature flags"
on public.platform_feature_flags
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create policy "organizers manage platform feature flag overrides"
on public.platform_feature_flag_overrides
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create or replace function public.platform_feature_enabled(
  p_flag_key text,
  p_edition_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_default boolean;
  v_enabled boolean;
  v_user_id uuid := auth.uid();
begin
  select enabled_by_default
    into v_default
  from public.platform_feature_flags
  where key = p_flag_key;

  if not found then
    return false;
  end if;

  select o.enabled
    into v_enabled
  from public.platform_feature_flag_overrides o
  where o.flag_key = p_flag_key
    and (o.edition_id is null or o.edition_id = p_edition_id)
    and (o.user_id is null or o.user_id = v_user_id)
  order by
    case
      when o.user_id = v_user_id and o.edition_id = p_edition_id then 4
      when o.user_id = v_user_id and o.edition_id is null then 3
      when o.user_id is null and o.edition_id = p_edition_id then 2
      else 1
    end desc,
    o.updated_at desc
  limit 1;

  return coalesce(v_enabled, v_default);
end;
$$;

grant execute on function public.platform_feature_enabled(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic workflow engine
-- ---------------------------------------------------------------------------

create table if not exists public.platform_workflows (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  workflow_key text not null,
  name text not null,
  workflow_type text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'blocked', 'completed', 'cancelled')),
  context jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, workflow_key)
);

create table if not exists public.platform_workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.platform_workflows(id) on delete cascade,
  stage_key text not null,
  name text not null,
  sort_order integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'blocked', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, stage_key)
);

create table if not exists public.platform_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.platform_workflows(id) on delete cascade,
  stage_id uuid references public.platform_workflow_stages(id) on delete set null,
  task_key text not null,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  assigned_user_id uuid,
  due_at timestamptz,
  completed_at timestamptz,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, task_key)
);

create table if not exists public.platform_workflow_task_dependencies (
  task_id uuid not null references public.platform_workflow_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.platform_workflow_tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index if not exists platform_workflows_edition_idx
  on public.platform_workflows (edition_id, status);
create index if not exists platform_workflow_tasks_due_idx
  on public.platform_workflow_tasks (workflow_id, status, due_at);
create index if not exists platform_workflow_tasks_assignee_idx
  on public.platform_workflow_tasks (assigned_user_id, status, due_at);

create trigger platform_workflows_touch_updated_at
before update on public.platform_workflows
for each row execute function public.platform_touch_updated_at();
create trigger platform_workflow_stages_touch_updated_at
before update on public.platform_workflow_stages
for each row execute function public.platform_touch_updated_at();
create trigger platform_workflow_tasks_touch_updated_at
before update on public.platform_workflow_tasks
for each row execute function public.platform_touch_updated_at();

alter table public.platform_workflows enable row level security;
alter table public.platform_workflow_stages enable row level security;
alter table public.platform_workflow_tasks enable row level security;
alter table public.platform_workflow_task_dependencies enable row level security;

grant all on public.platform_workflows to authenticated, service_role;
grant all on public.platform_workflow_stages to authenticated, service_role;
grant all on public.platform_workflow_tasks to authenticated, service_role;
grant all on public.platform_workflow_task_dependencies to authenticated, service_role;

create policy "organizers manage platform workflows"
on public.platform_workflows
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create policy "organizers manage platform workflow stages"
on public.platform_workflow_stages
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create policy "organizers manage platform workflow tasks"
on public.platform_workflow_tasks
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create policy "organizers manage platform workflow dependencies"
on public.platform_workflow_task_dependencies
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

-- ---------------------------------------------------------------------------
-- Trusted edition state mutations
-- ---------------------------------------------------------------------------

create or replace function public.initialize_edition_runtime_state(
  p_edition_id uuid,
  p_phase text default 'planning',
  p_reason text default null
)
returns public.edition_runtime_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.edition_runtime_state;
begin
  if auth.uid() is null
     or not public.has_platform_capability(auth.uid(), 'edition.manage', p_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  if not public.platform_valid_edition_phase(p_phase) then
    raise exception 'Invalid edition runtime phase: %', p_phase using errcode = '22023';
  end if;

  if not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  insert into public.edition_runtime_state (
    edition_id,
    phase,
    last_transition_at,
    last_transition_by,
    last_transition_reason
  ) values (
    p_edition_id,
    p_phase,
    now(),
    auth.uid(),
    p_reason
  )
  on conflict (edition_id) do nothing
  returning * into v_row;

  if v_row.edition_id is null then
    raise exception 'Edition runtime state is already initialized' using errcode = '23505';
  end if;

  insert into public.platform_events (
    edition_id,
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'EDITION_RUNTIME_INITIALIZED',
    auth.uid(),
    'edition',
    p_edition_id::text,
    jsonb_build_object('phase', p_phase, 'reason', p_reason)
  );

  return v_row;
end;
$$;

create or replace function public.transition_edition_runtime_state(
  p_edition_id uuid,
  p_target_phase text,
  p_reason text default null
)
returns public.edition_runtime_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.edition_runtime_state;
  v_after public.edition_runtime_state;
begin
  if auth.uid() is null
     or not public.has_platform_capability(auth.uid(), 'edition.manage', p_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  if not public.platform_valid_edition_phase(p_target_phase) then
    raise exception 'Invalid edition runtime phase: %', p_target_phase using errcode = '22023';
  end if;

  select * into v_before
  from public.edition_runtime_state
  where edition_id = p_edition_id
  for update;

  if not found then
    raise exception 'Edition runtime state is not initialized' using errcode = 'P0002';
  end if;

  if not public.platform_edition_transition_allowed(v_before.phase, p_target_phase) then
    raise exception 'Illegal edition transition: % -> %', v_before.phase, p_target_phase
      using errcode = '22023';
  end if;

  if v_before.phase = p_target_phase then
    return v_before;
  end if;

  update public.edition_runtime_state
  set phase = p_target_phase,
      version = version + 1,
      last_transition_at = now(),
      last_transition_by = auth.uid(),
      last_transition_reason = p_reason
  where edition_id = p_edition_id
  returning * into v_after;

  insert into public.platform_events (
    edition_id,
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'EDITION_PHASE_CHANGED',
    auth.uid(),
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_before.phase,
      'to', v_after.phase,
      'version', v_after.version,
      'reason', p_reason
    )
  );

  -- Reuse Solaris' canonical organizer audit trail when it is present. Dynamic
  -- SQL keeps this migration compatible with older local databases where that
  -- table may not yet exist.
  if to_regclass('public.admin_audit_log') is not null then
    execute $audit$
      insert into public.admin_audit_log (
        actor_id,
        action,
        table_name,
        record_id,
        edition_id,
        before_data,
        after_data
      ) values ($1, $2, $3, $4, $5, $6, $7)
    $audit$
    using
      auth.uid(),
      'transition_edition_runtime_state',
      'edition_runtime_state',
      p_edition_id::text,
      p_edition_id,
      to_jsonb(v_before),
      to_jsonb(v_after);
  end if;

  return v_after;
end;
$$;

grant execute on function public.initialize_edition_runtime_state(uuid, text, text) to authenticated;
grant execute on function public.transition_edition_runtime_state(uuid, text, text) to authenticated;

comment on table public.edition_runtime_state is
  'Canonical lifecycle state for an SSC edition. Layered beside legacy editions.status during migration.';
comment on table public.platform_events is
  'Append-only event stream for contest runtime actions, timelines, replay and historical reconstruction.';
comment on function public.transition_edition_runtime_state(uuid, text, text) is
  'Performs a server-validated edition lifecycle transition and emits an append-only platform event.';
