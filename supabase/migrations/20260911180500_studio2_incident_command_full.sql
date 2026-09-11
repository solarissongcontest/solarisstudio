begin;

alter table public.studio2_incidents
  add column category text not null default 'other',
  add column affected_systems text[] not null default '{}'::text[],
  add column description text not null default '',
  add column commander_id uuid references auth.users(id) on delete set null,
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references auth.users(id) on delete set null,
  add column resolution text,
  add column postmortem text,
  add column crisis_declared_at timestamptz,
  add column crisis_declared_by uuid references auth.users(id) on delete set null;

alter table public.studio2_incidents
  add constraint studio2_incidents_category_check check (
    category in (
      'voting', 'broadcast', 'delegation', 'technical', 'results',
      'security', 'integrity', 'publication', 'other'
    )
  );

create index studio2_incidents_edition_category_status_idx
  on public.studio2_incidents (edition_id, category, status, severity, started_at desc);

create or replace function private.studio2_incident_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select (p_from || '->' || p_to) in (
    'open->mitigating', 'open->monitoring', 'open->resolved',
    'mitigating->monitoring', 'mitigating->resolved',
    'monitoring->mitigating', 'monitoring->resolved',
    'resolved->monitoring'
  )
$$;

create or replace function public.studio2_create_incident_v2(
  p_edition_id uuid,
  p_title text,
  p_severity text,
  p_category text,
  p_description text,
  p_affected_systems text[]
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = ''
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

  if p_category is null or p_category not in (
    'voting', 'broadcast', 'delegation', 'technical', 'results',
    'security', 'integrity', 'publication', 'other'
  ) then
    raise exception 'Unknown incident category: %', p_category using errcode = '22023';
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
    category,
    description,
    affected_systems,
    created_by,
    updated_by
  ) values (
    p_edition_id,
    btrim(p_title),
    p_severity,
    p_category,
    coalesce(btrim(p_description), ''),
    coalesce(p_affected_systems, '{}'::text[]),
    v_actor,
    v_actor
  )
  returning * into v_incident;

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
        'category', v_incident.category,
        'status', v_incident.status,
        'affectedSystems', v_incident.affected_systems
      )
    );
  end if;

  return v_incident;
end
$$;

create or replace function public.studio2_update_incident(
  p_incident_id uuid,
  p_title text,
  p_severity text,
  p_category text,
  p_description text,
  p_affected_systems text[],
  p_commander_id uuid,
  p_set_commander boolean,
  p_resolution text,
  p_postmortem text
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
  v_before public.studio2_incidents%rowtype;
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

  if p_title is not null and nullif(btrim(p_title), '') is null then
    raise exception 'Incident title cannot be blank' using errcode = '22023';
  end if;

  if p_severity is not null and p_severity not in ('sev1', 'sev2', 'sev3', 'sev4') then
    raise exception 'Unknown incident severity: %', p_severity using errcode = '22023';
  end if;

  if p_category is not null and p_category not in (
    'voting', 'broadcast', 'delegation', 'technical', 'results',
    'security', 'integrity', 'publication', 'other'
  ) then
    raise exception 'Unknown incident category: %', p_category using errcode = '22023';
  end if;

  v_before := v_incident;

  update public.studio2_incidents
  set title = coalesce(btrim(p_title), title),
      severity = coalesce(p_severity, severity),
      category = coalesce(p_category, category),
      description = case when p_description is null then description else btrim(p_description) end,
      affected_systems = coalesce(p_affected_systems, affected_systems),
      commander_id = case when p_set_commander then p_commander_id else commander_id end,
      resolution = case when p_resolution is null then resolution else nullif(btrim(p_resolution), '') end,
      postmortem = case when p_postmortem is null then postmortem else nullif(btrim(p_postmortem), '') end,
      updated_by = v_actor
  where id = p_incident_id
  returning * into v_incident;

  if v_incident.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      v_incident.edition_id,
      'incident.updated',
      v_actor,
      'incident',
      v_incident.id::text,
      jsonb_build_object(
        'action', 'details_updated',
        'before', jsonb_build_object(
          'title', v_before.title,
          'severity', v_before.severity,
          'category', v_before.category,
          'commanderId', v_before.commander_id
        ),
        'after', jsonb_build_object(
          'title', v_incident.title,
          'severity', v_incident.severity,
          'category', v_incident.category,
          'commanderId', v_incident.commander_id
        )
      )
    );
  end if;

  return v_incident;
end
$$;

create or replace function public.studio2_acknowledge_incident(p_incident_id uuid)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
begin
  select * into v_incident from public.studio2_incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002'; end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', v_incident.edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  update public.studio2_incidents
  set acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by = coalesce(acknowledged_by, v_actor),
      updated_by = v_actor
  where id = p_incident_id
  returning * into v_incident;

  if v_incident.edition_id is not null then
    insert into public.studio2_contest_events (edition_id, type, actor_user_id, entity_type, entity_id, payload)
    values (v_incident.edition_id, 'incident.updated', v_actor, 'incident', v_incident.id::text,
      jsonb_build_object('action', 'acknowledged'));
  end if;

  return v_incident;
end
$$;

create or replace function public.studio2_declare_incident_crisis(p_incident_id uuid)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
begin
  select * into v_incident from public.studio2_incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002'; end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', v_incident.edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  update public.studio2_incidents
  set crisis_declared_at = coalesce(crisis_declared_at, now()),
      crisis_declared_by = coalesce(crisis_declared_by, v_actor),
      updated_by = v_actor
  where id = p_incident_id
  returning * into v_incident;

  if v_incident.edition_id is not null then
    insert into public.studio2_contest_events (edition_id, type, actor_user_id, entity_type, entity_id, payload)
    values (v_incident.edition_id, 'incident.updated', v_actor, 'incident', v_incident.id::text,
      jsonb_build_object('action', 'crisis_declared'));
  end if;

  return v_incident;
end
$$;

create or replace function public.studio2_add_incident_timeline_event(
  p_incident_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
begin
  if nullif(btrim(p_message), '') is null then
    raise exception 'Timeline message is required' using errcode = '22023';
  end if;

  select * into v_incident from public.studio2_incidents where id = p_incident_id;
  if not found then raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002'; end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'incident.manage', v_incident.edition_id) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  if v_incident.edition_id is null then
    raise exception 'Timeline events require an edition-scoped incident' using errcode = '22023';
  end if;

  insert into public.studio2_contest_events (edition_id, type, actor_user_id, entity_type, entity_id, payload)
  values (
    v_incident.edition_id,
    'incident.updated',
    v_actor,
    'incident',
    v_incident.id::text,
    jsonb_build_object('action', 'timeline_note', 'message', btrim(p_message))
  );
end
$$;

create or replace function public.studio2_transition_incident(
  p_incident_id uuid,
  p_to text
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_incident public.studio2_incidents%rowtype;
  v_from text;
begin
  if p_incident_id is null then raise exception 'Incident id is required' using errcode = '22023'; end if;
  if p_to is null or p_to not in ('open', 'mitigating', 'monitoring', 'resolved') then
    raise exception 'Unknown incident status: %', p_to using errcode = '22023';
  end if;

  select * into v_incident from public.studio2_incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002'; end if;

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
    insert into public.studio2_contest_events (edition_id, type, actor_user_id, entity_type, entity_id, payload)
    values (
      v_incident.edition_id,
      case when p_to = 'resolved' then 'incident.resolved' else 'incident.updated' end,
      v_actor,
      'incident',
      v_incident.id::text,
      jsonb_build_object(
        'action', case when v_from = 'resolved' then 'reopened' else 'status_changed' end,
        'from', v_from,
        'to', p_to,
        'severity', v_incident.severity,
        'category', v_incident.category,
        'title', v_incident.title
      )
    );
  end if;

  return v_incident;
end
$$;

revoke all on function public.studio2_create_incident_v2(uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.studio2_create_incident_v2(uuid, text, text, text, text, text[]) to authenticated, service_role;

revoke all on function public.studio2_update_incident(uuid, text, text, text, text, text[], uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.studio2_update_incident(uuid, text, text, text, text, text[], uuid, boolean, text, text) to authenticated, service_role;

revoke all on function public.studio2_acknowledge_incident(uuid) from public, anon, authenticated;
grant execute on function public.studio2_acknowledge_incident(uuid) to authenticated, service_role;

revoke all on function public.studio2_declare_incident_crisis(uuid) from public, anon, authenticated;
grant execute on function public.studio2_declare_incident_crisis(uuid) to authenticated, service_role;

revoke all on function public.studio2_add_incident_timeline_event(uuid, text) from public, anon, authenticated;
grant execute on function public.studio2_add_incident_timeline_event(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
