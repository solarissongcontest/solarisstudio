begin;

-- Solaris Studio 2 persistence is intentionally additive. Existing contest,
-- voting and publication tables remain authoritative until individual Studio 2
-- systems are enabled behind feature flags.

create schema if not exists private;

create table public.edition_runtime_state (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  state text not null check (state in (
    'draft', 'planning', 'host_selection', 'confirmations', 'submissions',
    'pre_show', 'rehearsals', 'jury_voting', 'live_show', 'televoting',
    'vote_verification', 'results', 'post_edition', 'archived'
  )),
  revision bigint not null default 0 check (revision >= 0),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table public.edition_subsystem_states (
  edition_id uuid not null references public.editions(id) on delete cascade,
  subsystem text not null check (subsystem in (
    'confirmations', 'submissions', 'juryVoting', 'televoting', 'results', 'predictions'
  )),
  state text not null check (state in (
    'not_started', 'open', 'paused', 'closed', 'locked', 'verified', 'published'
  )),
  revision bigint not null default 0 check (revision >= 0),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (edition_id, subsystem)
);

create table public.contest_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'edition.state_changed', 'edition.subsystem_changed',
    'host.selected', 'host.accepted', 'host.declined',
    'confirmation.opened', 'confirmation.submitted', 'confirmation.approved',
    'submission.started', 'submission.submitted', 'submission.approved',
    'submission.rejected', 'submission.exception_granted', 'submission.exception_expired',
    'jury.opened', 'jury.ballot_submitted', 'jury.locked',
    'televote.opened', 'televote.paused', 'televote.resumed',
    'televote.ballot_submitted', 'televote.closed',
    'results.computed', 'results.locked', 'results.published',
    'show.started', 'show.segment_started', 'show.segment_completed', 'show.completed',
    'incident.created', 'incident.updated', 'incident.resolved',
    'communication.sent', 'communication.acknowledged',
    'archive.snapshot_created', 'archive.restored',
    'feature_flag.changed', 'permission.granted', 'permission.revoked'
  )),
  edition_id uuid references public.editions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object')
);

create index contest_events_edition_time_idx
  on public.contest_events (edition_id, occurred_at desc, id);
create index contest_events_type_time_idx
  on public.contest_events (event_type, occurred_at desc);

create table public.capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in (
    'edition.read', 'edition.manage', 'rules.manage', 'participants.manage',
    'submissions.manage', 'submissions.approve', 'jury.manage', 'jury.lock',
    'televote.manage', 'televote.lock', 'results.compute', 'results.publish',
    'broadcast.manage', 'incidents.manage', 'communications.send', 'users.manage',
    'archive.restore', 'experiments.run'
  )),
  edition_id uuid references public.editions(id) on delete cascade,
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

create unique index capability_grants_unique_scope_idx
  on public.capability_grants (user_id, capability, edition_id) nulls not distinct;
create index capability_grants_user_idx
  on public.capability_grants (user_id, edition_id, expires_at);

create table public.feature_flag_rules (
  key text primary key check (key in (
    'edition_state_engine', 'contest_event_engine', 'permission_engine_v2',
    'workflow_engine', 'official_communications', 'hod_workspace_v2',
    'live_control_room', 'incident_command', 'broadcast_rundown',
    'results_replay', 'voting_lab', 'edition_simulator', 'rules_engine',
    'public_encyclopedia', 'country_voting_dna', 'prediction_league',
    'fantasy_ssc', 'time_machine', 'solaris_command_assistant'
  )),
  enabled boolean not null default false,
  admins_only boolean not null default false,
  user_ids uuid[] not null default '{}'::uuid[],
  edition_ids uuid[] not null default '{}'::uuid[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flag_rules (key, enabled)
select key, false
from unnest(array[
  'edition_state_engine', 'contest_event_engine', 'permission_engine_v2',
  'workflow_engine', 'official_communications', 'hod_workspace_v2',
  'live_control_room', 'incident_command', 'broadcast_rundown',
  'results_replay', 'voting_lab', 'edition_simulator', 'rules_engine',
  'public_encyclopedia', 'country_voting_dna', 'prediction_league',
  'fantasy_ssc', 'time_machine', 'solaris_command_assistant'
]::text[]) as flags(key);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  country_id uuid references public.countries(id) on delete cascade,
  workflow_type text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workflow_instances_edition_country_idx
  on public.workflow_instances (edition_id, country_id, status, updated_at desc);

create table public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  task_key text not null,
  label text not null,
  status text not null default 'pending' check (status in (
    'pending', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled'
  )),
  required boolean not null default true,
  depends_on text[] not null default '{}'::text[],
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_instance_id, task_key)
);

create index workflow_tasks_instance_status_idx
  on public.workflow_tasks (workflow_instance_id, status, sort_order);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete set null,
  severity text not null check (severity in ('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4')),
  title text not null,
  summary text,
  status text not null default 'investigating' check (status in (
    'investigating', 'identified', 'monitoring', 'resolved'
  )),
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'resolved' and resolved_at is not null) or status <> 'resolved')
);

create index incidents_edition_status_idx
  on public.incidents (edition_id, status, severity, updated_at desc);

create table public.official_notices (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete set null,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in (
    'info', 'action_required', 'urgent', 'critical'
  )),
  audience text not null check (audience in (
    'all_delegations', 'specific_countries', 'jurors', 'hods', 'staff', 'press'
  )),
  country_ids uuid[] not null default '{}'::uuid[],
  acknowledgement_required boolean not null default false,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index official_notices_edition_sent_idx
  on public.official_notices (edition_id, sent_at desc, created_at desc);

create table public.official_notice_receipts (
  notice_id uuid not null references public.official_notices(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  primary key (notice_id, recipient_user_id)
);

create index official_notice_receipts_user_idx
  on public.official_notice_receipts (recipient_user_id, acknowledged_at, opened_at);

-- Capability lookup is kept outside the exposed public API schema. Organizer
-- accounts retain full compatibility access while scoped grants can be added for
-- narrower Studio 2 roles.
create or replace function private.solaris_user_has_capability(
  _user_id uuid,
  _capability text,
  _edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    _user_id is not null
    and (
      public.has_role(_user_id, 'organizer'::public.app_role)
      or exists (
        select 1
        from public.capability_grants cg
        where cg.user_id = _user_id
          and cg.capability = _capability
          and (cg.edition_id is null or _edition_id is null or cg.edition_id = _edition_id)
          and (cg.expires_at is null or cg.expires_at > pg_catalog.now())
      )
    );
$$;

create or replace function private.solaris_controls_country(
  _user_id uuid,
  _country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    _user_id is not null
    and _country_id is not null
    and (
      public.has_role(_user_id, 'organizer'::public.app_role)
      or exists (
        select 1
        from public.country_accounts ca
        where ca.user_id = _user_id
          and ca.country_id = _country_id
          and coalesce(ca.status, 'active') = 'active'
      )
    );
$$;

revoke all on function private.solaris_user_has_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.solaris_controls_country(uuid, uuid) from public, anon, authenticated;

-- RLS is enabled before any Data API privileges are granted.
alter table public.edition_runtime_state enable row level security;
alter table public.edition_subsystem_states enable row level security;
alter table public.contest_events enable row level security;
alter table public.capability_grants enable row level security;
alter table public.feature_flag_rules enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.incidents enable row level security;
alter table public.official_notices enable row level security;
alter table public.official_notice_receipts enable row level security;

create policy "Studio2 runtime readable by capable users"
on public.edition_runtime_state for select to authenticated
using (private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id));

create policy "Studio2 subsystem state readable by capable users"
on public.edition_subsystem_states for select to authenticated
using (private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id));

create policy "Studio2 events readable by capable users"
on public.contest_events for select to authenticated
using (
  edition_id is not null
  and private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id)
);

create policy "Users can read own capability grants"
on public.capability_grants for select to authenticated
using (
  user_id = (select auth.uid())
  or private.solaris_user_has_capability((select auth.uid()), 'users.manage', edition_id)
);

create policy "Organizers can read Studio2 feature flags"
on public.feature_flag_rules for select to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role));

create policy "Workflow instances visible to capable users or country owners"
on public.workflow_instances for select to authenticated
using (
  (edition_id is not null and private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id))
  or (country_id is not null and private.solaris_controls_country((select auth.uid()), country_id))
);

create policy "Workflow tasks follow workflow visibility"
on public.workflow_tasks for select to authenticated
using (
  exists (
    select 1
    from public.workflow_instances wi
    where wi.id = workflow_instance_id
  )
);

create policy "Incidents readable by edition-capable users"
on public.incidents for select to authenticated
using (
  edition_id is not null
  and private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id)
);

create policy "Official notices readable by staff or recipients"
on public.official_notices for select to authenticated
using (
  (edition_id is not null and private.solaris_user_has_capability((select auth.uid()), 'edition.read', edition_id))
  or exists (
    select 1
    from public.official_notice_receipts nr
    where nr.notice_id = id
      and nr.recipient_user_id = (select auth.uid())
  )
);

create policy "Notice receipts readable by recipient or staff"
on public.official_notice_receipts for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  or exists (
    select 1
    from public.official_notices n
    where n.id = notice_id
      and n.edition_id is not null
      and private.solaris_user_has_capability((select auth.uid()), 'edition.read', n.edition_id)
  )
);

-- New Studio 2 tables are read-only through the Data API in this migration.
-- Authoritative mutations are introduced as narrow RPC commands separately.
revoke all on table public.edition_runtime_state from public, anon, authenticated;
revoke all on table public.edition_subsystem_states from public, anon, authenticated;
revoke all on table public.contest_events from public, anon, authenticated;
revoke all on table public.capability_grants from public, anon, authenticated;
revoke all on table public.feature_flag_rules from public, anon, authenticated;
revoke all on table public.workflow_instances from public, anon, authenticated;
revoke all on table public.workflow_tasks from public, anon, authenticated;
revoke all on table public.incidents from public, anon, authenticated;
revoke all on table public.official_notices from public, anon, authenticated;
revoke all on table public.official_notice_receipts from public, anon, authenticated;

grant select on table public.edition_runtime_state to authenticated, service_role;
grant select on table public.edition_subsystem_states to authenticated, service_role;
grant select on table public.contest_events to authenticated, service_role;
grant select on table public.capability_grants to authenticated, service_role;
grant select on table public.feature_flag_rules to authenticated, service_role;
grant select on table public.workflow_instances to authenticated, service_role;
grant select on table public.workflow_tasks to authenticated, service_role;
grant select on table public.incidents to authenticated, service_role;
grant select on table public.official_notices to authenticated, service_role;
grant select on table public.official_notice_receipts to authenticated, service_role;

grant usage on schema private to authenticated, service_role;
grant execute on function private.solaris_user_has_capability(uuid, text, uuid) to authenticated, service_role;
grant execute on function private.solaris_controls_country(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
