begin;

-- Organisation OS V5 incident lifecycle alignment.
--
-- V5 source lifecycle: Detected, Investigating, Mitigating, Monitoring, Resolved.
-- Existing legacy "open" rows map to Detected. The graph remains deliberately
-- operational rather than strictly linear: emergency response may move directly
-- from Detected into mitigation/monitoring/resolution, but every transition is
-- server-validated.

alter table public.studio2_incidents
  drop constraint if exists studio2_incidents_status_check;

update public.studio2_incidents
set status = 'detected'
where status = 'open';

alter table public.studio2_incidents
  alter column status set default 'detected';

alter table public.studio2_incidents
  add constraint studio2_incidents_status_check
  check (
    status in (
      'detected',
      'investigating',
      'mitigating',
      'monitoring',
      'resolved'
    )
  );

create or replace function private.studio2_incident_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select (p_from || '->' || p_to) in (
    'detected->investigating',
    'detected->mitigating',
    'detected->monitoring',
    'detected->resolved',
    'investigating->mitigating',
    'investigating->monitoring',
    'investigating->resolved',
    'mitigating->investigating',
    'mitigating->monitoring',
    'mitigating->resolved',
    'monitoring->investigating',
    'monitoring->mitigating',
    'monitoring->resolved',
    'resolved->investigating',
    'resolved->monitoring'
  );
$allowed$;

revoke all on function private.studio2_incident_transition_allowed(text, text)
  from public, anon, authenticated;

create or replace function public.studio2_transition_incident(
  p_incident_id uuid,
  p_to text
)
returns public.studio2_incidents
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $transition$
declare
  v_actor uuid := auth.uid();
  v_incident public.studio2_incidents%rowtype;
  v_from text;
begin
  if p_incident_id is null then
    raise exception 'Incident id is required' using errcode = '22023';
  end if;

  if p_to is null or p_to not in (
    'detected',
    'investigating',
    'mitigating',
    'monitoring',
    'resolved'
  ) then
    raise exception 'Unknown incident status: %', p_to using errcode = '22023';
  end if;

  select *
  into v_incident
  from public.studio2_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Incident not found: %', p_incident_id using errcode = 'P0002';
  end if;

  if p_to = 'resolved' then
    if not public.studio2_access_allowed('incident.resolve', v_incident.edition_id, false) then
      raise exception 'Missing Solaris capability: incident.resolve' using errcode = '42501';
    end if;
  elsif not public.studio2_access_allowed('incident.manage', v_incident.edition_id, false) then
    raise exception 'Missing Solaris capability: incident.manage' using errcode = '42501';
  end if;

  if not private.studio2_incident_transition_allowed(v_incident.status, p_to) then
    raise exception 'Illegal incident transition: % -> %', v_incident.status, p_to
      using errcode = '23514';
  end if;

  v_from := v_incident.status;

  update public.studio2_incidents
  set
    status = p_to,
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
    )
    values (
      v_incident.edition_id,
      case when p_to = 'resolved' then 'incident.resolved' else 'incident.updated' end,
      v_actor,
      'incident',
      v_incident.id::text,
      jsonb_build_object(
        'action',
          case
            when v_from = 'resolved' then 'reopened'
            when v_from = 'detected' and p_to = 'investigating' then 'investigation_started'
            else 'status_changed'
          end,
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
$transition$;

revoke all on function public.studio2_transition_incident(uuid, text)
  from public, anon;
grant execute on function public.studio2_transition_incident(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
