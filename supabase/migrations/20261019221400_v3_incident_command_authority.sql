begin;

-- System V3 / Organizer O12: put the existing Incident Command lifecycle behind
-- the canonical operation/idempotency/CAS boundary without replacing the
-- mature incident validators and lifecycle RPCs.
select public.v3_register_migration_contract(
  'v3.s7.incident-command-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Add monotonic Incident versions, bounded exact-edition reads and a canonical V3 operation envelope over existing Incident Command mutations.'
);

alter table public.studio2_incidents
  add column if not exists version bigint;

update public.studio2_incidents
set version = 1
where version is null;

alter table public.studio2_incidents
  alter column version set default 1,
  alter column version set not null;

alter table public.studio2_incidents
  drop constraint if exists studio2_incidents_version_positive;
alter table public.studio2_incidents
  add constraint studio2_incidents_version_positive check (version > 0);

create or replace function private.v3_bump_incident_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $bump$
begin
  -- Legacy writers remain temporarily callable during consumer cutover. Making
  -- the version a table invariant means every successful legacy change also
  -- invalidates a stale V3 review instead of silently escaping the CAS model.
  new.version := old.version + 1;
  return new;
end
$bump$;

revoke all on function private.v3_bump_incident_version()
  from public, anon, authenticated;

drop trigger if exists v3_incident_version_bump on public.studio2_incidents;
create trigger v3_incident_version_bump
before update on public.studio2_incidents
for each row execute function private.v3_bump_incident_version();

create or replace function public.studio2_incident_command_projection(
  p_edition_id uuid,
  p_incident_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_limit integer := coalesce(p_limit, 100);
begin
  if p_edition_id is null or v_limit < 1 or v_limit > 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('incident.read', p_edition_id, false)
     and not public.studio2_access_allowed('integrity.read', p_edition_id, false)
     and not public.studio2_access_allowed('incident.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if p_incident_id is not null and not exists (
    select 1
    from public.studio2_incidents incident
    where incident.id = p_incident_id
      and incident.edition_id = p_edition_id
  ) then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'incidents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', incident.id,
          'editionId', incident.edition_id,
          'title', incident.title,
          'severity', incident.severity,
          'status', incident.status,
          'category', incident.category,
          'description', incident.description,
          'affectedSystems', incident.affected_systems,
          'commanderId', incident.commander_id,
          'acknowledgedAt', incident.acknowledged_at,
          'acknowledgedBy', incident.acknowledged_by,
          'resolution', incident.resolution,
          'postmortem', incident.postmortem,
          'crisisDeclaredAt', incident.crisis_declared_at,
          'crisisDeclaredBy', incident.crisis_declared_by,
          'startedAt', incident.started_at,
          'resolvedAt', incident.resolved_at,
          'version', incident.version,
          'createdAt', incident.created_at,
          'updatedAt', incident.updated_at,
          'updatedBy', incident.updated_by
        )
        order by
          case incident.severity
            when 'sev1' then 1
            when 'sev2' then 2
            when 'sev3' then 3
            else 4
          end,
          incident.started_at desc
      )
      from (
        select scoped.*
        from public.studio2_incidents scoped
        where scoped.edition_id = p_edition_id
          and (p_incident_id is null or scoped.id = p_incident_id)
        order by scoped.started_at desc
        limit v_limit
      ) incident
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event_row.id,
          'incidentId', event_row.entity_id,
          'type', event_row.type,
          'occurredAt', event_row.occurred_at,
          'actorUserId', event_row.actor_user_id,
          'payload', event_row.payload
        )
        order by event_row.occurred_at desc
      )
      from (
        select event_source.*
        from public.studio2_contest_events event_source
        where event_source.edition_id = p_edition_id
          and event_source.entity_type = 'incident'
          and (
            p_incident_id is null
            or event_source.entity_id = p_incident_id::text
          )
        order by event_source.occurred_at desc
        limit v_limit
      ) event_row
    ), '[]'::jsonb),
    'limit', v_limit,
    'serverTime', clock_timestamp()
  );
end
$projection$;

revoke all on function public.studio2_incident_command_projection(uuid, uuid, integer)
  from public, anon;
grant execute on function public.studio2_incident_command_projection(uuid, uuid, integer)
  to authenticated, service_role;

create or replace function public.studio2_incident_command_preflight(
  p_edition_id uuid,
  p_incident_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_incident public.studio2_incidents%rowtype;
  v_to text;
  v_risk text := 'R1';
  v_required_capability text := 'incident.manage';
  v_reason_required boolean := false;
begin
  if p_edition_id is null
     or jsonb_typeof(v_payload) <> 'object'
     or v_action not in (
       'create', 'update', 'acknowledge', 'declare_crisis', 'timeline_note', 'transition'
     ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_action = 'create' then
    if p_incident_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  else
    if p_incident_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select incident.*
    into v_incident
    from public.studio2_incidents incident
    where incident.id = p_incident_id
      and incident.edition_id = p_edition_id;

    if v_incident.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;
  end if;

  if v_action = 'declare_crisis' then
    v_risk := 'R3';
    v_reason_required := true;
  elsif v_action = 'transition' then
    v_to := lower(btrim(coalesce(v_payload ->> 'to', '')));
    if v_to not in ('detected', 'investigating', 'mitigating', 'monitoring', 'resolved') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if v_to = 'resolved' then
      v_required_capability := 'incident.resolve';
      v_risk := 'R3';
      v_reason_required := true;
    elsif v_incident.status = 'resolved' then
      v_risk := 'R3';
      v_reason_required := true;
    else
      v_risk := 'R2';
    end if;
  end if;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'incidentId', p_incident_id,
    'action', v_action,
    'riskClass', v_risk,
    'requiredCapability', v_required_capability,
    'reasonRequired', v_reason_required,
    'expectedVersion', case when v_action = 'create' then null else v_incident.version end,
    'current', case
      when v_action = 'create' then null
      else jsonb_build_object(
        'title', v_incident.title,
        'severity', v_incident.severity,
        'status', v_incident.status,
        'category', v_incident.category,
        'commanderId', v_incident.commander_id,
        'acknowledgedAt', v_incident.acknowledged_at,
        'crisisDeclaredAt', v_incident.crisis_declared_at,
        'version', v_incident.version,
        'updatedAt', v_incident.updated_at
      )
    end,
    'consequences', case v_action
      when 'create' then jsonb_build_array(
        'Creates an edition-scoped operational incident.',
        'Incident Command and Control Room attention may change.'
      )
      when 'declare_crisis' then jsonb_build_array(
        'Marks the incident as a declared crisis.',
        'Control Room urgency and incident response attention may change.'
      )
      when 'transition' then jsonb_build_array(
        'Changes the canonical incident lifecycle state.',
        'Resolution or reopening changes operational attention immediately.'
      )
      when 'timeline_note' then jsonb_build_array(
        'Adds an immutable operational timeline note.',
        'Advances the incident version so stale reviews cannot overwrite it.'
      )
      else jsonb_build_array(
        'Changes the canonical incident record.',
        'Advances the incident version and invalidates stale reviews.'
      )
    end,
    'serverTime', clock_timestamp()
  );
end
$preflight$;

revoke all on function public.studio2_incident_command_preflight(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.studio2_incident_command_preflight(uuid, uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.studio2_apply_incident_command_v3(
  p_edition_id uuid,
  p_incident_id uuid,
  p_action text,
  p_expected_version bigint,
  p_payload jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_risk text := 'R1';
  v_required_capability text := 'incident.manage';
  v_claim jsonb;
  v_operation_id uuid;
  v_freshness jsonb;
  v_before public.studio2_incidents%rowtype;
  v_after public.studio2_incidents%rowtype;
  v_to text;
  v_title text;
  v_severity text;
  v_category text;
  v_description text;
  v_affected_systems text[];
  v_commander_id uuid;
  v_set_commander boolean;
  v_resolution text;
  v_postmortem text;
  v_message text;
  v_event_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object'
     or pg_column_size(v_payload) > 32768
     or v_action not in (
       'create', 'update', 'acknowledge', 'declare_crisis', 'timeline_note', 'transition'
     ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_reason is not null and length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_action = 'create' then
    if p_incident_id is not null or p_expected_version is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  else
    if p_incident_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    -- Scope is checked before claiming an operation. Mutable version is checked
    -- only after claim/replay handling so a lost successful response remains
    -- reconcilable even though that success advanced the version.
    select incident.*
    into v_before
    from public.studio2_incidents incident
    where incident.id = p_incident_id;

    if v_before.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;
    if v_before.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'AUTHORIZATION';
    end if;
  end if;

  if v_action = 'declare_crisis' then
    v_risk := 'R3';
    if v_reason is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  elsif v_action = 'transition' then
    v_to := lower(btrim(coalesce(v_payload ->> 'to', '')));
    if v_to not in ('detected', 'investigating', 'mitigating', 'monitoring', 'resolved') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if v_to = 'resolved' then
      v_required_capability := 'incident.resolve';
      v_risk := 'R3';
      if v_reason is null then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    elsif v_before.status = 'resolved' then
      v_risk := 'R3';
      if v_reason is null then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    else
      v_risk := 'R2';
    end if;
  end if;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_command := 'incident.' || v_action;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'incident',
      'subjectId', p_incident_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'incidentId', p_incident_id,
      'action', v_action,
      'expectedVersion', p_expected_version,
      'payload', v_payload,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if v_risk = 'R3' then
    v_freshness := private.studio2_require_fresh_auth(300);
  end if;

  if v_action <> 'create' then
    select incident.*
    into v_before
    from public.studio2_incidents incident
    where incident.id = p_incident_id
      and incident.edition_id = p_edition_id
    for update;

    if v_before.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;
    if v_before.version is distinct from p_expected_version then
      raise exception using
        errcode = '40001',
        message = 'VERSION_CONFLICT',
        hint = 'Reload Incident Command and review the current incident state.';
    end if;
  end if;

  if v_action = 'create' then
    v_title := nullif(btrim(coalesce(v_payload ->> 'title', '')), '');
    v_severity := lower(btrim(coalesce(v_payload ->> 'severity', '')));
    v_category := lower(btrim(coalesce(v_payload ->> 'category', '')));
    v_description := coalesce(v_payload ->> 'description', '');

    select coalesce(array_agg(value order by ordinal), '{}'::text[])
    into v_affected_systems
    from jsonb_array_elements_text(coalesce(v_payload -> 'affectedSystems', '[]'::jsonb))
      with ordinality as affected(value, ordinal);

    select * into v_after
    from public.studio2_create_incident_v2(
      p_edition_id,
      v_title,
      v_severity,
      v_category,
      v_description,
      v_affected_systems
    );

  elsif v_action = 'update' then
    v_title := case when v_payload ? 'title' then v_payload ->> 'title' else null end;
    v_severity := case when v_payload ? 'severity' then v_payload ->> 'severity' else null end;
    v_category := case when v_payload ? 'category' then v_payload ->> 'category' else null end;
    v_description := case when v_payload ? 'description' then v_payload ->> 'description' else null end;
    v_set_commander := coalesce((v_payload ->> 'setCommander')::boolean, false);
    v_commander_id := case
      when v_set_commander and nullif(v_payload ->> 'commanderId', '') is not null
        then (v_payload ->> 'commanderId')::uuid
      else null
    end;
    v_resolution := case when v_payload ? 'resolution' then v_payload ->> 'resolution' else null end;
    v_postmortem := case when v_payload ? 'postmortem' then v_payload ->> 'postmortem' else null end;

    if v_payload ? 'affectedSystems' then
      if jsonb_typeof(v_payload -> 'affectedSystems') <> 'array' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      select coalesce(array_agg(value order by ordinal), '{}'::text[])
      into v_affected_systems
      from jsonb_array_elements_text(v_payload -> 'affectedSystems')
        with ordinality as affected(value, ordinal);
    else
      v_affected_systems := null;
    end if;

    select * into v_after
    from public.studio2_update_incident(
      p_incident_id,
      v_title,
      v_severity,
      v_category,
      v_description,
      v_affected_systems,
      v_commander_id,
      v_set_commander,
      v_resolution,
      v_postmortem
    );

  elsif v_action = 'acknowledge' then
    if v_before.acknowledged_at is not null then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
    select * into v_after
    from public.studio2_acknowledge_incident(p_incident_id);

  elsif v_action = 'declare_crisis' then
    if v_before.crisis_declared_at is not null then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
    select * into v_after
    from public.studio2_declare_incident_crisis(p_incident_id);

  elsif v_action = 'timeline_note' then
    v_message := nullif(btrim(coalesce(v_payload ->> 'message', '')), '');
    if v_message is null or length(v_message) > 4000 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    perform public.studio2_add_incident_timeline_event(p_incident_id, v_message);
    -- Timeline is part of Incident Command state. Advance the parent version so
    -- another organizer reviewing the incident cannot unknowingly commit over a
    -- note that arrived after their preflight.
    update public.studio2_incidents incident
    set updated_by = v_actor
    where incident.id = p_incident_id
      and incident.edition_id = p_edition_id
      and incident.version = p_expected_version
    returning incident.* into v_after;

    if v_after.id is null then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;

  elsif v_action = 'transition' then
    select * into v_after
    from public.studio2_transition_incident(p_incident_id, v_to);
  end if;

  if v_after.id is null or v_after.edition_id is distinct from p_edition_id then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    v_actor,
    v_command,
    'studio2_incidents',
    v_after.id::text,
    p_edition_id,
    case
      when v_action = 'create' then null
      else jsonb_build_object(
        'status', v_before.status,
        'severity', v_before.severity,
        'category', v_before.category,
        'commanderId', v_before.commander_id,
        'acknowledgedAt', v_before.acknowledged_at,
        'crisisDeclaredAt', v_before.crisis_declared_at,
        'version', v_before.version,
        'updatedAt', v_before.updated_at
      )
    end,
    jsonb_build_object(
      'operationId', v_operation_id,
      'reason', v_reason,
      'status', v_after.status,
      'severity', v_after.severity,
      'category', v_after.category,
      'commanderId', v_after.commander_id,
      'acknowledgedAt', v_after.acknowledged_at,
      'crisisDeclaredAt', v_after.crisis_declared_at,
      'version', v_after.version,
      'updatedAt', v_after.updated_at,
      'authFreshness', v_freshness
    )
  );

  v_event_id := private.v3_emit_domain_event(
    'incident.changed',
    'incident',
    v_after.id::text,
    v_after.version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'action', v_action,
      'status', v_after.status,
      'severity', v_after.severity,
      'category', v_after.category,
      'reason', v_reason,
      'previousVersion', case when v_action = 'create' then null else v_before.version end,
      'version', v_after.version
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'eventId', v_event_id,
    'editionId', p_edition_id,
    'incidentId', v_after.id,
    'action', v_action,
    'previousVersion', case when v_action = 'create' then null else v_before.version end,
    'version', v_after.version,
    'status', v_after.status,
    'serverTime', clock_timestamp()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  if v_risk = 'R3' then
    update public.studio2_operation_receipts receipt
    set
      actor_session_id = v_freshness ->> 'sessionId',
      auth_freshness_evidence = v_freshness,
      updated_at = now()
    where receipt.operation_id = v_operation_id
      and receipt.actor_id = v_actor;
  end if;

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_incident_command_v3(
  uuid, uuid, text, bigint, jsonb, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_apply_incident_command_v3(
  uuid, uuid, text, bigint, jsonb, text, uuid, text, uuid
) to authenticated, service_role;

comment on function public.studio2_apply_incident_command_v3(
  uuid, uuid, text, bigint, jsonb, text, uuid, text, uuid
) is
  'Canonical V3 Incident Command envelope. Binds exact edition/incident scope, monotonic version CAS, semantic idempotency, R3 fresh authentication for crisis/resolve/reopen, immutable audit evidence, DomainEvent identity and receipt reconciliation while preserving existing lifecycle validators.';

notify pgrst, 'reload schema';

commit;
