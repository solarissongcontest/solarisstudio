begin;

-- Permission Engine v2: catalog, role presets, shadow evaluation and access inspection.
-- This migration deliberately does not enable the permission_engine_v2 rollout flag.

create table public.studio2_capabilities (
  key text primary key,
  domain text not null,
  label text not null check (length(btrim(label)) > 0),
  description text not null check (length(btrim(description)) > 0),
  access_level text not null check (access_level in ('read', 'operate', 'approve', 'administer')),
  created_at timestamptz not null default now()
);

create table public.studio2_access_roles (
  key text primary key,
  label text not null check (length(btrim(label)) > 0),
  description text not null check (length(btrim(description)) > 0),
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.studio2_role_capabilities (
  role_key text not null references public.studio2_access_roles(key) on delete cascade,
  capability text not null references public.studio2_capabilities(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, capability)
);

create table public.studio2_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.studio2_access_roles(key) on delete restrict,
  edition_id uuid references public.editions(id) on delete cascade,
  expires_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint studio2_role_assignments_scope_unique
    unique nulls not distinct (user_id, role_key, edition_id),
  constraint studio2_role_assignments_future_expiry
    check (expires_at is null or expires_at > created_at)
);

create table public.permission_evaluation_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  edition_id uuid references public.editions(id) on delete set null,
  capability text not null references public.studio2_capabilities(key) on delete restrict,
  legacy_allowed boolean not null,
  capability_allowed boolean not null,
  action text not null check (length(btrim(action)) between 1 and 160),
  route text check (route is null or length(route) <= 500),
  created_at timestamptz not null default now()
);

create index studio2_role_assignments_user_scope_idx
  on public.studio2_role_assignments (user_id, edition_id, expires_at);
create index studio2_role_assignments_role_idx
  on public.studio2_role_assignments (role_key, edition_id);
create index permission_evaluation_events_time_idx
  on public.permission_evaluation_events (created_at desc);
create index permission_evaluation_events_mismatch_idx
  on public.permission_evaluation_events (created_at desc, capability)
  where legacy_allowed is distinct from capability_allowed;
create index permission_evaluation_events_user_idx
  on public.permission_evaluation_events (user_id, created_at desc);

insert into public.studio2_capabilities (key, domain, label, description, access_level)
values
  ('edition.read', 'edition', 'View editions', 'View private edition state and operational context.', 'read'),
  ('edition.manage', 'edition', 'Manage editions', 'Edit edition configuration and operational state.', 'operate'),
  ('edition.transition', 'edition', 'Transition editions', 'Move an edition between governed lifecycle states.', 'approve'),
  ('edition.archive', 'edition', 'Archive editions', 'Archive an edition after its lifecycle is complete.', 'approve'),
  ('delegation.read', 'delegation', 'View delegations', 'View private delegation readiness and assignments.', 'read'),
  ('delegation.manage', 'delegation', 'Manage delegations', 'Manage delegation accounts, assignments and readiness.', 'operate'),
  ('confirmation.read', 'entry', 'View confirmations', 'View private confirmation responses.', 'read'),
  ('confirmation.manage', 'entry', 'Manage confirmations', 'Open rounds and manage confirmation responses.', 'operate'),
  ('entry.read_private', 'entry', 'View private entries', 'View entries before public release.', 'read'),
  ('entry.edit', 'entry', 'Edit entries', 'Edit canonical entry details and media.', 'operate'),
  ('entry.approve', 'entry', 'Approve entries', 'Approve an entry for the current edition.', 'approve'),
  ('entry.publish', 'entry', 'Publish entries', 'Release or schedule an entry for public view.', 'approve'),
  ('voting.read', 'voting', 'View voting operations', 'View voting windows, configuration and status.', 'read'),
  ('voting.manage', 'voting', 'Manage voting operations', 'Configure voting windows and operational settings.', 'operate'),
  ('jury.ballots.read', 'voting', 'View jury ballots', 'View protected jury ballot data.', 'read'),
  ('jury.ballots.manage', 'voting', 'Manage jury ballots', 'Operate jury ballot workflows and corrections.', 'operate'),
  ('televote.ballots.read', 'voting', 'View televote ballots', 'View protected televote ballot data.', 'read'),
  ('televote.ballots.manage', 'voting', 'Manage televote ballots', 'Operate televote ballot workflows and exclusions.', 'operate'),
  ('results.preview', 'results', 'Preview results', 'View unreleased calculations and result previews.', 'read'),
  ('results.verify', 'results', 'Verify results', 'Approve calculated results after review.', 'approve'),
  ('results.publish', 'results', 'Publish results', 'Release verified results to public surfaces.', 'approve'),
  ('incident.read', 'incident', 'View incidents', 'View operational incidents and timelines.', 'read'),
  ('incident.manage', 'incident', 'Manage incidents', 'Create and update incident response records.', 'operate'),
  ('incident.resolve', 'incident', 'Resolve incidents', 'Close incidents and record resolution evidence.', 'approve'),
  ('communications.read', 'communications', 'View communications', 'View official communication drafts and delivery state.', 'read'),
  ('communications.send', 'communications', 'Send communications', 'Draft, schedule and send official communications.', 'operate'),
  ('communications.manage', 'communications', 'Manage communications', 'Archive, restore and permanently delete communications.', 'approve'),
  ('rules.read', 'rules', 'View governed rules', 'View private rule drafts and interpretations.', 'read'),
  ('rules.edit', 'rules', 'Edit rules', 'Draft rules and official interpretations.', 'operate'),
  ('rules.publish', 'rules', 'Publish rules', 'Validate and publish governed rulebook releases.', 'approve'),
  ('integrity.read', 'integrity', 'View integrity cases', 'View protected integrity reports, cases and evidence metadata.', 'read'),
  ('integrity.manage', 'integrity', 'Manage integrity cases', 'Triage reports and manage investigations.', 'operate'),
  ('integrity.sanction', 'integrity', 'Apply integrity sanctions', 'Approve sanctions and governed case resolutions.', 'approve'),
  ('publishing.read', 'publishing', 'View publishing state', 'View private publication and reveal state.', 'read'),
  ('publishing.manage', 'publishing', 'Manage publishing', 'Configure public projections and reveal plans.', 'operate'),
  ('publishing.publish', 'publishing', 'Release public content', 'Approve public release of governed contest content.', 'approve'),
  ('broadcast.read', 'broadcast', 'View broadcast operations', 'View broadcast plans, media and rundown state.', 'read'),
  ('broadcast.control', 'broadcast', 'Control broadcast', 'Operate the live broadcast rundown and cues.', 'operate'),
  ('broadcast.manage', 'broadcast', 'Manage broadcast', 'Configure broadcast plans, assets and operators.', 'administer'),
  ('rollout.read', 'rollout', 'View rollout', 'View feature rollout state and dependencies.', 'read'),
  ('rollout.manage', 'rollout', 'Manage rollout', 'Change eligible feature rollout state.', 'administer'),
  ('permissions.read', 'permissions', 'View access', 'View users, roles, capabilities and permission telemetry.', 'read'),
  ('permissions.manage', 'permissions', 'Manage access', 'Assign roles and direct capability grants.', 'administer'),
  ('permissions.audit', 'permissions', 'Audit access', 'Review shadow evaluations and permission mismatches.', 'read'),
  ('governance.vote', 'rules', 'Vote in governance', 'Participate in governed rule or policy votes.', 'operate'),
  ('host.read', 'edition', 'View hosting', 'View private host bids and delivery readiness.', 'read'),
  ('host.manage', 'edition', 'Manage hosting', 'Manage host selection, venues and readiness.', 'operate'),
  ('story.read', 'publishing', 'View stories', 'View private story and anniversary drafts.', 'read'),
  ('story.manage', 'publishing', 'Manage stories', 'Draft and publish edition stories and archive moments.', 'operate')
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_access_roles (key, label, description, is_system)
values
  ('superadmin', 'Superadmin', 'Full platform administration across every edition.', true),
  ('organizer', 'Organizer', 'Full contest operations through the capability engine.', true),
  ('results_manager', 'Results Manager', 'Voting review, result verification and publication.', true),
  ('integrity_officer', 'Integrity Officer', 'Investigations, evidence, sanctions and rule context.', true),
  ('broadcast_operator', 'Broadcast Operator', 'Broadcast rundown, cues and release awareness.', true),
  ('hod', 'HOD', 'Edition-scoped delegation, entry, communication and voting work.', true),
  ('viewer', 'Viewer', 'Read-only operational visibility.', true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  is_system = excluded.is_system;

insert into public.studio2_role_capabilities (role_key, capability)
select role_key, c.key
from (values ('superadmin'), ('organizer')) as roles(role_key)
cross join public.studio2_capabilities c
on conflict do nothing;

insert into public.studio2_role_capabilities (role_key, capability)
select 'viewer', key
from public.studio2_capabilities
where access_level = 'read'
on conflict do nothing;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('results_manager', 'edition.read'),
  ('results_manager', 'voting.read'),
  ('results_manager', 'jury.ballots.read'),
  ('results_manager', 'televote.ballots.read'),
  ('results_manager', 'results.preview'),
  ('results_manager', 'results.verify'),
  ('results_manager', 'results.publish'),
  ('results_manager', 'publishing.read'),
  ('results_manager', 'publishing.publish'),
  ('integrity_officer', 'edition.read'),
  ('integrity_officer', 'voting.read'),
  ('integrity_officer', 'jury.ballots.read'),
  ('integrity_officer', 'televote.ballots.read'),
  ('integrity_officer', 'incident.read'),
  ('integrity_officer', 'integrity.read'),
  ('integrity_officer', 'integrity.manage'),
  ('integrity_officer', 'integrity.sanction'),
  ('integrity_officer', 'rules.read'),
  ('broadcast_operator', 'edition.read'),
  ('broadcast_operator', 'results.preview'),
  ('broadcast_operator', 'publishing.read'),
  ('broadcast_operator', 'broadcast.read'),
  ('broadcast_operator', 'broadcast.control'),
  ('hod', 'edition.read'),
  ('hod', 'delegation.read'),
  ('hod', 'confirmation.read'),
  ('hod', 'confirmation.manage'),
  ('hod', 'entry.read_private'),
  ('hod', 'entry.edit'),
  ('hod', 'voting.read'),
  ('hod', 'communications.read'),
  ('hod', 'governance.vote')
on conflict do nothing;

alter table public.studio2_capability_grants
  drop constraint if exists studio2_capability_grants_capability_check;
alter table public.studio2_capability_grants
  add constraint studio2_capability_grants_capability_fk
  foreign key (capability) references public.studio2_capabilities(key) on update cascade on delete restrict;

create or replace function private.studio2_user_has_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_capability
        and (g.expires_at is null or g.expires_at > now())
        and (g.edition_id is null or (p_edition_id is not null and g.edition_id = p_edition_id))
    )
    or exists (
      select 1
      from public.studio2_role_assignments a
      join public.studio2_role_capabilities rc on rc.role_key = a.role_key
      where a.user_id = p_user_id
        and rc.capability = p_capability
        and (a.expires_at is null or a.expires_at > now())
        and (a.edition_id is null or (p_edition_id is not null and a.edition_id = p_edition_id))
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.studio2_role_capabilities rc on rc.role_key = ur.role::text
      where ur.user_id = p_user_id
        and rc.capability = p_capability
    )
  )
$$;

create or replace function private.studio2_can_manage_permissions(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    public.has_role(p_user_id, 'organizer'::public.app_role)
    or private.studio2_user_has_capability(p_user_id, 'permissions.manage', null)
$$;

create or replace function private.studio2_request_is_service_role()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
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
  select private.studio2_user_has_capability((select auth.uid()), p_capability, p_edition_id)
$$;

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
  v_grant public.studio2_capability_grants%rowtype;
begin
  if not private.studio2_request_is_service_role()
     and (v_actor is null or not private.studio2_can_manage_permissions(v_actor)) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Capability target user is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio2_capabilities where key = p_capability) then
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
  do update set expires_at = excluded.expires_at, granted_by = excluded.granted_by
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
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not private.studio2_request_is_service_role()
     and (v_actor is null or not private.studio2_can_manage_permissions(v_actor)) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  delete from public.studio2_capability_grants
  where user_id = p_user_id
    and capability = p_capability
    and edition_id is not distinct from p_edition_id;
  return found;
end
$$;

create or replace function public.studio2_assign_access_role(
  p_user_id uuid,
  p_role_key text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns public.studio2_role_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_assignment public.studio2_role_assignments%rowtype;
begin
  if not private.studio2_request_is_service_role()
     and (v_actor is null or not private.studio2_can_manage_permissions(v_actor)) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from public.studio2_access_roles where key = p_role_key) then
    raise exception 'A valid user and access role are required' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Role expiry must be in the future' using errcode = '22023';
  end if;
  insert into public.studio2_role_assignments (
    user_id, role_key, edition_id, expires_at, assigned_by
  ) values (
    p_user_id, p_role_key, p_edition_id, p_expires_at, v_actor
  )
  on conflict (user_id, role_key, edition_id)
  do update set expires_at = excluded.expires_at, assigned_by = excluded.assigned_by
  returning * into v_assignment;
  return v_assignment;
end
$$;

create or replace function public.studio2_revoke_access_role(
  p_user_id uuid,
  p_role_key text,
  p_edition_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not private.studio2_request_is_service_role()
     and (v_actor is null or not private.studio2_can_manage_permissions(v_actor)) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  delete from public.studio2_role_assignments
  where user_id = p_user_id
    and role_key = p_role_key
    and edition_id is not distinct from p_edition_id;
  return found;
end
$$;

create or replace function public.studio2_check_capability_shadow(
  p_capability text,
  p_edition_id uuid default null,
  p_action text default 'route.access',
  p_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_legacy_allowed boolean;
  v_capability_allowed boolean;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.studio2_capabilities where key = p_capability) then
    raise exception 'Unknown Solaris capability: %', p_capability using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_action, ''))) not between 1 and 160 then
    raise exception 'Permission action is required' using errcode = '22023';
  end if;
  if p_route is not null and length(p_route) > 500 then
    raise exception 'Permission route is too long' using errcode = '22023';
  end if;

  v_legacy_allowed := public.has_role(v_actor, 'organizer'::public.app_role);
  v_capability_allowed := private.studio2_user_has_capability(v_actor, p_capability, p_edition_id);

  insert into public.permission_evaluation_events (
    user_id, edition_id, capability, legacy_allowed, capability_allowed, action, route
  ) values (
    v_actor, p_edition_id, p_capability, v_legacy_allowed, v_capability_allowed, btrim(p_action), p_route
  );

  return jsonb_build_object(
    'allowed', v_legacy_allowed,
    'legacyAllowed', v_legacy_allowed,
    'capabilityAllowed', v_capability_allowed,
    'matched', v_legacy_allowed = v_capability_allowed,
    'mode', 'shadow'
  );
end
$$;

create or replace function public.studio2_permission_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'capabilities', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.domain, c.key)
      from public.studio2_capabilities c
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', r.key,
          'label', r.label,
          'description', r.description,
          'capabilities', coalesce((
            select jsonb_agg(rc.capability order by rc.capability)
            from public.studio2_role_capabilities rc
            where rc.role_key = r.key
          ), '[]'::jsonb)
        )
        order by r.label
      )
      from public.studio2_access_roles r
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.studio2_access_users()
returns table (
  user_id uuid,
  display_name text,
  email text,
  legacy_roles text[],
  assignments jsonb,
  direct_grants jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  return query
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'instagram_username'), ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'User'
    ),
    u.email::text,
    coalesce((
      select array_agg(ur.role::text order by ur.role::text)
      from public.user_roles ur
      where ur.user_id = u.id
    ), array[]::text[]),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'roleKey', a.role_key,
          'editionId', a.edition_id,
          'editionName', e.name,
          'expiresAt', a.expires_at,
          'createdAt', a.created_at
        )
        order by a.created_at desc
      )
      from public.studio2_role_assignments a
      left join public.editions e on e.id = a.edition_id
      where a.user_id = u.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'capability', g.capability,
          'editionId', g.edition_id,
          'editionName', e.name,
          'expiresAt', g.expires_at,
          'createdAt', g.created_at
        )
        order by g.created_at desc
      )
      from public.studio2_capability_grants g
      left join public.editions e on e.id = g.edition_id
      where g.user_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  where
    exists (select 1 from public.user_roles ur where ur.user_id = u.id)
    or exists (select 1 from public.country_accounts ca where ca.user_id = u.id)
    or exists (select 1 from public.studio2_role_assignments a where a.user_id = u.id)
    or exists (select 1 from public.studio2_capability_grants g where g.user_id = u.id)
  order by 2, u.id;
end
$$;

create or replace function public.studio2_permission_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'windowDays', 30,
      'evaluations', count(*),
      'matched', count(*) filter (where legacy_allowed = capability_allowed),
      'mismatched', count(*) filter (where legacy_allowed is distinct from capability_allowed),
      'legacyAllowedCapabilityDenied', count(*) filter (where legacy_allowed and not capability_allowed),
      'legacyDeniedCapabilityAllowed', count(*) filter (where not legacy_allowed and capability_allowed)
    )
    from public.permission_evaluation_events
    where created_at >= now() - interval '30 days'
  );
end
$$;

create or replace function public.studio2_permission_events(
  p_limit integer default 100,
  p_mismatches_only boolean default false
)
returns table (
  id bigint,
  user_id uuid,
  display_name text,
  edition_id uuid,
  edition_name text,
  capability text,
  legacy_allowed boolean,
  capability_allowed boolean,
  action text,
  route text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  return query
  select
    pe.id,
    pe.user_id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'instagram_username'), ''),
      'Unknown user'
    ),
    pe.edition_id,
    e.name,
    pe.capability,
    pe.legacy_allowed,
    pe.capability_allowed,
    pe.action,
    pe.route,
    pe.created_at
  from public.permission_evaluation_events pe
  left join auth.users u on u.id = pe.user_id
  left join public.editions e on e.id = pe.edition_id
  where not p_mismatches_only or pe.legacy_allowed is distinct from pe.capability_allowed
  order by pe.created_at desc
  limit v_limit;
end
$$;

create or replace function public.studio2_view_access_as(
  p_user_id uuid,
  p_edition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Access simulation user is required' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'userId', p_user_id,
    'editionId', p_edition_id,
    'roles', coalesce((
      select jsonb_agg(role_key order by role_key)
      from (
        select ur.role::text as role_key
        from public.user_roles ur
        where ur.user_id = p_user_id
        union
        select a.role_key
        from public.studio2_role_assignments a
        where a.user_id = p_user_id
          and (a.expires_at is null or a.expires_at > now())
          and (a.edition_id is null or (p_edition_id is not null and a.edition_id = p_edition_id))
      ) roles
    ), '[]'::jsonb),
    'capabilities', coalesce((
      select jsonb_agg(c.key order by c.key)
      from public.studio2_capabilities c
      where private.studio2_user_has_capability(p_user_id, c.key, p_edition_id)
    ), '[]'::jsonb),
    'readOnly', true
  );
end
$$;

alter table public.studio2_capabilities enable row level security;
alter table public.studio2_access_roles enable row level security;
alter table public.studio2_role_capabilities enable row level security;
alter table public.studio2_role_assignments enable row level security;
alter table public.permission_evaluation_events enable row level security;

revoke all on table public.studio2_capabilities from public, anon, authenticated;
revoke all on table public.studio2_access_roles from public, anon, authenticated;
revoke all on table public.studio2_role_capabilities from public, anon, authenticated;
revoke all on table public.studio2_role_assignments from public, anon, authenticated;
revoke all on table public.permission_evaluation_events from public, anon, authenticated;

grant select on table public.studio2_capabilities to authenticated;
grant select on table public.studio2_access_roles to authenticated;
grant select on table public.studio2_role_capabilities to authenticated;
grant select on table public.studio2_role_assignments to authenticated;
grant select on table public.permission_evaluation_events to authenticated;

grant all on table public.studio2_capabilities to service_role;
grant all on table public.studio2_access_roles to service_role;
grant all on table public.studio2_role_capabilities to service_role;
grant all on table public.studio2_role_assignments to service_role;
grant all on table public.permission_evaluation_events to service_role;
grant usage, select on sequence public.permission_evaluation_events_id_seq to service_role;

create policy studio2_capabilities_authenticated_read
on public.studio2_capabilities for select to authenticated using (true);
create policy studio2_access_roles_authenticated_read
on public.studio2_access_roles for select to authenticated using (true);
create policy studio2_role_capabilities_authenticated_read
on public.studio2_role_capabilities for select to authenticated using (true);
create policy studio2_role_assignments_access_read
on public.studio2_role_assignments for select to authenticated
using (
  user_id = (select auth.uid())
  or private.studio2_can_manage_permissions((select auth.uid()))
);
create policy permission_evaluation_events_access_read
on public.permission_evaluation_events for select to authenticated
using (private.studio2_can_manage_permissions((select auth.uid())));

drop policy if exists studio2_capability_grants_read on public.studio2_capability_grants;
create policy studio2_capability_grants_read
on public.studio2_capability_grants for select to authenticated
using (
  user_id = (select auth.uid())
  or private.studio2_can_manage_permissions((select auth.uid()))
);

revoke all on function private.studio2_user_has_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.studio2_can_manage_permissions(uuid) from public, anon, authenticated;
revoke all on function private.studio2_request_is_service_role() from public, anon, authenticated;

revoke all on function public.studio2_has_capability(text, uuid) from public, anon, authenticated;
revoke all on function public.studio2_grant_capability(uuid, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.studio2_revoke_capability(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.studio2_assign_access_role(uuid, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.studio2_revoke_access_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.studio2_check_capability_shadow(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.studio2_permission_catalog() from public, anon, authenticated;
revoke all on function public.studio2_access_users() from public, anon, authenticated;
revoke all on function public.studio2_permission_summary() from public, anon, authenticated;
revoke all on function public.studio2_permission_events(integer, boolean) from public, anon, authenticated;
revoke all on function public.studio2_view_access_as(uuid, uuid) from public, anon, authenticated;

grant execute on function public.studio2_has_capability(text, uuid) to authenticated, service_role;
grant execute on function public.studio2_grant_capability(uuid, text, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.studio2_revoke_capability(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.studio2_assign_access_role(uuid, text, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.studio2_revoke_access_role(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.studio2_check_capability_shadow(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.studio2_permission_catalog() to authenticated, service_role;
grant execute on function public.studio2_access_users() to authenticated, service_role;
grant execute on function public.studio2_permission_summary() to authenticated, service_role;
grant execute on function public.studio2_permission_events(integer, boolean) to authenticated, service_role;
grant execute on function public.studio2_view_access_as(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
