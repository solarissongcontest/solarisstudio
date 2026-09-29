-- Solaris Studio installed-app notification foundation.
-- Delivery generation stays server-authoritative; browser clients may only
-- manage their own subscription and preference records.

alter table public.notification_preferences
  drop constraint if exists notification_preferences_categories_check;

alter table public.notification_preferences
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists urgent_deadline_reminders boolean not null default true,
  add column if not exists spoiler_free boolean not null default false,
  add column if not exists timezone text not null default 'UTC';

alter table public.notification_preferences
  add constraint notification_preferences_categories_check
  check (
    categories <@ array[
      'entries',
      'running_orders',
      'predictions',
      'results',
      'records',
      'confirmations',
      'jury',
      'televoting',
      'deadlines',
      'official',
      'following'
    ]::text[]
  );

create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (user_id, endpoint)
);

create index if not exists app_push_subscriptions_user_active_idx
  on public.app_push_subscriptions (user_id, disabled_at, updated_at desc);

alter table public.app_push_subscriptions enable row level security;

drop policy if exists "users read own app push subscriptions" on public.app_push_subscriptions;
create policy "users read own app push subscriptions"
  on public.app_push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users create own app push subscriptions" on public.app_push_subscriptions;
create policy "users create own app push subscriptions"
  on public.app_push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own app push subscriptions" on public.app_push_subscriptions;
create policy "users update own app push subscriptions"
  on public.app_push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own app push subscriptions" on public.app_push_subscriptions;
create policy "users delete own app push subscriptions"
  on public.app_push_subscriptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.app_push_subscriptions to authenticated;
grant all on public.app_push_subscriptions to service_role;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  event_type text not null,
  subject_id text not null,
  dedupe_key text not null,
  route text not null check (route like '/%'),
  title text not null,
  body text not null default '',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  opened_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'suppressed')),
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (status, scheduled_for)
  where status = 'pending';

create index if not exists notification_deliveries_user_idx
  on public.notification_deliveries (user_id, created_at desc);

alter table public.notification_deliveries enable row level security;

drop policy if exists "users read own notification deliveries" on public.notification_deliveries;
create policy "users read own notification deliveries"
  on public.notification_deliveries
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

comment on table public.app_push_subscriptions is
  'Web Push subscriptions for installed Solaris Studio web apps. Private endpoint/key material is owner/service-role only.';
comment on table public.notification_deliveries is
  'Server-created deduplicated delivery queue and receipt history for Solaris notifications.';


-- Build delivery candidates from authoritative contest state. This function is
-- service-role only so browsers cannot manufacture official notifications.
create or replace function public.solaris_enqueue_app_notifications(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, televoting, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_count integer := 0;
begin
  -- Confirmation opening reminders and deadline safety. Active country
  -- accounts are eligible before they become edition participants; requiring a
  -- participant row here would suppress the exact reminder that helps a country
  -- confirm in the first place.
  -- Once a submission exists for that round/country, deadline notifications
  -- disappear automatically.
  with eligible as (
    select distinct
      ca.user_id,
      ca.country_id,
      c.name as country_name,
      sr.id as round_id,
      sr.edition_id,
      sr.name as round_name,
      sr.status,
      sr.opens_at,
      sr.closes_at,
      np.categories,
      np.spoiler_free
    from public.submission_rounds sr
    join public.country_accounts ca
      on ca.status = 'active'
    join public.countries c on c.id = ca.country_id
    join public.notification_preferences np
      on np.profile_id = ca.user_id
     and np.external_enabled = true
    where
      'confirmations' = any(np.categories)
      or 'deadlines' = any(np.categories)
  ),
  missing as (
    select e.*
    from eligible e
    where not exists (
      select 1
      from public.submissions s
      where s.round_id = e.round_id
        and (
          lower(btrim(s.country)) = lower(btrim(e.country_name))
          or lower(btrim(coalesce(s.country_account, ''))) = lower(btrim(e.country_name))
        )
    )
  ),
  candidates as (
    select
      m.user_id,
      'confirmations'::text as category,
      'confirmation.opens_soon'::text as event_type,
      m.round_id::text as subject_id,
      'confirmation:' || m.round_id::text || ':' || m.user_id::text || ':opens-24h' as dedupe_key,
      '/confirmations'::text as route,
      'Confirmations open tomorrow'::text as title,
      m.round_name::text as body,
      p_now as scheduled_for
    from missing m
    where m.opens_at is not null
      and m.opens_at between p_now + interval '23 hours 50 minutes'
                         and p_now + interval '24 hours 10 minutes'

    union all

    select
      m.user_id,
      'confirmations',
      'confirmation.opens_soon',
      m.round_id::text,
      'confirmation:' || m.round_id::text || ':' || m.user_id::text || ':opens-1h',
      '/confirmations',
      'Confirmations open in 1 hour',
      m.round_name,
      p_now
    from missing m
    where m.opens_at is not null
      and m.opens_at between p_now + interval '50 minutes'
                         and p_now + interval '70 minutes'

    union all

    select
      m.user_id,
      'confirmations',
      'confirmation.opened',
      m.round_id::text,
      'confirmation:' || m.round_id::text || ':' || m.user_id::text || ':opened',
      '/confirmations',
      'Confirmations are open',
      m.round_name,
      p_now
    from missing m
    where m.status = 'open'
      and (m.opens_at is null or m.opens_at <= p_now)
      and (m.closes_at is null or m.closes_at > p_now)

    union all

    select
      m.user_id,
      'deadlines',
      reminder_window.event_type,
      m.round_id::text,
      'confirmation:' || m.round_id::text || ':' || m.user_id::text || ':' || reminder_window.dedupe_suffix,
      '/confirmations',
      reminder_window.title,
      m.round_name,
      p_now
    from missing m
    cross join (
      values
        ('confirmation.deadline_3d'::text, 'deadline-3d'::text, '3 days left to confirm'::text, interval '72 hours'),
        ('confirmation.deadline_24h', 'deadline-24h', 'Confirmation deadline tomorrow', interval '24 hours'),
        ('confirmation.deadline_3h', 'deadline-3h', '3 hours left to confirm', interval '3 hours'),
        ('confirmation.deadline_1h', 'deadline-1h', '1 hour left to confirm', interval '1 hour')
    ) as reminder_window(event_type, dedupe_suffix, title, remaining)
    where m.closes_at is not null
      and m.status = 'open'
      and 'deadlines' = any(m.categories)
      and m.closes_at between
        p_now + reminder_window.remaining - interval '10 minutes'
        and p_now + reminder_window.remaining + interval '10 minutes'
  )
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  from candidates
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Jury voting is participant-specific. Only eligible country accounts with
  -- no recorded ballot receive the opening notification.
  with open_jury as (
    select
      w.show_id,
      w.edition_id,
      s.name as show_name
    from public.jury_voting_windows w
    join public.shows s on s.id = w.show_id
    where w.status = 'open'
  ),
  eligible as (
    select
      ca.user_id,
      ca.country_id,
      j.show_id,
      j.show_name
    from open_jury j
    join public.country_accounts ca on ca.status = 'active'
    join public.notification_preferences np
      on np.profile_id = ca.user_id
     and np.external_enabled = true
     and 'jury' = any(np.categories)
    where
      (
        (
          exists (select 1 from public.voters roster where roster.show_id = j.show_id)
          and exists (
            select 1 from public.voters roster
            where roster.show_id = j.show_id
              and roster.country_id = ca.country_id
          )
        )
        or
        (
          not exists (select 1 from public.voters roster where roster.show_id = j.show_id)
          and exists (
            select 1 from public.participants participant
            where participant.show_id = j.show_id
              and participant.country_id = ca.country_id
              and (
                participant.participation_status is null
                or participant.participation_status = 'confirmed'
              )
          )
        )
      )
      and not exists (
        select 1 from public.jury_ballot_submissions ballot
        where ballot.show_id = j.show_id
          and ballot.voter_country_id = ca.country_id
          and ballot.status = 'submitted'
      )
      and not exists (
        select 1 from public.jury_votes vote
        where vote.show_id = j.show_id
          and vote.voter_country_id = ca.country_id
      )
  )
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    e.user_id,
    'jury',
    'jury.opened',
    e.show_id::text,
    'jury:' || e.show_id::text || ':' || e.user_id::text || ':opened',
    '/jury-voting',
    'Jury voting is open',
    e.show_name,
    p_now
  from eligible e
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Public televoting is opt-in and not treated as a required personal task.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    np.profile_id,
    'televoting',
    'televote.opened',
    r.id::text,
    'televote:' || r.id::text || ':' || np.profile_id::text || ':opened',
    '/televoting',
    'Televoting is open',
    r.name,
    p_now
  from televoting.rounds r
  join public.notification_preferences np
    on np.external_enabled = true
   and 'televoting' = any(np.categories)
  where r.status = 'open'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Confirmation review outcomes are personal, so route them only to the
  -- country account that owns the reviewed delegation.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
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
  join public.notification_preferences np
    on np.profile_id = ca.user_id
   and np.external_enabled = true
   and 'confirmations' = any(np.categories)
  where history.created_at >= p_now - interval '30 minutes'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Official communications already have an authoritative recipient receipt.
  -- Reuse that audience decision instead of rebuilding it in the push system.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
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
  join public.notification_preferences np
    on np.profile_id = receipt.recipient_user_id
   and np.external_enabled = true
   and 'official' = any(np.categories)
  where notice.sent_at is not null
    and notice.sent_at >= p_now - interval '30 minutes'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Prediction/Fantasy openings and locks use the existing Solaris Pulse event
  -- stream, which prevents a second event-truth system from appearing.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    np.profile_id,
    'predictions',
    ce.event_type,
    ce.id::text,
    'prediction:' || ce.id::text || ':' || np.profile_id::text,
    ce.route,
    ce.title,
    left(ce.summary, 240),
    p_now
  from public.content_events ce
  join public.notification_preferences np
    on np.external_enabled = true
   and 'predictions' = any(np.categories)
  where ce.event_type in ('prediction_opened', 'prediction_locked')
    and ce.published_at <= p_now
    and ce.published_at >= p_now - interval '30 minutes'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Follow notifications preserve each entity's own all/important/none setting.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    follow.profile_id,
    'following',
    ce.event_type,
    ce.id::text,
    'follow:' || ce.id::text || ':' || follow.profile_id::text,
    ce.route,
    ce.title,
    left(ce.summary, 240),
    p_now
  from public.content_events ce
  join public.fan_follows follow
    on follow.entity_type = ce.entity_type
   and follow.entity_id = ce.entity_id
   and follow.notification_level <> 'none'
  join public.notification_preferences np
    on np.profile_id = follow.profile_id
   and np.external_enabled = true
   and 'following' = any(np.categories)
  where ce.published_at <= p_now
    and ce.published_at >= p_now - interval '30 minutes'
    and (
      follow.notification_level = 'all'
      or ce.importance = 'important'
    )
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  -- Published result events reuse Solaris Pulse as the canonical event source.
  insert into public.notification_deliveries (
    user_id, category, event_type, subject_id, dedupe_key,
    route, title, body, scheduled_for
  )
  select
    np.profile_id,
    'results',
    'results.published',
    ce.id::text,
    'results:' || ce.id::text || ':' || np.profile_id::text,
    ce.route,
    case
      when np.spoiler_free then 'Solaris results are available'
      else ce.title
    end,
    case
      when np.spoiler_free then 'Open Solaris Studio when you are ready to see the result.'
      else ce.summary
    end,
    p_now
  from public.content_events ce
  join public.notification_preferences np
    on np.external_enabled = true
   and 'results' = any(np.categories)
  where ce.event_type = 'results_published'
    and ce.published_at <= p_now
    and ce.published_at >= p_now - interval '30 minutes'
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_inserted := v_inserted + v_count;

  return v_inserted;
end;
$$;

revoke all on function public.solaris_enqueue_app_notifications(timestamptz)
  from public, anon, authenticated;
grant execute on function public.solaris_enqueue_app_notifications(timestamptz)
  to service_role;
