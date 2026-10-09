begin;

-- Organisation OS V5 background-job recovery.
--
-- Never execute cron.job.command from an authenticated browser request.
-- Failed/inactive Solaris-owned jobs instead project into canonical Organizer
-- Tasks. Active jobs recover through their existing scheduler cadence; repeated
-- failures become dead-letter attention until a successful run clears them.

create or replace function private.studio2_reconcile_system_job_tasks()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
begin
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then
    update public.studio2_organizer_tasks
    set
      state = 'resolved',
      resolved_at = coalesce(resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
    where source_kind = 'system_job'
      and state <> 'resolved';
    return;
  end if;

  -- Re-evaluate from authoritative scheduler state on every Task reconciliation.
  update public.studio2_organizer_tasks
  set
    state = 'resolved',
    resolved_at = coalesce(resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where source_kind = 'system_job'
    and state <> 'resolved';

  execute $jobs$
    insert into public.studio2_organizer_tasks (
      assigned_to,
      source_kind,
      source_id,
      source_key,
      task_type,
      required_capability,
      priority,
      state,
      title,
      description,
      href,
      due_at,
      resolution_predicate,
      opened_at,
      resolved_at,
      last_evaluated_at,
      updated_at
    )
    select
      null,
      'system_job',
      job.jobid::text,
      'system-job:' || job.jobid::text,
      'system.job.failure',
      'system.manage',
      case
        when not job.active or coalesce(recent.consecutive_failures, 0) >= 3
          then 'critical'
        else 'high'
      end,
      'open',
      case
        when not job.active then 'Solaris background job is inactive'
        when coalesce(recent.consecutive_failures, 0) >= 3
          then 'Solaris background job repeatedly failed'
        else 'Solaris background job failed'
      end,
      job.jobname || ' · ' ||
        case
          when not job.active
            then 'The scheduler job is disabled and requires operator review.'
          when coalesce(recent.consecutive_failures, 0) >= 3
            then 'Three recent runs failed. Treat this as dead-letter attention; inspect the source condition before relying on the next scheduled retry.'
          else
            'The last completed run failed. The active scheduler will retry on its normal cadence; inspect the failure before the next deadline.'
        end,
      '/admin/system-operations',
      null,
      jsonb_build_object(
        'table', 'cron.job_run_details',
        'jobId', job.jobid,
        'jobName', job.jobname,
        'resolvedWhen', 'job active and latest completed run succeeds',
        'automaticRetry', job.active,
        'deadLetterThreshold', 3
      ),
      coalesce(recent.last_start_at, now()),
      null,
      now(),
      now()
    from cron.job job
    left join lateral (
      select
        latest.status as last_status,
        latest.start_time as last_start_at,
        (
          select count(*)::integer
          from (
            select lower(coalesce(run.status, '')) as status
            from cron.job_run_details run
            where run.jobid = job.jobid
              and lower(coalesce(run.status, '')) <> 'running'
            order by run.start_time desc nulls last, run.runid desc
            limit 3
          ) recent_three
          where recent_three.status not in ('success', 'succeeded')
        ) as consecutive_failures
      from lateral (
        select run.status, run.start_time
        from cron.job_run_details run
        where run.jobid = job.jobid
          and lower(coalesce(run.status, '')) <> 'running'
        order by run.start_time desc nulls last, run.runid desc
        limit 1
      ) latest
    ) recent on true
    where job.jobname like 'solaris-%'
      and (
        not job.active
        or (
          recent.last_status is not null
          and lower(recent.last_status) not in ('success', 'succeeded')
        )
      )
    on conflict (source_key) do update set
      assigned_to = excluded.assigned_to,
      required_capability = excluded.required_capability,
      priority = excluded.priority,
      state = 'open',
      title = excluded.title,
      description = excluded.description,
      href = excluded.href,
      due_at = excluded.due_at,
      resolution_predicate = excluded.resolution_predicate,
      resolved_at = null,
      last_evaluated_at = now(),
      updated_at = now()
  $jobs$;
end
$reconcile$;

revoke all on function private.studio2_reconcile_system_job_tasks()
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

create or replace function public.admin_system_runtime_health(
  p_delivery_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $health$
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
            'lastMessage', left(coalesce(last_run.return_message, ''), 500),
            'consecutiveFailures', coalesce(last_run.consecutive_failures, 0),
            'deadLettered', coalesce(last_run.consecutive_failures, 0) >= 3,
            'recoveryMode',
              case
                when not job.active then 'operator_intervention'
                when coalesce(last_run.consecutive_failures, 0) >= 3 then 'scheduled_retry_dead_letter'
                when last_run.status is not null
                  and lower(last_run.status) not in ('success', 'succeeded')
                  then 'scheduled_retry'
                else 'healthy'
              end
          )
          order by job.jobname
        ),
        '[]'::jsonb
      )
      from cron.job job
      left join lateral (
        select
          latest.status,
          latest.start_time,
          latest.end_time,
          latest.return_message,
          (
            select count(*)::integer
            from (
              select lower(coalesce(run.status, '')) as status
              from cron.job_run_details run
              where run.jobid = job.jobid
                and lower(coalesce(run.status, '')) <> 'running'
              order by run.start_time desc nulls last, run.runid desc
              limit 3
            ) recent_three
            where recent_three.status not in ('success', 'succeeded')
          ) as consecutive_failures
        from lateral (
          select run.status, run.start_time, run.end_time, run.return_message
          from cron.job_run_details run
          where run.jobid = job.jobid
            and lower(coalesce(run.status, '')) <> 'running'
          order by run.start_time desc nulls last, run.runid desc
          limit 1
        ) latest
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
$health$;

revoke all on function public.admin_system_runtime_health(integer)
  from public, anon;
grant execute on function public.admin_system_runtime_health(integer)
  to authenticated, service_role;

select private.studio2_reconcile_system_job_tasks();

notify pgrst, 'reload schema';

commit;
