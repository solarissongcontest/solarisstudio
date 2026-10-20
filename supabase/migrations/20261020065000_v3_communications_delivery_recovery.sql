begin;

-- System V3 / Organizer O10 Communications.
--
-- Official Communications already owns audience eligibility, recipient receipts,
-- push queue lifecycle, governed per-delivery retry and notification failure
-- tasks. This migration composes those existing authorities into the two missing
-- Organizer contracts:
--   1. advisory pre-send recipient/channel preview without fake receipts;
--   2. notice-scoped delivery visibility + bounded idempotent retry of failures.
--
-- No push endpoint/key material or recipient PII is exposed by these RPCs.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.communications.delivery-recovery',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive O10 recipient preview and notice-scoped delivery recovery projection over canonical notice audience, notification delivery and S2 operation authorities.'
);
select set_config('request.jwt.claim.role', '', true);

create index if not exists notification_deliveries_official_subject_status_idx
  on public.notification_deliveries (subject_id, status, created_at desc)
  where category = 'official';

-- One candidate universe for both advisory preview and publication-time receipt
-- materialization. Eligibility itself remains owned by the existing narrow
-- recipient predicate, including Jury/role/capability/delegation semantics.
create or replace function private.v3_notice_eligible_recipient_ids(
  p_notice_id uuid
)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $eligible$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;

  if v_notice.id is null then
    raise exception 'Notice not found' using errcode = 'P0002';
  end if;

  return query
  with candidate_users as (
    select account.user_id
    from public.country_accounts account
    where account.status = 'active'

    union

    select assignment.user_id
    from public.studio2_role_assignments assignment
    where assignment.expires_at is null or assignment.expires_at > now()

    union

    select grant_row.user_id
    from public.studio2_capability_grants grant_row
    where grant_row.expires_at is null or grant_row.expires_at > now()
  )
  select candidate.user_id
  from candidate_users candidate
  where private.studio2_user_can_receive_notice_as_recipient(
    candidate.user_id,
    v_notice.edition_id,
    v_notice.audience,
    v_notice.country_ids,
    v_notice.audience_group
  );
end
$eligible$;

revoke all on function private.v3_notice_eligible_recipient_ids(uuid)
  from public, anon, authenticated, service_role;

-- Keep publication-time materialization on exactly the same candidate/eligibility
-- semantics as preview. Publish still re-evaluates the helper inside the commit;
-- preview is never permission to reuse a stale recipient list.
create or replace function private.v3_materialize_notice_recipients(
  p_notice_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $materialize$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_affected integer := 0;
begin
  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;

  if v_notice.id is null then
    raise exception 'Notice not found' using errcode = 'P0002';
  end if;
  if v_notice.status <> 'published' or v_notice.sent_at is null then
    raise exception 'Only a published notice can materialize recipients'
      using errcode = '23514';
  end if;

  insert into public.studio2_notice_receipts (
    notice_id,
    recipient_user_id,
    delivered_at
  )
  select
    v_notice.id,
    eligible.user_id,
    v_notice.sent_at
  from private.v3_notice_eligible_recipient_ids(v_notice.id) eligible
  on conflict (notice_id, recipient_user_id)
  do update set delivered_at = coalesce(
    public.studio2_notice_receipts.delivered_at,
    excluded.delivered_at
  );

  get diagnostics v_affected = row_count;
  return v_affected;
end
$materialize$;

revoke all on function private.v3_materialize_notice_recipients(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_notice_recipient_preview(
  p_edition_id uuid,
  p_notice_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_eligible integer := 0;
  v_push_eligible integer := 0;
begin
  if p_notice_id is null then
    raise exception 'Notice id is required' using errcode = '22023';
  end if;

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
    and notice.edition_id is not distinct from p_edition_id;

  if v_notice.id is null then
    raise exception 'Notice not found in requested edition scope' using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);

  select count(*)::integer
  into v_eligible
  from private.v3_notice_eligible_recipient_ids(v_notice.id);

  select count(*)::integer
  into v_push_eligible
  from private.v3_notice_eligible_recipient_ids(v_notice.id) eligible
  where exists (
      select 1
      from public.notification_preferences preference
      where preference.profile_id = eligible.user_id
        and preference.external_enabled = true
        and 'official' = any(preference.categories)
    )
    and exists (
      select 1
      from public.app_push_subscriptions subscription
      where subscription.user_id = eligible.user_id
        and subscription.disabled_at is null
    );

  return jsonb_build_object(
    'schemaVersion', 1,
    'noticeId', v_notice.id,
    'editionId', v_notice.edition_id,
    'noticeStatus', v_notice.status,
    'stateVersion', v_notice.revision,
    'audience', v_notice.audience,
    'audienceGroup', v_notice.audience_group,
    'countryIds', coalesce(to_jsonb(v_notice.country_ids), '[]'::jsonb),
    'acknowledgementRequired', v_notice.acknowledgement_required,
    'eligibleRecipients', v_eligible,
    'deliveryChannels', jsonb_build_array('in_app', 'push'),
    'inAppSurfaces', coalesce(to_jsonb(v_notice.display_surfaces), '[]'::jsonb),
    'pushEligible', v_push_eligible,
    'advisoryOnly', true,
    'publishRevalidatesRecipients', true,
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_notice_recipient_preview(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.studio2_notice_recipient_preview(uuid, uuid)
  to authenticated;

-- Push-provider error strings may contain URLs or vendor implementation detail.
-- Organizer Communications only needs an operational category, not raw transport
-- diagnostics. Full diagnostics remain in the existing system-operations surface.
create or replace function private.v3_safe_notification_error_summary(p_error text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $summary$
  select case
    when p_error is null or btrim(p_error) = '' then null
    when lower(p_error) ~ '(410|gone|expired|subscription.*invalid)' then 'Push subscription is no longer valid'
    when lower(p_error) ~ '(429|rate.?limit|too many)' then 'Push provider rate limit'
    when lower(p_error) ~ '(timeout|timed out|network|fetch)' then 'Push network failure'
    when lower(p_error) ~ '(401|403|unauthori|forbidden|vapid)' then 'Push provider authorization failure'
    when lower(p_error) ~ '(400|payload|invalid)' then 'Push provider rejected the delivery'
    else 'Notification delivery failed'
  end
$summary$;

revoke all on function private.v3_safe_notification_error_summary(text)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_notice_delivery_summary(
  p_edition_id uuid,
  p_notice_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $summary$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_failed jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_pending integer := 0;
  v_processing integer := 0;
  v_sent integer := 0;
  v_failed_count integer := 0;
  v_suppressed integer := 0;
  v_provider_accepted integer := 0;
  v_received integer := 0;
  v_displayed integer := 0;
  v_opened integer := 0;
  v_can_retry boolean := false;
begin
  if p_notice_id is null then
    raise exception 'Notice id is required' using errcode = '22023';
  end if;

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
    and notice.edition_id is not distinct from p_edition_id;

  if v_notice.id is null then
    raise exception 'Notice not found in requested edition scope' using errcode = 'P0002';
  end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);
  v_can_retry := public.studio2_access_allowed('system.manage', null, false);

  select
    count(*)::integer,
    count(*) filter (where delivery.status = 'pending')::integer,
    count(*) filter (where delivery.status = 'processing')::integer,
    count(*) filter (where delivery.status = 'sent')::integer,
    count(*) filter (where delivery.status = 'failed')::integer,
    count(*) filter (where delivery.status = 'suppressed')::integer,
    count(*) filter (where delivery.provider_accepted_at is not null)::integer,
    count(*) filter (where delivery.received_at is not null)::integer,
    count(*) filter (where delivery.displayed_at is not null)::integer,
    count(*) filter (where delivery.opened_at is not null)::integer
  into
    v_total,
    v_pending,
    v_processing,
    v_sent,
    v_failed_count,
    v_suppressed,
    v_provider_accepted,
    v_received,
    v_displayed,
    v_opened
  from public.notification_deliveries delivery
  where delivery.category = 'official'
    and delivery.subject_id = v_notice.id::text
    and delivery.event_type in ('official.notice', 'official.acknowledgement_required');

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'deliveryId', failed.id,
        'attemptCount', failed.attempt_count,
        'lastAttemptAt', failed.last_attempt_at,
        'errorSummary', private.v3_safe_notification_error_summary(failed.error)
      ))
      order by failed.last_attempt_at desc nulls last, failed.created_at desc, failed.id
    ),
    '[]'::jsonb
  )
  into v_failed
  from (
    select delivery.*
    from public.notification_deliveries delivery
    where delivery.category = 'official'
      and delivery.subject_id = v_notice.id::text
      and delivery.event_type in ('official.notice', 'official.acknowledgement_required')
      and delivery.status = 'failed'
    order by delivery.last_attempt_at desc nulls last, delivery.created_at desc, delivery.id
    limit 100
  ) failed;

  return jsonb_build_object(
    'schemaVersion', 1,
    'noticeId', v_notice.id,
    'editionId', v_notice.edition_id,
    'noticeStatus', v_notice.status,
    'noticeRevision', v_notice.revision,
    'total', v_total,
    'pending', v_pending + v_processing,
    'queued', v_pending,
    'processing', v_processing,
    'sent', v_sent,
    'providerAccepted', v_provider_accepted,
    'received', v_received,
    'displayed', v_displayed,
    'opened', v_opened,
    'failed', v_failed_count,
    'suppressed', v_suppressed,
    'failedDeliveries', v_failed,
    'failedDeliveryListTruncated', v_failed_count > 100,
    'retryCapability', 'system.manage',
    'canRetryFailed', v_can_retry,
    'serverTime', now()
  );
end
$summary$;

revoke all on function public.studio2_notice_delivery_summary(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.studio2_notice_delivery_summary(uuid, uuid)
  to authenticated;

create or replace function private.v3_notice_retry_child_operation_id(
  p_parent_operation_id uuid,
  p_delivery_id uuid
)
returns uuid
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $identity$
declare
  v_fingerprint text;
begin
  if p_parent_operation_id is null or p_delivery_id is null then
    raise exception 'Retry operation identity is incomplete' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'system.push.retry_failed',
    'R1',
    jsonb_build_object('deliveryId', p_delivery_id),
    jsonb_build_object('parentOperationId', p_parent_operation_id)
  );

  return (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;
end
$identity$;

revoke all on function private.v3_notice_retry_child_operation_id(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_retry_failed_notice_deliveries(
  p_edition_id uuid,
  p_notice_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_limit integer default 50,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retry$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_claim jsonb;
  v_operation_id uuid;
  v_delivery_id uuid;
  v_child_operation_id uuid;
  v_retried integer := 0;
  v_failed_before integer := 0;
  v_remaining_failed integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('system.manage', null, false) then
    raise exception 'Missing Solaris capability: system.manage' using errcode = '42501';
  end if;
  if p_notice_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_limit is null
     or p_limit < 1
     or p_limit > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
    and notice.edition_id is not distinct from p_edition_id;

  if v_notice.id is null then
    raise exception 'Notice not found in requested edition scope' using errcode = 'P0002';
  end if;
  if v_notice.status <> 'published' or v_notice.sent_at is null then
    raise exception 'Only a currently published notice can retry failed deliveries'
      using errcode = '23514';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'system.push.retry_failed',
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'noticeId', p_notice_id,
      'mode', 'notice_batch'
    )),
    jsonb_build_object('limit', v_limit)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('notice-delivery-retry:' || p_notice_id::text, 0)
  );

  select count(*)::integer
  into v_failed_before
  from public.notification_deliveries delivery
  where delivery.category = 'official'
    and delivery.subject_id = p_notice_id::text
    and delivery.event_type in ('official.notice', 'official.acknowledgement_required')
    and delivery.status = 'failed';

  for v_delivery_id in
    select delivery.id
    from public.notification_deliveries delivery
    where delivery.category = 'official'
      and delivery.subject_id = p_notice_id::text
      and delivery.event_type in ('official.notice', 'official.acknowledgement_required')
      and delivery.status = 'failed'
    order by delivery.last_attempt_at nulls first, delivery.created_at, delivery.id
    for update skip locked
    limit v_limit
  loop
    v_child_operation_id := private.v3_notice_retry_child_operation_id(
      v_operation_id,
      v_delivery_id
    );

    perform public.admin_retry_failed_notification_delivery(
      v_delivery_id,
      v_child_operation_id,
      'notice-batch:' || v_operation_id::text || ':' || v_delivery_id::text
    );

    -- The existing notification.queued consequence will reconcile this again
    -- asynchronously. Resolve immediately too so O10 does not show a stale
    -- Delivery Issue while the outbox worker is between polling intervals.
    perform private.v3_reconcile_notification_delivery_task(v_delivery_id);
    v_retried := v_retried + 1;
  end loop;

  select count(*)::integer
  into v_remaining_failed
  from public.notification_deliveries delivery
  where delivery.category = 'official'
    and delivery.subject_id = p_notice_id::text
    and delivery.event_type in ('official.notice', 'official.acknowledgement_required')
    and delivery.status = 'failed';

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'noticeId', p_notice_id,
    'editionId', p_edition_id,
    'outcome', case when v_remaining_failed = 0 then 'success' else 'partial' end,
    'counts', jsonb_build_object(
      'eligibleFailedBefore', v_failed_before,
      'attempted', v_retried,
      'succeeded', v_retried,
      'failed', 0,
      'remainingFailed', v_remaining_failed
    ),
    'batchLimit', v_limit,
    'serverTime', now()
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'notice_failed_deliveries_retried',
    'notification_deliveries',
    p_notice_id::text,
    jsonb_build_object(
      'editionId', p_edition_id,
      'failedCount', v_failed_before
    ),
    jsonb_build_object(
      'operationId', v_operation_id,
      'editionId', p_edition_id,
      'retriedCount', v_retried,
      'remainingFailed', v_remaining_failed
    )
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$retry$;

revoke all on function public.studio2_retry_failed_notice_deliveries(
  uuid, uuid, uuid, text, integer, uuid
) from public, anon, service_role;
grant execute on function public.studio2_retry_failed_notice_deliveries(
  uuid, uuid, uuid, text, integer, uuid
) to authenticated;

comment on function public.studio2_notice_recipient_preview(uuid, uuid)
is 'O10 advisory pre-send recipient/channel preview. Uses the same canonical recipient eligibility helper as publish-time receipt materialization; publication always re-evaluates recipients.';

comment on function public.studio2_notice_delivery_summary(uuid, uuid)
is 'O10 notice-scoped delivery projection. Exposes aggregate push lifecycle plus bounded failed delivery operational IDs without recipient PII or provider endpoint/key material.';

comment on function public.studio2_retry_failed_notice_deliveries(uuid, uuid, uuid, text, integer, uuid)
is 'O10 bounded notice-scoped retry wrapper. Requires system.manage and delegates each selected failed row to the existing governed per-delivery retry authority under one parent S2 operation.';

notify pgrst, 'reload schema';

commit;
