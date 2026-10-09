-- Repair the clean-replay PostgREST contract for Organizer Inbox.
--
-- RLS policies existed, but a clean database never granted the authenticated
-- role table privileges after admin_notifications was introduced. PostgREST
-- therefore returned 403 before RLS could evaluate the Organizer policy.
-- Keep this least-privilege: authenticated users may read rows allowed by RLS
-- and may update only the two acknowledgement fields used by the application.

revoke all on table public.admin_notifications from anon;

grant select on table public.admin_notifications to authenticated;
grant update (read_at, resolved_at) on table public.admin_notifications to authenticated;

-- RLS is the authorization boundary. Reassert the intended policies so upgrade
-- paths and clean replay converge on the same contract without widening access.
alter table public.admin_notifications enable row level security;

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
