-- Solaris Studio installed-app notification foundation.
-- Delivery generation stays server-authoritative; browser clients may only
-- manage their own subscription and preference records.

alter table public.notification_preferences
  drop constraint if exists notification_preferences_categories_check;

alter table public.notification_preferences
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time,
  add column if not exists urgent_deadline_reminders boolean not null default true,
  add column if not exists spoiler_free boolean not null default false;

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
