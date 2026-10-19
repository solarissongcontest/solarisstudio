begin;

-- System V3 S6 notification reconciliation foundation.
--
-- `notification_deliveries` is the canonical delivery lifecycle, while each
-- provider owns candidate generation. This first bounded repair slice covers
-- the required Organizer Task activation provider only. It deliberately does
-- not claim whole-domain rebuildability until every registered provider has an
-- equivalent scoped repair + independent verifier.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s6.notification-reconciliation-organizer-task',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive actor/provider-bounded reconciliation for Organizer Task notification deliveries; remaining notification providers stay foundation-only.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_expected_organizer_task_notification_candidates(
  p_user_id uuid
)
returns table (
  subject_id text,
  event_type text,
  dedupe_key text,
  route text,
  title text,
  body text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $expected$
  select
    task.id::text as subject_id,
    case
      when task.priority = 'critical' then 'organizer_task.critical'::text
      else 'organizer_task.high'::text
    end as event_type,
    'organizer-task:' || task.source_key || ':' || p_user_id::text as dedupe_key,
    task.href::text as route,
    task.title::text as title,
    left(coalesce(task.description, ''), 240)::text as body
  from public.studio2_organizer_tasks task
  where p_user_id is not null
    and task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and task.href like '/%'
    and private.studio2_task_recipient_eligible(task.id, p_user_id)
  order by task.source_key, task.id;
$expected$;

revoke all on function private.v3_expected_organizer_task_notification_candidates(uuid)
  from public, anon, authenticated;

create or replace function private.v3_verify_notification_provider(
  p_user_id uuid,
  p_provider_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $verify$
declare
  v_expected_count integer := 0;
  v_delivery_count integer := 0;
  v_missing integer := 0;
  v_suppressed_expected integer := 0;
  v_stale_active integer := 0;
  v_pending_payload_drift integer := 0;
  v_state text := 'consistent';
begin
  if p_user_id is null then
    raise exception 'Notification reconciliation user is required' using errcode = '22023';
  end if;
  if p_provider_id is distinct from 'organizer-task-activation' then
    raise exception 'Unsupported notification reconciliation provider: %', coalesce(p_provider_id, '<null>')
      using errcode = '22023';
  end if;

  -- Independent verification intentionally derives expected truth directly
  -- from canonical Tasks instead of calling the repair candidate helper.
  select count(*)::integer
  into v_expected_count
  from public.studio2_organizer_tasks task
  where task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and task.href like '/%'
    and private.studio2_task_recipient_eligible(task.id, p_user_id);

  select count(*)::integer
  into v_delivery_count
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks';

  if v_expected_count > 100 or v_delivery_count > 250 then
    return jsonb_build_object(
      'providerId', p_provider_id,
      'userId', p_user_id,
      'state', 'unknown',
      'reason', 'verification_bound_exceeded',
      'expectedCount', v_expected_count,
      'deliveryCount', v_delivery_count,
      'expectedLimit', 100,
      'deliveryLimit', 250,
      'verifiedAt', now()
    );
  end if;

  select count(*)::integer
  into v_missing
  from public.studio2_organizer_tasks task
  where task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and task.href like '/%'
    and private.studio2_task_recipient_eligible(task.id, p_user_id)
    and not exists (
      select 1
      from public.notification_deliveries delivery
      where delivery.user_id = p_user_id
        and delivery.category = 'organizer_tasks'
        and delivery.dedupe_key = 'organizer-task:' || task.source_key || ':' || p_user_id::text
    );

  select count(*)::integer
  into v_suppressed_expected
  from public.studio2_organizer_tasks task
  join public.notification_deliveries delivery
    on delivery.user_id = p_user_id
   and delivery.category = 'organizer_tasks'
   and delivery.dedupe_key = 'organizer-task:' || task.source_key || ':' || p_user_id::text
   and delivery.status = 'suppressed'
  where task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and task.href like '/%'
    and private.studio2_task_recipient_eligible(task.id, p_user_id);

  select count(*)::integer
  into v_stale_active
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks'
    and delivery.status in ('pending', 'processing', 'failed')
    and not exists (
      select 1
      from public.studio2_organizer_tasks task
      where task.state <> 'resolved'
        and task.priority in ('critical', 'high')
        and task.href like '/%'
        and private.studio2_task_recipient_eligible(task.id, p_user_id)
        and delivery.dedupe_key = 'organizer-task:' || task.source_key || ':' || p_user_id::text
    );

  select count(*)::integer
  into v_pending_payload_drift
  from public.studio2_organizer_tasks task
  join public.notification_deliveries delivery
    on delivery.user_id = p_user_id
   and delivery.category = 'organizer_tasks'
   and delivery.dedupe_key = 'organizer-task:' || task.source_key || ':' || p_user_id::text
   and delivery.status = 'pending'
  where task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and task.href like '/%'
    and private.studio2_task_recipient_eligible(task.id, p_user_id)
    and (
      delivery.subject_id is distinct from task.id::text
      or delivery.event_type is distinct from case
        when task.priority = 'critical' then 'organizer_task.critical'
        else 'organizer_task.high'
      end
      or delivery.route is distinct from task.href
      or delivery.title is distinct from task.title
      or delivery.body is distinct from left(coalesce(task.description, ''), 240)
    );

  if v_missing > 0
     or v_suppressed_expected > 0
     or v_stale_active > 0
     or v_pending_payload_drift > 0 then
    v_state := 'drift';
  end if;

  return jsonb_build_object(
    'providerId', p_provider_id,
    'userId', p_user_id,
    'state', v_state,
    'reason', 'verified',
    'expectedCount', v_expected_count,
    'deliveryCount', v_delivery_count,
    'missing', v_missing,
    'suppressedExpected', v_suppressed_expected,
    'staleActive', v_stale_active,
    'pendingPayloadDrift', v_pending_payload_drift,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function private.v3_verify_notification_provider(uuid, text)
  from public, anon, authenticated;

create or replace function public.studio2_verify_notification_provider(
  p_user_id uuid,
  p_provider_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $service_verify$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return private.v3_verify_notification_provider(p_user_id, p_provider_id);
end
$service_verify$;

revoke all on function public.studio2_verify_notification_provider(uuid, text)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_notification_provider(uuid, text)
  to service_role;

create or replace function private.v3_reconcile_notification_provider(
  p_user_id uuid,
  p_provider_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_expected_count integer := 0;
  v_delivery_count integer := 0;
  v_inserted integer := 0;
  v_reactivated integer := 0;
  v_suppressed integer := 0;
  v_refreshed integer := 0;
  v_verification jsonb;
begin
  if p_user_id is null then
    raise exception 'Notification reconciliation user is required' using errcode = '22023';
  end if;
  if p_provider_id is distinct from 'organizer-task-activation' then
    raise exception 'Unsupported notification reconciliation provider: %', coalesce(p_provider_id, '<null>')
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_count
  from private.v3_expected_organizer_task_notification_candidates(p_user_id);

  select count(*)::integer
  into v_delivery_count
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks';

  -- Fail without mutation rather than turning one repair request into an
  -- unbounded service-role fanout.
  if v_expected_count > 100 or v_delivery_count > 250 then
    return jsonb_build_object(
      'providerId', p_provider_id,
      'userId', p_user_id,
      'state', 'unknown',
      'reason', 'repair_bound_exceeded',
      'expectedCount', v_expected_count,
      'deliveryCount', v_delivery_count,
      'expectedLimit', 100,
      'deliveryLimit', 250,
      'changed', 0
    );
  end if;

  -- Stale, not-yet-successful deliveries are safe to suppress. Sent history is
  -- immutable evidence and is intentionally never rewritten by reconciliation.
  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = 'Notification provider reconciliation: candidate no longer authoritative.'
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks'
    and delivery.status in ('pending', 'processing', 'failed')
    and not exists (
      select 1
      from private.v3_expected_organizer_task_notification_candidates(p_user_id) expected
      where expected.dedupe_key = delivery.dedupe_key
    );
  get diagnostics v_suppressed = row_count;

  -- A previously suppressed delivery was never successfully sent. If canonical
  -- Task truth makes it eligible again, restore the existing dedupe identity
  -- instead of creating a second delivery row.
  update public.notification_deliveries delivery
  set
    status = 'pending',
    scheduled_for = p_now,
    processing_started_at = null,
    error = null
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks'
    and delivery.status = 'suppressed'
    and exists (
      select 1
      from private.v3_expected_organizer_task_notification_candidates(p_user_id) expected
      where expected.dedupe_key = delivery.dedupe_key
    );
  get diagnostics v_reactivated = row_count;

  -- Pending rows have not crossed the transport boundary, so refresh their
  -- presentation from canonical Task truth. Processing/failed/sent rows are
  -- deliberately left alone.
  update public.notification_deliveries delivery
  set
    event_type = expected.event_type,
    subject_id = expected.subject_id,
    route = expected.route,
    title = expected.title,
    body = expected.body
  from private.v3_expected_organizer_task_notification_candidates(p_user_id) expected
  where delivery.user_id = p_user_id
    and delivery.category = 'organizer_tasks'
    and delivery.status = 'pending'
    and delivery.dedupe_key = expected.dedupe_key
    and (
      delivery.event_type is distinct from expected.event_type
      or delivery.subject_id is distinct from expected.subject_id
      or delivery.route is distinct from expected.route
      or delivery.title is distinct from expected.title
      or delivery.body is distinct from expected.body
    );
  get diagnostics v_refreshed = row_count;

  insert into public.notification_deliveries (
    user_id,
    category,
    event_type,
    subject_id,
    dedupe_key,
    route,
    title,
    body,
    scheduled_for
  )
  select
    p_user_id,
    'organizer_tasks',
    expected.event_type,
    expected.subject_id,
    expected.dedupe_key,
    expected.route,
    expected.title,
    expected.body,
    p_now
  from private.v3_expected_organizer_task_notification_candidates(p_user_id) expected
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;

  v_verification := private.v3_verify_notification_provider(p_user_id, p_provider_id);

  return jsonb_build_object(
    'providerId', p_provider_id,
    'userId', p_user_id,
    'state', v_verification ->> 'state',
    'reason', v_verification ->> 'reason',
    'expectedCount', v_expected_count,
    'deliveryCountBefore', v_delivery_count,
    'inserted', v_inserted,
    'reactivated', v_reactivated,
    'suppressed', v_suppressed,
    'refreshed', v_refreshed,
    'changed', v_inserted + v_reactivated + v_suppressed + v_refreshed,
    'verification', v_verification
  );
end
$reconcile$;

revoke all on function private.v3_reconcile_notification_provider(uuid, text, timestamptz)
  from public, anon, authenticated;

create or replace function public.studio2_reconcile_notification_provider(
  p_user_id uuid,
  p_provider_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $service_reconcile$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return private.v3_reconcile_notification_provider(p_user_id, p_provider_id, p_now);
end
$service_reconcile$;

revoke all on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz)
  to service_role;

comment on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz) is
  'S6 actor/provider-bounded notification repair. Current provider coverage: organizer-task-activation only; whole notification projection remains foundation until every provider is covered.';
comment on function public.studio2_verify_notification_provider(uuid, text) is
  'Independent read-only S6 verifier for one notification recipient/provider. Current provider coverage: organizer-task-activation only.';

notify pgrst, 'reload schema';

commit;
