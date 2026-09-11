begin;

-- Narrow write commands for Studio 2. Direct browser writes to the underlying
-- authoritative tables remain unavailable; mutations happen through these RPCs.

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
    user_id,
    capability,
    edition_id,
    expires_at,
    granted_by
  ) values (
    p_user_id,
    p_capability,
    p_edition_id,
    p_expires_at,
    v_actor
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
  v_from text;
  v_risk text;
  v_reason text := nullif(btrim(p_reason), '');
  v_required_capability text;
begin
  if p_edition_id is null or p_to is null then
    raise exception 'Edition id and target state are required' using errcode = '22023';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

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
    select e.status into v_status
    from public.editions e
    where e.id = p_edition_id;

    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;

    insert into public.studio2_edition_runtime (
      edition_id,
      state,
      subsystems,
      updated_by
    ) values (
      p_edition_id,
      private.studio2_normalize_legacy_edition_status(v_status),
      private.studio2_default_subsystems(
        private.studio2_normalize_legacy_edition_status(v_status)
      ),
      v_actor
    )
    on conflict (edition_id) do nothing;

    select * into v_runtime
    from public.studio2_edition_runtime
    where edition_id = p_edition_id
    for update;
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  if v_risk is null then
    raise exception 'Illegal edition state transition: % -> %', v_from, p_to using errcode = '22023';
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception 'A reason is required for % edition transitions', v_risk using errcode = '22023';
  end if;

  if p_second_approver is not null
     and v_actor is not null
     and p_second_approver = v_actor then
    raise exception 'The second approver must be a different user' using errcode = '22023';
  end if;

  if v_risk = 'critical' then
    if p_second_approver is null then
      raise exception 'A second approver is required for critical edition transitions' using errcode = '22023';
    end if;

    if not public.has_role(p_second_approver, 'organizer'::public.app_role)
       and not private.studio2_user_has_capability(
         p_second_approver,
         'edition.manage',
         p_edition_id
       ) then
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
    edition_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'secondApproverUserId', p_second_approver
    )
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

  if p_severity is null or p_severity not in ('sev1', 'sev2', 'sev3', 'sev4') then
    raise exception 'Unknown incident severity: %', p_severity using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  insert into public.studio2_incidents (
    edition_id,
    title,
    severity,
    created_by,
    updated_by
  ) values (
    p_edition_id,
    btrim(p_title),
    p_severity,
    v_actor,
    v_actor
  )
  returning * into v_incident;

  if p_edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
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
  if p_incident_id is null then
    raise exception 'Incident id is required' using errcode = '22023';
  end if;

  if p_to is null or p_to not in ('open', 'mitigating', 'monitoring', 'resolved') then
    raise exception 'Unknown incident status: %', p_to using errcode = '22023';
  end if;

  select * into v_incident
  from public.studio2_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(
       v_actor,
       'incident.manage',
       v_incident.edition_id
     ) then
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
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
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

revoke all on function public.studio2_grant_capability(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.studio2_grant_capability(uuid, text, uuid, timestamptz)
  to authenticated, service_role;

revoke all on function public.studio2_revoke_capability(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_revoke_capability(uuid, text, uuid)
  to authenticated, service_role;

revoke all on function public.studio2_transition_edition(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_edition(uuid, text, text, uuid)
  to authenticated, service_role;

revoke all on function public.studio2_create_incident(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_create_incident(uuid, text, text)
  to authenticated, service_role;

revoke all on function public.studio2_transition_incident(uuid, text)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_incident(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
