-- Organizer Inbox is now a canonical Solaris capability. Production historically
-- carried this table as legacy state, but clean installs must create it too.
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'action', 'critical', 'success')),
  title text not null,
  body text,
  href text,
  source_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;

create index if not exists admin_notifications_recipient_idx
  on public.admin_notifications (recipient_id, read_at, created_at desc);

drop policy if exists "Organizers read own notifications" on public.admin_notifications;
create policy "Organizers read own notifications"
on public.admin_notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and public.studio2_access_allowed('edition.manage', null, false)
);

drop policy if exists "Organizers update own notifications" on public.admin_notifications;
create policy "Organizers update own notifications"
on public.admin_notifications
for update
to authenticated
using (
  recipient_id = (select auth.uid())
  and public.studio2_access_allowed('edition.manage', null, false)
)
with check (
  recipient_id = (select auth.uid())
  and public.studio2_access_allowed('edition.manage', null, false)
);

create unique index if not exists admin_notifications_recipient_source_uidx
  on public.admin_notifications (recipient_id, source_key)
  where source_key is not null;

create or replace function private.notify_solaris_organizers(
  p_severity text,
  p_title text,
  p_body text,
  p_href text,
  p_source_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.admin_notifications (
    recipient_id,
    severity,
    title,
    body,
    href,
    source_key
  )
  select distinct
    assignment.user_id,
    p_severity,
    p_title,
    p_body,
    p_href,
    p_source_key
  from public.studio2_role_assignments assignment
  where assignment.role_key = 'organizer'
    and assignment.edition_id is null
    and (assignment.expires_at is null or assignment.expires_at > now())
  on conflict do nothing;
end;
$$;

revoke all on function private.notify_solaris_organizers(text, text, text, text, text)
from public, anon, authenticated;

create or replace function private.route_organizer_inbox_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  payload jsonb := to_jsonb(new);
  item_id text := payload ->> 'id';
  item_title text;
  item_body text;
  item_href text;
  item_severity text := 'action';
begin
  case tg_table_name
    when 'integrity_cases' then
      item_title := 'New case submitted';
      item_body := 'A new complaint, report or rules case needs organizer triage.';
      item_href := '/admin/integrity-case/' || item_id;
      if coalesce(payload ->> 'priority', '') in ('urgent', 'critical', 'high') then
        item_severity := 'critical';
      end if;
    when 'integrity_case_appeals' then
      item_title := 'New appeal submitted';
      item_body := 'An appeal has entered the Rules & Cases review queue.';
      item_href := '/admin/integrity-appeals';
    when 'integrity_identity_disclosure_requests' then
      item_title := 'Identity disclosure request';
      item_body := 'A protected disclosure request needs an organizer decision.';
      item_href := '/admin/integrity-disclosure';
      item_severity := 'critical';
    when 'admin_beta_test_submissions' then
      item_title := 'New Organizer Beta feedback';
      item_body := 'A new administrator test response was submitted. Review bugs and workflow feedback.';
      item_href := '/admin/admin-beta-feedback';
    when 'beta2_test_submissions' then
      item_title := 'New Beta 2 feedback';
      item_body := 'A new public-site usability response was submitted.';
      item_href := '/admin/beta2-feedback';
      item_severity := 'info';
    when 'beta3_test_submissions' then
      item_title := 'New Beta 3 feedback';
      item_body := 'A new navigation and findability response was submitted.';
      item_href := '/admin/beta3-feedback';
      item_severity := 'info';
    else
      return new;
  end case;

  perform private.notify_solaris_organizers(
    item_severity,
    item_title,
    item_body,
    item_href,
    tg_table_name || ':' || item_id
  );

  return new;
end;
$$;

revoke all on function private.route_organizer_inbox_event()
from public, anon, authenticated;

drop trigger if exists organizer_inbox_integrity_case_insert on public.integrity_cases;
create trigger organizer_inbox_integrity_case_insert
after insert on public.integrity_cases
for each row execute function private.route_organizer_inbox_event();

drop trigger if exists organizer_inbox_integrity_appeal_insert on public.integrity_case_appeals;
create trigger organizer_inbox_integrity_appeal_insert
after insert on public.integrity_case_appeals
for each row execute function private.route_organizer_inbox_event();

drop trigger if exists organizer_inbox_disclosure_insert on public.integrity_identity_disclosure_requests;
create trigger organizer_inbox_disclosure_insert
after insert on public.integrity_identity_disclosure_requests
for each row execute function private.route_organizer_inbox_event();

drop trigger if exists organizer_inbox_admin_beta_insert on public.admin_beta_test_submissions;
create trigger organizer_inbox_admin_beta_insert
after insert on public.admin_beta_test_submissions
for each row execute function private.route_organizer_inbox_event();

drop trigger if exists organizer_inbox_beta2_insert on public.beta2_test_submissions;
create trigger organizer_inbox_beta2_insert
after insert on public.beta2_test_submissions
for each row execute function private.route_organizer_inbox_event();

drop trigger if exists organizer_inbox_beta3_insert on public.beta3_test_submissions;
create trigger organizer_inbox_beta3_insert
after insert on public.beta3_test_submissions
for each row execute function private.route_organizer_inbox_event();

do $$
declare
  item record;
begin
  for item in
    select id, priority
    from public.integrity_cases
    where status not in ('closed', 'resolved', 'dismissed')
  loop
    perform private.notify_solaris_organizers(
      case when coalesce(item.priority, '') in ('urgent', 'critical', 'high') then 'critical' else 'action' end,
      'Open case needs attention',
      'An existing complaint, report or rules case is still open.',
      '/admin/integrity-case/' || item.id::text,
      'integrity_cases:' || item.id::text
    );
  end loop;

  for item in
    select id
    from public.admin_beta_test_submissions
    where created_at >= now() - interval '45 days'
  loop
    perform private.notify_solaris_organizers(
      'action',
      'Organizer Beta feedback',
      'An administrator test response is available for review.',
      '/admin/admin-beta-feedback',
      'admin_beta_test_submissions:' || item.id::text
    );
  end loop;
end;
$$;
