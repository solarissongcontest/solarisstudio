begin;

-- Organisation OS V5 push queue leasing.
--
-- The dispatcher used to SELECT pending rows and then send them. Concurrent
-- schedulers could therefore observe the same row before either worker marked it
-- sent. Claim rows atomically and recover abandoned claims after a bounded lease.

alter table public.notification_deliveries
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed'));

create index if not exists notification_deliveries_processing_lease_idx
  on public.notification_deliveries (processing_started_at)
  where status = 'processing';

create or replace function public.solaris_claim_pending_notification_deliveries(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  id uuid,
  user_id uuid,
  category text,
  event_type text,
  route text,
  title text,
  body text,
  dedupe_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.notification_deliveries delivery
  set
    status = 'pending',
    processing_started_at = null,
    error = coalesce(delivery.error, 'Recovered abandoned delivery lease')
  where delivery.status = 'processing'
    and delivery.processing_started_at < p_now - interval '10 minutes';

  return query
  with candidate as (
    select delivery.id
    from public.notification_deliveries delivery
    where delivery.status = 'pending'
      and delivery.scheduled_for <= p_now
    order by delivery.scheduled_for, delivery.created_at
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.notification_deliveries delivery
    set
      status = 'processing',
      processing_started_at = p_now,
      last_attempt_at = p_now,
      attempt_count = delivery.attempt_count + 1,
      error = null
    from candidate
    where delivery.id = candidate.id
    returning
      delivery.id,
      delivery.user_id,
      delivery.category,
      delivery.event_type,
      delivery.route,
      delivery.title,
      delivery.body,
      delivery.dedupe_key
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.category,
    claimed.event_type,
    claimed.route,
    claimed.title,
    claimed.body,
    claimed.dedupe_key
  from claimed;
end
$$;

revoke all on function public.solaris_claim_pending_notification_deliveries(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.solaris_claim_pending_notification_deliveries(timestamptz, integer)
  to service_role;

create or replace function public.admin_retry_failed_notification_delivery(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_delivery public.notification_deliveries;
begin
  if not public.studio2_access_allowed('system.manage', null, false) then
    raise exception 'Missing Solaris capability: system.manage' using errcode = '42501';
  end if;

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

  return jsonb_build_object(
    'ok', true,
    'deliveryId', p_delivery_id,
    'status', 'pending',
    'attemptCount', v_delivery.attempt_count
  );
end
$$;

revoke all on function public.admin_retry_failed_notification_delivery(uuid)
  from public, anon;
grant execute on function public.admin_retry_failed_notification_delivery(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
