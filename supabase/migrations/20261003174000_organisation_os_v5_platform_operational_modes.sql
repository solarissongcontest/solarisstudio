begin;

-- Organisation OS V5 canonical platform operational modes.
--
-- This is the normal in-application control plane. It deliberately does NOT
-- replace the Supabase-independent Worker emergency maintenance circuit breaker.
-- The emergency path must remain usable when the database/control plane itself
-- is unhealthy.

insert into public.studio2_capabilities (key, domain, label, description, access_level)
values (
  'maintenance.manage',
  'system',
  'Manage platform operating mode',
  'Move Solaris between Normal, Degraded, Read-only and Maintenance through protected audited transitions.',
  'administer'
)
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('superadmin', 'maintenance.manage'),
  ('organizer', 'maintenance.manage')
on conflict do nothing;

create table if not exists public.studio2_platform_operational_state (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'normal'
    check (mode in ('normal', 'degraded', 'read_only', 'maintenance')),
  version bigint not null default 1 check (version > 0),
  affected_services text[] not null default '{}'::text[],
  message text,
  incident_reference text,
  reason text not null default 'Initial platform state',
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

insert into public.studio2_platform_operational_state (
  singleton,
  mode,
  version,
  reason
)
values (true, 'normal', 1, 'Initial platform state')
on conflict (singleton) do nothing;

alter table public.studio2_platform_operational_state enable row level security;
revoke all on table public.studio2_platform_operational_state
  from public, anon, authenticated;
grant all on table public.studio2_platform_operational_state to service_role;

create or replace function private.studio2_platform_mode_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $allowed$
  select case
    when p_from = p_to then true
    when p_from = 'normal'
      then p_to in ('degraded', 'read_only', 'maintenance')
    when p_from = 'degraded'
      then p_to in ('normal', 'read_only', 'maintenance')
    when p_from = 'read_only'
      then p_to in ('degraded', 'maintenance')
    when p_from = 'maintenance'
      then p_to = 'read_only'
    else false
  end;
$allowed$;

revoke all on function private.studio2_platform_mode_transition_allowed(text, text)
  from public, anon, authenticated;

create or replace function private.studio2_platform_mutation_allowed(
  p_command text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select case state.mode
    when 'normal' then true
    when 'degraded' then true
    when 'read_only' then coalesce(p_command, '') in (
      'system.platform_mode.change',
      'system.push.retry_failed'
    )
    when 'maintenance' then coalesce(p_command, '') = 'system.platform_mode.change'
    else false
  end
  from public.studio2_platform_operational_state state
  where state.singleton = true;
$allowed$;

revoke all on function private.studio2_platform_mutation_allowed(text)
  from public, anon, authenticated;

create or replace function public.studio2_platform_operational_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_state public.studio2_platform_operational_state;
begin
  if not public.studio2_access_allowed('system.read', null, false)
     and not public.studio2_access_allowed('maintenance.manage', null, false) then
    raise exception 'System read capability required' using errcode = '42501';
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true;

  return jsonb_build_object(
    'mode', v_state.mode,
    'version', v_state.version,
    'affectedServices', to_jsonb(v_state.affected_services),
    'message', v_state.message,
    'incidentReference', v_state.incident_reference,
    'reason', v_state.reason,
    'changedBy', v_state.changed_by,
    'changedAt', v_state.changed_at
  );
end
$snapshot$;

revoke all on function public.studio2_platform_operational_snapshot()
  from public, anon;
grant execute on function public.studio2_platform_operational_snapshot()
  to authenticated, service_role;

create or replace function public.studio2_platform_mode_change_preview(
  p_target_mode text,
  p_affected_services text[] default '{}'::text[],
  p_message text default null,
  p_incident_reference text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_state public.studio2_platform_operational_state;
  v_target text := lower(btrim(coalesce(p_target_mode, '')));
  v_risk text;
begin
  if not public.studio2_access_allowed('maintenance.manage', null, false) then
    raise exception 'Missing Solaris capability: maintenance.manage' using errcode = '42501';
  end if;

  if v_target not in ('normal', 'degraded', 'read_only', 'maintenance') then
    raise exception 'Unknown platform operating mode' using errcode = '22023';
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true;

  if not private.studio2_platform_mode_transition_allowed(v_state.mode, v_target) then
    raise exception 'Invalid platform mode transition: % -> %', v_state.mode, v_target
      using errcode = '23514';
  end if;

  v_risk := case
    when v_state.mode in ('read_only', 'maintenance')
      or v_target in ('read_only', 'maintenance')
    then 'R3'
    else 'R2'
  end;

  return jsonb_build_object(
    'currentMode', v_state.mode,
    'targetMode', v_target,
    'expectedVersion', v_state.version,
    'alreadyApplied', v_state.mode = v_target,
    'riskClass', v_risk,
    'affectedServices', to_jsonb(coalesce(p_affected_services, '{}'::text[])),
    'message', nullif(btrim(coalesce(p_message, '')), ''),
    'incidentReference', nullif(btrim(coalesce(p_incident_reference, '')), ''),
    'requiresRecoveryStep',
      (v_state.mode = 'maintenance' and v_target = 'read_only')
      or (v_state.mode = 'read_only' and v_target = 'degraded'),
    'writePolicy',
      case v_target
        when 'normal' then 'Normal V5 mutations allowed'
        when 'degraded' then 'Normal V5 mutations allowed; unavailable services must fail closed individually'
        when 'read_only' then 'V5 mutations blocked except explicit recovery operations'
        when 'maintenance' then 'V5 mutations blocked except changing platform mode'
      end
  );
end
$preview$;

revoke all on function public.studio2_platform_mode_change_preview(text, text[], text, text)
  from public, anon;
grant execute on function public.studio2_platform_mode_change_preview(text, text[], text, text)
  to authenticated, service_role;

-- Replace the operation claim helper so canonical V5 commands respect the
-- current operational mode. This deliberately affects only operation-contract
-- commands; legacy/direct write paths remain a tracked cutover blocker until
-- they are migrated or receive equivalent server guards.
create or replace function private.studio2_claim_operation(
  p_operation_id uuid,
  p_idempotency_key text,
  p_command text,
  p_risk_class text,
  p_scope jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $claim$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_command text := nullif(btrim(coalesce(p_command, '')), '');
  v_receipt public.studio2_operation_receipts;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or v_key is null or v_command is null then
    raise exception 'Operation id, idempotency key and command are required'
      using errcode = '22023';
  end if;
  if p_risk_class not in ('R0', 'R1', 'R2', 'R3') then
    raise exception 'Invalid operation risk class' using errcode = '22023';
  end if;
  if not private.studio2_platform_mutation_allowed(v_command) then
    raise exception 'Solaris is currently %, so this operation is unavailable',
      (select mode from public.studio2_platform_operational_state where singleton = true)
      using errcode = '25006';
  end if;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    command,
    risk_class,
    scope
  )
  values (
    p_operation_id,
    v_actor,
    v_key,
    v_command,
    p_risk_class,
    coalesce(p_scope, '{}'::jsonb)
  )
  on conflict do nothing;

  select *
  into v_receipt
  from public.studio2_operation_receipts
  where operation_id = p_operation_id
     or (
       actor_id = v_actor
       and command = v_command
       and idempotency_key = v_key
     )
  order by case when operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Operation receipt could not be claimed' using errcode = 'P0001';
  end if;

  if v_receipt.actor_id <> v_actor
     or v_receipt.command <> v_command
     or v_receipt.idempotency_key <> v_key then
    raise exception 'Operation id is already used by another command'
      using errcode = '23505';
  end if;

  if v_receipt.status = 'succeeded' then
    return jsonb_build_object(
      'replayed', true,
      'operationId', v_receipt.operation_id,
      'result', v_receipt.result
    );
  end if;

  update public.studio2_operation_receipts
  set updated_at = now()
  where operation_id = v_receipt.operation_id;

  return jsonb_build_object(
    'replayed', false,
    'operationId', v_receipt.operation_id
  );
end
$claim$;

revoke all on function private.studio2_claim_operation(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.studio2_apply_platform_mode_change(
  p_target_mode text,
  p_reason text,
  p_affected_services text[],
  p_message text,
  p_incident_reference text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_state public.studio2_platform_operational_state;
  v_existing public.studio2_operation_receipts;
  v_target text := lower(btrim(coalesce(p_target_mode, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before_mode text;
  v_risk text;
  v_claim jsonb;
  v_operation_id uuid;
  v_auth_evidence jsonb;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('maintenance.manage', null, false) then
    raise exception 'Missing Solaris capability: maintenance.manage' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A platform mode change reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  -- Lost-response reconciliation must not require a new preview or another
  -- fresh-auth ceremony for an operation that already succeeded.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'system.platform_mode.change'
    and receipt.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return v_existing.result;
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true
  for update;

  if v_state.version is distinct from p_expected_version then
    raise exception 'Platform operating mode changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_before_mode := v_state.mode;

  if not private.studio2_platform_mode_transition_allowed(v_state.mode, v_target) then
    raise exception 'Invalid platform mode transition: % -> %', v_state.mode, v_target
      using errcode = '23514';
  end if;

  if v_state.mode = v_target then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'mode', v_state.mode,
      'version', v_state.version
    );
  end if;

  v_risk := case
    when v_state.mode in ('read_only', 'maintenance')
      or v_target in ('read_only', 'maintenance')
    then 'R3'
    else 'R2'
  end;

  if v_risk = 'R3' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'system.platform_mode.change',
    v_risk,
    jsonb_build_object(
      'fromMode', v_state.mode,
      'toMode', v_target,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  update public.studio2_platform_operational_state
  set
    mode = v_target,
    version = version + 1,
    affected_services = coalesce(p_affected_services, '{}'::text[]),
    message = nullif(btrim(coalesce(p_message, '')), ''),
    incident_reference = nullif(btrim(coalesce(p_incident_reference, '')), ''),
    reason = v_reason,
    changed_by = v_actor,
    changed_at = now()
  where singleton = true
  returning * into v_state;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'platform_operational_mode_changed',
    'studio2_platform_operational_state',
    'platform',
    jsonb_build_object(
      'fromMode', v_before_mode,
      'expectedVersion', p_expected_version
    ),
    jsonb_build_object(
      'mode', v_state.mode,
      'version', v_state.version,
      'affectedServices', to_jsonb(v_state.affected_services),
      'message', v_state.message,
      'incidentReference', v_state.incident_reference,
      'reason', v_state.reason
    )
  );

  if v_auth_evidence is not null then
    update public.studio2_operation_receipts
    set
      actor_session_id = v_auth_evidence ->> 'sessionId',
      auth_freshness_evidence = v_auth_evidence,
      updated_at = now()
    where operation_id = v_operation_id
      and actor_id = v_actor;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'mode', v_state.mode,
    'version', v_state.version,
    'affectedServices', to_jsonb(v_state.affected_services),
    'message', v_state.message,
    'incidentReference', v_state.incident_reference,
    'changedAt', v_state.changed_at,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_platform_mode_change(
  text, text, text[], text, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_platform_mode_change(
  text, text, text[], text, text, uuid, text, bigint
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
