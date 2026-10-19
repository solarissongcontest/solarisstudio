begin;

-- System V3 S6 notification reconciliation: second bounded provider.
--
-- Extend the actor/provider repair boundary from required Organizer Task
-- activations to the optional televote-open provider. Canonical eligibility is
-- an open Televoting round plus the recipient's authoritative notification
-- preference. Sent delivery history remains immutable.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s6.notification-reconciliation-televote-open',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive actor/provider-bounded reconciliation for televote-open notifications; whole notification domain remains foundation until all providers are covered.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_expected_televote_open_notification_candidates(
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
set search_path = pg_catalog, public, private, televoting
as $expected$
  select
    round.id::text as subject_id,
    'televote.opened'::text as event_type,
    'televote:' || round.id::text || ':' || p_user_id::text || ':opened' as dedupe_key,
    '/televoting'::text as route,
    'Televoting is open'::text as title,
    round.name::text as body
  from televoting.rounds round
  where p_user_id is not null
    and round.status = 'open'
    and exists (
      select 1
      from public.notification_preferences preference
      where preference.profile_id = p_user_id
        and preference.external_enabled = true
        and 'televoting' = any(preference.categories)
    )
  order by round.id;
$expected$;

revoke all on function private.v3_expected_televote_open_notification_candidates(uuid)
  from public, anon, authenticated;

create or replace function private.v3_expected_notification_provider_candidates(
  p_user_id uuid,
  p_provider_id text
)
returns table (
  subject_id text,
  event_type text,
  dedupe_key text,
  route text,
  title text,
  body text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $dispatch$
begin
  if p_provider_id = 'organizer-task-activation' then
    return query
    select expected.subject_id,
           expected.event_type,
           expected.dedupe_key,
           expected.route,
           expected.title,
           expected.body
    from private.v3_expected_organizer_task_notification_candidates(p_user_id) expected;
    return;
  end if;

  if p_provider_id = 'televote-open' then
    return query
    select expected.subject_id,
           expected.event_type,
           expected.dedupe_key,
           expected.route,
           expected.title,
           expected.body
    from private.v3_expected_televote_open_notification_candidates(p_user_id) expected;
    return;
  end if;

  raise exception 'Unsupported notification reconciliation provider: %', coalesce(p_provider_id, '<null>')
    using errcode = '22023';
end
$dispatch$;

revoke all on function private.v3_expected_notification_provider_candidates(uuid, text)
  from public, anon, authenticated;

create or replace function private.v3_verify_notification_provider(
  p_user_id uuid,
  p_provider_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
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

  if p_provider_id = 'organizer-task-activation' then
    -- Independent verification derives canonical Task truth directly rather
    -- than calling the repair candidate helpers.
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

  elsif p_provider_id = 'televote-open' then
    -- Televote verification independently derives current eligibility from the
    -- canonical round and preference tables. It does not call either expected-
    -- candidate helper used by repair.
    select count(*)::integer
    into v_expected_count
    from televoting.rounds round
    where round.status = 'open'
      and exists (
        select 1
        from public.notification_preferences preference
        where preference.profile_id = p_user_id
          and preference.external_enabled = true
          and 'televoting' = any(preference.categories)
      );

    select count(*)::integer
    into v_delivery_count
    from public.notification_deliveries delivery
    where delivery.user_id = p_user_id
      and delivery.category = 'televoting'
      and delivery.event_type = 'televote.opened';

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
    from televoting.rounds round
    where round.status = 'open'
      and exists (
        select 1
        from public.notification_preferences preference
        where preference.profile_id = p_user_id
          and preference.external_enabled = true
          and 'televoting' = any(preference.categories)
      )
      and not exists (
        select 1
        from public.notification_deliveries delivery
        where delivery.user_id = p_user_id
          and delivery.category = 'televoting'
          and delivery.event_type = 'televote.opened'
          and delivery.dedupe_key = 'televote:' || round.id::text || ':' || p_user_id::text || ':opened'
      );

    select count(*)::integer
    into v_suppressed_expected
    from televoting.rounds round
    join public.notification_deliveries delivery
      on delivery.user_id = p_user_id
     and delivery.category = 'televoting'
     and delivery.event_type = 'televote.opened'
     and delivery.dedupe_key = 'televote:' || round.id::text || ':' || p_user_id::text || ':opened'
     and delivery.status = 'suppressed'
    where round.status = 'open'
      and exists (
        select 1
        from public.notification_preferences preference
        where preference.profile_id = p_user_id
          and preference.external_enabled = true
          and 'televoting' = any(preference.categories)
      );

    select count(*)::integer
    into v_stale_active
    from public.notification_deliveries delivery
    where delivery.user_id = p_user_id
      and delivery.category = 'televoting'
      and delivery.event_type = 'televote.opened'
      and delivery.status in ('pending', 'processing', 'failed')
      and not exists (
        select 1
        from televoting.rounds round
        where round.status = 'open'
          and delivery.dedupe_key = 'televote:' || round.id::text || ':' || p_user_id::text || ':opened'
          and exists (
            select 1
            from public.notification_preferences preference
            where preference.profile_id = p_user_id
              and preference.external_enabled = true
              and 'televoting' = any(preference.categories)
          )
      );

    select count(*)::integer
    into v_pending_payload_drift
    from televoting.rounds round
    join public.notification_deliveries delivery
      on delivery.user_id = p_user_id
     and delivery.category = 'televoting'
     and delivery.event_type = 'televote.opened'
     and delivery.dedupe_key = 'televote:' || round.id::text || ':' || p_user_id::text || ':opened'
     and delivery.status = 'pending'
    where round.status = 'open'
      and exists (
        select 1
        from public.notification_preferences preference
        where preference.profile_id = p_user_id
          and preference.external_enabled = true
          and 'televoting' = any(preference.categories)
      )
      and (
        delivery.subject_id is distinct from round.id::text
        or delivery.route is distinct from '/televoting'
        or delivery.title is distinct from 'Televoting is open'
        or delivery.body is distinct from round.name
      );

  else
    raise exception 'Unsupported notification reconciliation provider: %', coalesce(p_provider_id, '<null>')
      using errcode = '22023';
  end if;

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

create or replace function private.v3_reconcile_notification_provider(
  p_user_id uuid,
  p_provider_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $reconcile$
declare
  v_category text;
  v_event_type text;
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

  if p_provider_id = 'organizer-task-activation' then
    v_category := 'organizer_tasks';
    v_event_type := null;
  elsif p_provider_id = 'televote-open' then
    v_category := 'televoting';
    v_event_type := 'televote.opened';
  else
    raise exception 'Unsupported notification reconciliation provider: %', coalesce(p_provider_id, '<null>')
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_count
  from private.v3_expected_notification_provider_candidates(p_user_id, p_provider_id);

  select count(*)::integer
  into v_delivery_count
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.category = v_category
    and (v_event_type is null or delivery.event_type = v_event_type);

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

  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = 'Notification provider reconciliation: candidate no longer authoritative.'
  where delivery.user_id = p_user_id
    and delivery.category = v_category
    and (v_event_type is null or delivery.event_type = v_event_type)
    and delivery.status in ('pending', 'processing', 'failed')
    and not exists (
      select 1
      from private.v3_expected_notification_provider_candidates(p_user_id, p_provider_id) expected
      where expected.dedupe_key = delivery.dedupe_key
    );
  get diagnostics v_suppressed = row_count;

  update public.notification_deliveries delivery
  set
    status = 'pending',
    scheduled_for = p_now,
    processing_started_at = null,
    error = null
  where delivery.user_id = p_user_id
    and delivery.category = v_category
    and (v_event_type is null or delivery.event_type = v_event_type)
    and delivery.status = 'suppressed'
    and exists (
      select 1
      from private.v3_expected_notification_provider_candidates(p_user_id, p_provider_id) expected
      where expected.dedupe_key = delivery.dedupe_key
    );
  get diagnostics v_reactivated = row_count;

  update public.notification_deliveries delivery
  set
    event_type = expected.event_type,
    subject_id = expected.subject_id,
    route = expected.route,
    title = expected.title,
    body = expected.body
  from private.v3_expected_notification_provider_candidates(p_user_id, p_provider_id) expected
  where delivery.user_id = p_user_id
    and delivery.category = v_category
    and (v_event_type is null or delivery.event_type = v_event_type)
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
    v_category,
    expected.event_type,
    expected.subject_id,
    expected.dedupe_key,
    expected.route,
    expected.title,
    expected.body,
    p_now
  from private.v3_expected_notification_provider_candidates(p_user_id, p_provider_id) expected
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

comment on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz) is
  'S6 actor/provider-bounded notification repair. Covered providers: organizer-task-activation and televote-open; whole notification projection remains foundation until every provider is covered.';
comment on function public.studio2_verify_notification_provider(uuid, text) is
  'Independent read-only S6 verifier for one recipient/provider. Covered providers: organizer-task-activation and televote-open.';

notify pgrst, 'reload schema';

commit;
