begin;

-- System V3 / S6: recipient-bounded notification delivery reconciliation.
--
-- Notification deliveries are projections. Canonical contest/task state remains
-- authoritative. This migration extracts the existing provider candidate rules
-- into one server-owned candidate function, reuses that function from the
-- existing global enqueue sweep, and exposes a separate exact-recipient repair
-- + read-only verifier for S6 recovery.
--
-- S13 contract: forward-only, no destructive contract phase and no bulk
-- backfill. Repair is explicit, service-only and bounded per recipient.
select public.v3_register_migration_contract(
  '20261019113000_v3_s6_notification_reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'S6 recipient-bounded notification projection repair and verification'
);

create or replace function private.solaris_expected_notification_deliveries(
  p_user_id uuid default null,
  p_now timestamptz default now()
)
returns table (
  user_id uuid,
  category text,
  event_type text,
  subject_id text,
  dedupe_key text,
  route text,
  title text,
  body text,
  scheduled_for timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $expected$
  with confirmation_missing as (
    select distinct
      ca.user_id,
      ca.country_id,
      country.name as country_name,
      round.id as round_id,
      round.name as round_name,
      round.status,
      round.opens_at,
      round.closes_at,
      preference.categories
    from public.submission_rounds round
    join public.country_accounts ca
      on ca.status = 'active'
     and (p_user_id is null or ca.user_id = p_user_id)
    join public.countries country on country.id = ca.country_id
    join public.notification_preferences preference
      on preference.profile_id = ca.user_id
     and preference.external_enabled = true
    where (
      'confirmations' = any(preference.categories)
      or 'deadlines' = any(preference.categories)
    )
      and not exists (
        select 1
        from public.submissions submission
        where submission.round_id = round.id
          and (
            lower(btrim(submission.country)) = lower(btrim(country.name))
            or lower(btrim(coalesce(submission.country_account, ''))) = lower(btrim(country.name))
          )
      )
  ),
  jury_eligible as (
    select distinct
      ca.user_id,
      ca.country_id,
      jury_window.show_id,
      show.name as show_name
    from public.jury_voting_windows jury_window
    join public.shows show on show.id = jury_window.show_id
    join public.country_accounts ca
      on ca.status = 'active'
     and (p_user_id is null or ca.user_id = p_user_id)
    join public.notification_preferences preference
      on preference.profile_id = ca.user_id
     and preference.external_enabled = true
     and 'jury' = any(preference.categories)
    where jury_window.status = 'open'
      and (
        (
          exists (
            select 1
            from public.voters roster
            where roster.show_id = jury_window.show_id
          )
          and exists (
            select 1
            from public.voters roster
            where roster.show_id = jury_window.show_id
              and roster.country_id = ca.country_id
          )
        )
        or (
          not exists (
            select 1
            from public.voters roster
            where roster.show_id = jury_window.show_id
          )
          and exists (
            select 1
            from public.participants participant
            where participant.show_id = jury_window.show_id
              and participant.country_id = ca.country_id
              and (
                participant.participation_status is null
                or participant.participation_status = 'confirmed'
              )
          )
        )
      )
      and not exists (
        select 1
        from public.jury_ballot_submissions ballot
        where ballot.show_id = jury_window.show_id
          and ballot.voter_country_id = ca.country_id
          and ballot.status = 'submitted'
      )
      and not exists (
        select 1
        from public.jury_votes vote
        where vote.show_id = jury_window.show_id
          and vote.voter_country_id = ca.country_id
      )
  ),
  candidate_rows as (
    select
      missing.user_id,
      'confirmations'::text as category,
      'confirmation.opens_soon'::text as event_type,
      missing.round_id::text as subject_id,
      'confirmation:' || missing.round_id::text || ':' || missing.user_id::text || ':opens-24h' as dedupe_key,
      '/confirmations'::text as route,
      'Confirmations open tomorrow'::text as title,
      missing.round_name::text as body,
      p_now as scheduled_for
    from confirmation_missing missing
    where missing.opens_at is not null
      and missing.status not in ('closed', 'auto_closed')
      and missing.opens_at between p_now + interval '23 hours 50 minutes'
                               and p_now + interval '24 hours 10 minutes'

    union all

    select
      missing.user_id,
      'confirmations',
      'confirmation.opens_soon',
      missing.round_id::text,
      'confirmation:' || missing.round_id::text || ':' || missing.user_id::text || ':opens-1h',
      '/confirmations',
      'Confirmations open in 1 hour',
      missing.round_name,
      p_now
    from confirmation_missing missing
    where missing.opens_at is not null
      and missing.status not in ('closed', 'auto_closed')
      and missing.opens_at between p_now + interval '50 minutes'
                               and p_now + interval '70 minutes'

    union all

    select
      missing.user_id,
      'confirmations',
      'confirmation.opened',
      missing.round_id::text,
      'confirmation:' || missing.round_id::text || ':' || missing.user_id::text || ':opened',
      '/confirmations',
      'Confirmations are open',
      missing.round_name,
      p_now
    from confirmation_missing missing
    where missing.status = 'open'
      and (missing.opens_at is null or missing.opens_at <= p_now)
      and (missing.closes_at is null or missing.closes_at > p_now)

    union all

    select
      missing.user_id,
      'deadlines',
      reminder.event_type,
      missing.round_id::text,
      'confirmation:' || missing.round_id::text || ':' || missing.user_id::text || ':' || reminder.dedupe_suffix,
      '/confirmations',
      reminder.title,
      missing.round_name,
      p_now
    from confirmation_missing missing
    cross join (
      values
        ('confirmation.deadline_3d'::text, 'deadline-3d'::text, '3 days left to confirm'::text, interval '72 hours'),
        ('confirmation.deadline_24h', 'deadline-24h', 'Confirmation deadline tomorrow', interval '24 hours'),
        ('confirmation.deadline_3h', 'deadline-3h', '3 hours left to confirm', interval '3 hours'),
        ('confirmation.deadline_1h', 'deadline-1h', '1 hour left to confirm', interval '1 hour')
    ) as reminder(event_type, dedupe_suffix, title, remaining)
    where missing.closes_at is not null
      and missing.status = 'open'
      and 'deadlines' = any(missing.categories)
      and missing.closes_at between
        p_now + reminder.remaining - interval '10 minutes'
        and p_now + reminder.remaining + interval '10 minutes'

    union all

    select
      jury.user_id,
      'jury',
      'jury.opened',
      jury.show_id::text,
      'jury:' || jury.show_id::text || ':' || jury.user_id::text || ':opened',
      '/jury-voting',
      'Jury voting is open',
      jury.show_name,
      p_now
    from jury_eligible jury

    union all

    select
      preference.profile_id,
      'televoting',
      'televote.opened',
      round.id::text,
      'televote:' || round.id::text || ':' || preference.profile_id::text || ':opened',
      '/televoting',
      'Televoting is open',
      round.name,
      p_now
    from televoting.rounds round
    join public.notification_preferences preference
      on preference.external_enabled = true
     and 'televoting' = any(preference.categories)
     and (p_user_id is null or preference.profile_id = p_user_id)
    where round.status = 'open'

    union all

    select
      ca.user_id,
      'confirmations',
      'confirmation.reviewed',
      history.id::text,
      'confirmation-review:' || history.id::text || ':' || ca.user_id::text,
      '/confirmations',
      case
        when history.action = 'accepted' then 'Your entry was accepted'
        when history.action in ('declined', 'removed') then 'Your entry needs changes'
        else 'Your entry review was updated'
      end,
      left(coalesce(nullif(history.reason, ''), 'Open Solaris Studio to review the update.'), 240),
      p_now
    from public.submission_review_history history
    join public.submissions submission on submission.id = history.submission_id
    join public.countries country
      on lower(btrim(country.name)) = lower(btrim(submission.country))
    join public.country_accounts ca
      on ca.country_id = country.id
     and ca.status = 'active'
     and (p_user_id is null or ca.user_id = p_user_id)
    join public.notification_preferences preference
      on preference.profile_id = ca.user_id
     and preference.external_enabled = true
     and 'confirmations' = any(preference.categories)
    where history.created_at >= p_now - interval '30 minutes'

    union all

    select
      receipt.recipient_user_id,
      'official',
      case
        when notice.acknowledgement_required then 'official.acknowledgement_required'
        else 'official.notice'
      end,
      notice.id::text,
      'official:' || notice.id::text || ':' || receipt.recipient_user_id::text,
      '/my-solaris/notices',
      case
        when notice.acknowledgement_required then 'Action requested by Solaris'
        else notice.title
      end,
      left(
        case
          when notice.acknowledgement_required then notice.title || ' · ' || notice.body
          else notice.body
        end,
        240
      ),
      p_now
    from public.studio2_notice_receipts receipt
    join public.studio2_official_notices notice on notice.id = receipt.notice_id
    join public.notification_preferences preference
      on preference.profile_id = receipt.recipient_user_id
     and preference.external_enabled = true
     and 'official' = any(preference.categories)
    where notice.sent_at is not null
      and notice.sent_at >= p_now - interval '30 minutes'
      and (p_user_id is null or receipt.recipient_user_id = p_user_id)

    union all

    select
      preference.profile_id,
      'predictions',
      event.event_type,
      event.id::text,
      'prediction:' || event.id::text || ':' || preference.profile_id::text,
      event.route,
      event.title,
      left(event.summary, 240),
      p_now
    from public.content_events event
    join public.notification_preferences preference
      on preference.external_enabled = true
     and 'predictions' = any(preference.categories)
     and (p_user_id is null or preference.profile_id = p_user_id)
    where event.event_type in ('prediction_opened', 'prediction_locked')
      and event.published_at <= p_now
      and event.published_at >= p_now - interval '30 minutes'

    union all

    select
      follow.profile_id,
      'following',
      event.event_type,
      event.id::text,
      'follow:' || event.id::text || ':' || follow.profile_id::text,
      event.route,
      event.title,
      left(event.summary, 240),
      p_now
    from public.content_events event
    join public.fan_follows follow
      on follow.entity_type = event.entity_type
     and follow.entity_id = event.entity_id
     and follow.notification_level <> 'none'
     and (p_user_id is null or follow.profile_id = p_user_id)
    join public.notification_preferences preference
      on preference.profile_id = follow.profile_id
     and preference.external_enabled = true
     and 'following' = any(preference.categories)
    where event.published_at <= p_now
      and event.published_at >= p_now - interval '30 minutes'
      and (
        follow.notification_level = 'all'
        or event.importance = 'important'
      )

    union all

    select
      preference.profile_id,
      'results',
      'results.published',
      event.id::text,
      'results:' || event.id::text || ':' || preference.profile_id::text,
      event.route,
      case
        when preference.spoiler_free then 'Solaris results are available'
        else event.title
      end,
      case
        when preference.spoiler_free then 'Open Solaris Studio when you are ready to see the result.'
        else event.summary
      end,
      p_now
    from public.content_events event
    join public.notification_preferences preference
      on preference.external_enabled = true
     and 'results' = any(preference.categories)
     and (p_user_id is null or preference.profile_id = p_user_id)
    where event.event_type = 'results_published'
      and event.published_at <= p_now
      and event.published_at >= p_now - interval '30 minutes'

    union all

    select
      notification.recipient_id,
      'organizer_tasks',
      case
        when task.priority = 'critical' then 'organizer_task.critical'
        else 'organizer_task.high'
      end,
      task.id::text,
      'organizer-task:' || task.source_key || ':' || notification.recipient_id::text,
      task.href,
      task.title,
      left(coalesce(task.description, ''), 240),
      p_now
    from public.admin_notifications notification
    join public.studio2_organizer_tasks task
      on task.source_key = notification.source_key
    where notification.resolution_mode = 'domain'
      and notification.requires_action = true
      and notification.resolved_at is null
      and task.state <> 'resolved'
      and task.priority in ('critical', 'high')
      and (p_user_id is null or notification.recipient_id = p_user_id)
  )
  select distinct on (candidate.user_id, candidate.dedupe_key)
    candidate.user_id,
    candidate.category,
    candidate.event_type,
    candidate.subject_id,
    candidate.dedupe_key,
    candidate.route,
    candidate.title,
    candidate.body,
    candidate.scheduled_for
  from candidate_rows candidate
  where candidate.user_id is not null
    and (p_user_id is null or candidate.user_id = p_user_id)
  order by candidate.user_id, candidate.dedupe_key, candidate.event_type;
$expected$;

revoke all on function private.solaris_expected_notification_deliveries(uuid, timestamptz)
  from public, anon, authenticated;

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
      (
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

create or replace function private.solaris_suppress_stale_notification_deliveries(
  p_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $suppress$
declare
  v_changed integer := 0;
begin
  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    error = 'Canonical task or window state no longer requires delivery.'
  where delivery.id in (
    select stale.id
    from private.solaris_stale_notification_delivery_ids(p_user_id) stale
  );

  get diagnostics v_changed = row_count;
  return v_changed;
end
$suppress$;

revoke all on function private.solaris_suppress_stale_notification_deliveries(uuid)
  from public, anon, authenticated;

-- Preserve the existing global service sweep, but make it consume the same
-- candidate engine as recipient-scoped S6 repair. This removes candidate-rule
-- drift between ordinary delivery and reconciliation.
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
begin
  perform private.solaris_suppress_stale_notification_deliveries(null);

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
  return v_inserted;
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

  select count(*)::integer
  into v_stale
  from private.solaris_stale_notification_delivery_ids(p_user_id);

  return jsonb_build_object(
    'userId', p_user_id,
    'state', case when v_missing = 0 and v_stale = 0 then 'consistent' else 'drift' end,
    'reason', 'verified',
    'expectedCurrent', v_expected,
    'pendingCurrent', v_pending,
    'missingCurrent', v_missing,
    'stalePending', v_stale,
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
