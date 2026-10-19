begin;

-- System V3 / S6 follow-up: make notification reconciliation truly convergent.
--
-- The initial recipient-bounded repair could suppress a pending delivery when
-- canonical eligibility disappeared, but a later eligible state collided with
-- the same (user_id, dedupe_key) row and ON CONFLICT DO NOTHING left that row
-- permanently suppressed. That is projection drift, not successful recovery.
--
-- This follow-up reactivates only canonically-suppressed, never-sent rows,
-- keeps sent and failed history immutable, and treats persisted notification
-- preference opt-out as canonical stale state for user-configurable categories.
select public.v3_register_migration_contract(
  '20261019113100_v3_s6_notification_reactivation',
  1,
  'forward_fix_only',
  false,
  null,
  'S6 notification repair reactivation and preference-convergence follow-up'
);

create or replace function private.solaris_stale_notification_delivery_ids(
  p_user_id uuid default null
)
returns table (id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $stale$
  select delivery.id
  from public.notification_deliveries delivery
  where delivery.status = 'pending'
    and (p_user_id is null or delivery.user_id = p_user_id)
    and (
      -- A user-controlled delivery category is stale as soon as the persisted
      -- preference no longer permits external delivery. Organizer task push is
      -- intentionally excluded because that provider is governed by task truth,
      -- not the fan preference surface.
      (
        delivery.category in (
          'confirmations',
          'deadlines',
          'jury',
          'televoting',
          'official',
          'predictions',
          'following',
          'results'
        )
        and not exists (
          select 1
          from public.notification_preferences preference
          where preference.profile_id = delivery.user_id
            and preference.external_enabled = true
            and delivery.category = any(preference.categories)
        )
      )
      or (
        delivery.event_type like 'confirmation.%'
        and (
          exists (
            select 1
            from public.country_accounts ca
            join public.countries country on country.id = ca.country_id
            join public.submissions submission
              on submission.round_id::text = delivery.subject_id
             and (
               lower(btrim(submission.country)) = lower(btrim(country.name))
               or lower(btrim(coalesce(submission.country_account, ''))) = lower(btrim(country.name))
             )
            where ca.user_id = delivery.user_id
              and ca.status = 'active'
          )
          or exists (
            select 1
            from public.submission_rounds round
            where round.id::text = delivery.subject_id
              and round.status in ('closed', 'auto_closed')
          )
        )
      )
      or (
        delivery.event_type = 'jury.opened'
        and (
          not exists (
            select 1
            from public.jury_voting_windows jury_window
            where jury_window.show_id::text = delivery.subject_id
              and jury_window.status = 'open'
          )
          or exists (
            select 1
            from public.country_accounts ca
            join public.jury_ballot_submissions ballot
              on ballot.voter_country_id = ca.country_id
             and ballot.show_id::text = delivery.subject_id
             and ballot.status = 'submitted'
            where ca.user_id = delivery.user_id
              and ca.status = 'active'
          )
          or exists (
            select 1
            from public.country_accounts ca
            join public.jury_votes vote
              on vote.voter_country_id = ca.country_id
             and vote.show_id::text = delivery.subject_id
            where ca.user_id = delivery.user_id
              and ca.status = 'active'
          )
        )
      )
      or (
        delivery.event_type = 'televote.opened'
        and not exists (
          select 1
          from televoting.rounds round
          where round.id::text = delivery.subject_id
            and round.status = 'open'
        )
      )
      or (
        delivery.event_type in ('organizer_task.high', 'organizer_task.critical')
        and not exists (
          select 1
          from public.admin_notifications notification
          join public.studio2_organizer_tasks task
            on task.source_key = notification.source_key
          where notification.recipient_id = delivery.user_id
            and notification.resolution_mode = 'domain'
            and notification.requires_action = true
            and notification.resolved_at is null
            and task.id::text = delivery.subject_id
            and task.state <> 'resolved'
            and task.priority in ('critical', 'high')
        )
      )
    );
$stale$;

revoke all on function private.solaris_stale_notification_delivery_ids(uuid)
  from public, anon, authenticated;

create or replace function private.solaris_reactivate_expected_notification_deliveries(
  p_user_id uuid default null,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $reactivate$
declare
  v_changed integer := 0;
begin
  update public.notification_deliveries delivery
  set
    category = candidate.category,
    event_type = candidate.event_type,
    subject_id = candidate.subject_id,
    route = candidate.route,
    title = candidate.title,
    body = candidate.body,
    scheduled_for = candidate.scheduled_for,
    status = 'pending',
    processing_started_at = null,
    error = null
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) candidate
  where delivery.user_id = candidate.user_id
    and delivery.dedupe_key = candidate.dedupe_key
    and delivery.status = 'suppressed'
    and delivery.sent_at is null
    -- Only suppression created by canonical-state reconciliation may be undone.
    -- A manually/exceptionally suppressed row remains visible as drift and is
    -- never silently reactivated by this repair boundary.
    and coalesce(delivery.error, '') in (
      'Canonical task or window state no longer requires delivery.',
      'Task completed or window closed before delivery.'
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end
$reactivate$;

revoke all on function private.solaris_reactivate_expected_notification_deliveries(uuid, timestamptz)
  from public, anon, authenticated;

-- Ordinary provider execution must converge too. A canonical reopen or restored
-- eligibility should not require a separate operator repair merely because the
-- stable dedupe identity already exists in suppressed state.
create or replace function public.solaris_enqueue_app_notifications(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $enqueue$
declare
  v_inserted integer := 0;
  v_reactivated integer := 0;
begin
  perform private.solaris_suppress_stale_notification_deliveries(null);
  v_reactivated := private.solaris_reactivate_expected_notification_deliveries(null, p_now);

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
    candidate.user_id,
    candidate.category,
    candidate.event_type,
    candidate.subject_id,
    candidate.dedupe_key,
    candidate.route,
    candidate.title,
    candidate.body,
    candidate.scheduled_for
  from private.solaris_expected_notification_deliveries(null, p_now) candidate
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted + v_reactivated;
end
$enqueue$;

revoke all on function public.solaris_enqueue_app_notifications(timestamptz)
  from public, anon, authenticated;
grant execute on function public.solaris_enqueue_app_notifications(timestamptz)
  to service_role;

create or replace function public.studio2_verify_notification_delivery_projection(
  p_user_id uuid,
  p_now timestamptz default now(),
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $verify$
declare
  v_expected integer := 0;
  v_pending integer := 0;
  v_missing integer := 0;
  v_stale integer := 0;
  v_suppressed_expected integer := 0;
  v_workload integer := 0;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Recipient is required' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Verification limit must be between 1 and 500' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now);

  select count(*)::integer
  into v_pending
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.status = 'pending';

  v_workload := v_expected + v_pending;
  if v_workload > p_limit then
    return jsonb_build_object(
      'userId', p_user_id,
      'state', 'unknown',
      'reason', 'verification_bound_exceeded',
      'expectedCurrent', v_expected,
      'pendingCurrent', v_pending,
      'workload', v_workload,
      'limit', p_limit,
      'verifiedAt', now()
    );
  end if;

  select count(*)::integer
  into v_missing
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) expected
  where not exists (
    select 1
    from public.notification_deliveries delivery
    where delivery.user_id = p_user_id
      and delivery.dedupe_key = expected.dedupe_key
  );

  -- An identity existing in suppressed state is not convergence when canonical
  -- truth currently expects that delivery. Keeping this separate from `missing`
  -- preserves historical identity while still reporting actionable drift.
  select count(*)::integer
  into v_suppressed_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) expected
  join public.notification_deliveries delivery
    on delivery.user_id = expected.user_id
   and delivery.dedupe_key = expected.dedupe_key
  where delivery.status = 'suppressed';

  select count(*)::integer
  into v_stale
  from private.solaris_stale_notification_delivery_ids(p_user_id);

  return jsonb_build_object(
    'userId', p_user_id,
    'state', case
      when v_missing = 0 and v_stale = 0 and v_suppressed_expected = 0 then 'consistent'
      else 'drift'
    end,
    'reason', 'verified',
    'expectedCurrent', v_expected,
    'pendingCurrent', v_pending,
    'missingCurrent', v_missing,
    'stalePending', v_stale,
    'suppressedExpected', v_suppressed_expected,
    'workload', v_workload,
    'limit', p_limit,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function public.studio2_verify_notification_delivery_projection(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_notification_delivery_projection(uuid, timestamptz, integer)
  to service_role;

create or replace function public.studio2_reconcile_notification_delivery_projection(
  p_user_id uuid,
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $reconcile$
declare
  v_expected integer := 0;
  v_stale integer := 0;
  v_inserted integer := 0;
  v_suppressed integer := 0;
  v_reactivated integer := 0;
  v_verification jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Recipient is required' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Repair limit must be between 1 and 100' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now);

  select count(*)::integer
  into v_stale
  from private.solaris_stale_notification_delivery_ids(p_user_id);

  if v_expected + v_stale > p_limit then
    raise exception
      'Notification reconciliation bound exceeded for recipient %: % rows > %',
      p_user_id,
      v_expected + v_stale,
      p_limit
      using errcode = '54000';
  end if;

  v_suppressed := private.solaris_suppress_stale_notification_deliveries(p_user_id);
  v_reactivated := private.solaris_reactivate_expected_notification_deliveries(p_user_id, p_now);

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
    candidate.user_id,
    candidate.category,
    candidate.event_type,
    candidate.subject_id,
    candidate.dedupe_key,
    candidate.route,
    candidate.title,
    candidate.body,
    candidate.scheduled_for
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) candidate
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  v_verification := public.studio2_verify_notification_delivery_projection(
    p_user_id,
    p_now,
    500
  );

  return jsonb_build_object(
    'userId', p_user_id,
    'scope', 'recipient',
    'expectedCurrent', v_expected,
    'inserted', v_inserted,
    'reactivated', v_reactivated,
    'suppressed', v_suppressed,
    'verification', v_verification,
    'reconciledAt', now()
  );
end
$reconcile$;

revoke all on function public.studio2_reconcile_notification_delivery_projection(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_reconcile_notification_delivery_projection(uuid, timestamptz, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
