begin;

-- Organisation OS V5 operation envelope foundation.
--
-- High-impact commands can retry safely by reusing an operation/idempotency
-- identity. The receipt stores command metadata and the canonical successful
-- result, not sensitive request payloads.

create table if not exists public.studio2_operation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  command text not null check (length(btrim(command)) between 1 and 160),
  risk_class text not null check (risk_class in ('R0', 'R1', 'R2', 'R3')),
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_id, command, idempotency_key)
);

create index if not exists studio2_operation_receipts_actor_time_idx
  on public.studio2_operation_receipts (actor_id, created_at desc);
create index if not exists studio2_operation_receipts_command_time_idx
  on public.studio2_operation_receipts (command, created_at desc);

alter table public.studio2_operation_receipts enable row level security;
revoke all on table public.studio2_operation_receipts from public, anon, authenticated;
grant all on table public.studio2_operation_receipts to service_role;

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
as $$
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

  begin
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
    on conflict (actor_id, command, idempotency_key) do nothing;
  exception
    when unique_violation then
      raise exception 'Operation id is already used by another command'
        using errcode = '23505';
  end;

  select *
  into v_receipt
  from public.studio2_operation_receipts
  where actor_id = v_actor
    and command = v_command
    and idempotency_key = v_key
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Operation receipt could not be claimed' using errcode = 'P0001';
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
$$;

create or replace function private.studio2_complete_operation(
  p_operation_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  update public.studio2_operation_receipts
  set
    status = 'succeeded',
    result = coalesce(p_result, '{}'::jsonb),
    updated_at = now()
  where operation_id = p_operation_id
    and actor_id = v_actor;

  if not found then
    raise exception 'Operation receipt not found for current actor' using errcode = 'P0002';
  end if;

  return coalesce(p_result, '{}'::jsonb);
end
$$;

revoke all on function private.studio2_claim_operation(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.studio2_complete_operation(uuid, jsonb)
  from public, anon, authenticated;

drop function if exists public.admin_set_fan_profile_moderation(uuid, boolean, text);

create or replace function public.admin_set_fan_profile_moderation(
  p_profile_id uuid,
  p_hidden boolean,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_before public.fan_profiles;
  v_after public.fan_profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('community.moderate', null, false) then
    raise exception 'Missing Solaris capability: community.moderate' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'community.fan_identity.moderate',
    'R2',
    jsonb_build_object('profileId', p_profile_id)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if p_hidden and v_reason is null then
    raise exception 'A moderation reason is required when hiding a public identity'
      using errcode = '22023';
  end if;

  select *
  into v_before
  from public.fan_profiles
  where id = p_profile_id
  for update;

  if v_before.id is null then
    raise exception 'Fan profile not found' using errcode = 'P0002';
  end if;

  update public.fan_profiles
  set
    moderation_hidden_at = case when p_hidden then now() else null end,
    moderation_reason = case when p_hidden then v_reason else null end,
    moderated_by = auth.uid(),
    updated_at = now()
  where id = p_profile_id
  returning * into v_after;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    case when p_hidden then 'hide_fan_profile_identity' else 'restore_fan_profile_identity' end,
    'fan_profiles',
    p_profile_id::text,
    jsonb_build_object(
      'displayName', v_before.display_name,
      'visibility', v_before.visibility,
      'leaderboardOptIn', v_before.leaderboard_opt_in,
      'hiddenAt', v_before.moderation_hidden_at,
      'moderationReason', v_before.moderation_reason
    ),
    jsonb_build_object(
      'displayName', v_after.display_name,
      'visibility', v_after.visibility,
      'leaderboardOptIn', v_after.leaderboard_opt_in,
      'hiddenAt', v_after.moderation_hidden_at,
      'moderationReason', v_after.moderation_reason
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'profileId', p_profile_id,
    'hidden', p_hidden,
    'hiddenAt', v_after.moderation_hidden_at,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$$;

revoke all on function public.admin_set_fan_profile_moderation(uuid, boolean, text, uuid, text)
  from public, anon;
grant execute on function public.admin_set_fan_profile_moderation(uuid, boolean, text, uuid, text)
  to authenticated, service_role;

drop function if exists public.admin_retry_failed_notification_delivery(uuid);

create or replace function public.admin_retry_failed_notification_delivery(
  p_delivery_id uuid,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_delivery public.notification_deliveries;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('system.manage', null, false) then
    raise exception 'Missing Solaris capability: system.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'system.push.retry_failed',
    'R1',
    jsonb_build_object('deliveryId', p_delivery_id)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'Notification delivery not found' using errcode = 'P0002';
  end if;

  if v_delivery.status <> 'failed' then
    raise exception 'Only failed notification deliveries can be retried' using errcode = '23514';
  end if;

  update public.notification_deliveries
  set
    status = 'pending',
    scheduled_for = now(),
    processing_started_at = null,
    error = null
  where id = p_delivery_id;

  v_result := jsonb_build_object(
    'ok', true,
    'deliveryId', p_delivery_id,
    'status', 'pending',
    'attemptCount', v_delivery.attempt_count,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$$;

revoke all on function public.admin_retry_failed_notification_delivery(uuid, uuid, text)
  from public, anon;
grant execute on function public.admin_retry_failed_notification_delivery(uuid, uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
