begin;

-- Organisation OS V5 system diagnostics.
--
-- Keep delivery subscriptions and raw push contents private. Organizer support
-- gets a narrow diagnostic projection instead of direct cross-user table access.

insert into public.studio2_capabilities (key, domain, label, description, access_level)
values
  (
    'system.read',
    'system',
    'View system operations',
    'View protected delivery, scheduler and platform diagnostics without exposing notification secrets.',
    'read'
  ),
  (
    'system.manage',
    'system',
    'Manage system operations',
    'Perform explicitly supported recovery operations for platform services.',
    'administer'
  )
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('superadmin', 'system.read'),
  ('superadmin', 'system.manage'),
  ('organizer', 'system.read'),
  ('organizer', 'system.manage')
on conflict do nothing;

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
