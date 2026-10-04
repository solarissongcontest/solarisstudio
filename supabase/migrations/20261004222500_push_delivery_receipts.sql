begin;

-- Push delivery observability.
--
-- sent_at historically meant that the upstream Web Push provider accepted the
-- request. It did not prove that a service worker received or displayed the
-- notification. Keep the legacy field for compatibility, but add explicit
-- stages so Organizer diagnostics stop confusing provider acceptance with
-- human-visible delivery.

alter table public.notification_deliveries
  add column if not exists provider_accepted_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists displayed_at timestamptz,
  add column if not exists receipt_token_hash text;

comment on column public.notification_deliveries.provider_accepted_at is
  'Timestamp when the upstream Web Push provider accepted at least one send request.';
comment on column public.notification_deliveries.received_at is
  'Timestamp reported by the device service worker after receiving the push event.';
comment on column public.notification_deliveries.displayed_at is
  'Timestamp reported after showNotification resolved successfully.';
comment on column public.notification_deliveries.opened_at is
  'Timestamp reported when the user clicked the notification.';

create or replace function public.admin_system_runtime_health(
  p_delivery_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_delivery_limit, 40), 100));
  v_jobs jsonb := '[]'::jsonb;
begin
  if not public.studio2_access_allowed('system.read', null, false) then
    raise exception 'Missing Solaris capability: system.read' using errcode = '42501';
  end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $jobs$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'jobId', job.jobid,
            'name', job.jobname,
            'schedule', job.schedule,
            'active', job.active,
            'lastStatus', last_run.status,
            'lastStartAt', last_run.start_time,
            'lastEndAt', last_run.end_time,
            'lastMessage', left(coalesce(last_run.return_message, ''), 500)
          )
          order by job.jobname
        ),
        '[]'::jsonb
      )
      from cron.job job
      left join lateral (
        select run.status, run.start_time, run.end_time, run.return_message
        from cron.job_run_details run
        where run.jobid = job.jobid
        order by run.start_time desc nulls last, run.runid desc
        limit 1
      ) last_run on true
      where job.jobname like 'solaris-%'
    $jobs$ into v_jobs;
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'push', jsonb_build_object(
      'subscriptions', jsonb_build_object(
        'active', (
          select count(*)
          from public.app_push_subscriptions subscription
          where subscription.disabled_at is null
        ),
        'disabled', (
          select count(*)
          from public.app_push_subscriptions subscription
          where subscription.disabled_at is not null
        )
      ),
      'deliveries', jsonb_build_object(
        'pending', (
          select count(*) from public.notification_deliveries delivery
          where delivery.status = 'pending'
        ),
        'providerAccepted24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.provider_accepted_at >= now() - interval '24 hours'
        ),
        'received24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.received_at >= now() - interval '24 hours'
        ),
        'displayed24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.displayed_at >= now() - interval '24 hours'
        ),
        'opened24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.opened_at >= now() - interval '24 hours'
        ),
        'sent24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.status = 'sent'
            and delivery.sent_at >= now() - interval '24 hours'
        ),
        'failed24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.status = 'failed'
            and delivery.created_at >= now() - interval '24 hours'
        ),
        'suppressed24h', (
          select count(*) from public.notification_deliveries delivery
          where delivery.status = 'suppressed'
            and delivery.created_at >= now() - interval '24 hours'
        )
      ),
      'recent', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', recent.id,
              'category', recent.category,
              'eventType', recent.event_type,
              'route', recent.route,
              'status', recent.status,
              'scheduledFor', recent.scheduled_for,
              'sentAt', recent.sent_at,
              'providerAcceptedAt', recent.provider_accepted_at,
              'receivedAt', recent.received_at,
              'displayedAt', recent.displayed_at,
              'openedAt', recent.opened_at,
              'createdAt', recent.created_at,
              'error', case
                when recent.error is null then null
                else left(recent.error, 500)
              end
            )
            order by recent.created_at desc
          ),
          '[]'::jsonb
        )
        from (
          select delivery.*
          from public.notification_deliveries delivery
          order by delivery.created_at desc
          limit v_limit
        ) recent
      )
    ),
    'jobs', v_jobs
  );
end
$$;

revoke all on function public.admin_system_runtime_health(integer)
  from public, anon;
grant execute on function public.admin_system_runtime_health(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
