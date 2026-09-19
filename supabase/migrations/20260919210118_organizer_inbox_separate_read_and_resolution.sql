alter table public.admin_notifications
  add column if not exists resolved_at timestamptz,
  add column if not exists requires_action boolean not null default true;

update public.admin_notifications
set requires_action = false
where severity in ('info', 'success');

create or replace function private.reconcile_organizer_notification_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_resolved boolean := false;
  v_source_key text := tg_table_name || ':' || new.id::text;
begin
  case tg_table_name
    when 'integrity_cases' then
      v_resolved := new.status like 'closed%';
    when 'integrity_case_appeals' then
      v_resolved := new.status in ('upheld', 'reduced', 'increased', 'overturned', 'rejected_late', 'rejected_ineligible');
    when 'integrity_identity_disclosure_requests' then
      v_resolved := new.status in ('rejected', 'used', 'expired');
    when 'studio2_transition_approval_requests' then
      v_resolved := new.consumed_at is not null;
    else
      return new;
  end case;

  update public.admin_notifications
  set resolved_at = case when v_resolved then coalesce(resolved_at, now()) else null end
  where source_key = v_source_key;

  return new;
end;
$$;

revoke all on function private.reconcile_organizer_notification_state()
from public, anon, authenticated;

drop trigger if exists organizer_inbox_case_state on public.integrity_cases;
create trigger organizer_inbox_case_state
after update of status on public.integrity_cases
for each row execute function private.reconcile_organizer_notification_state();

drop trigger if exists organizer_inbox_appeal_state on public.integrity_case_appeals;
create trigger organizer_inbox_appeal_state
after update of status on public.integrity_case_appeals
for each row execute function private.reconcile_organizer_notification_state();

drop trigger if exists organizer_inbox_disclosure_state on public.integrity_identity_disclosure_requests;
create trigger organizer_inbox_disclosure_state
after update of status on public.integrity_identity_disclosure_requests
for each row execute function private.reconcile_organizer_notification_state();

drop trigger if exists organizer_inbox_transition_state on public.studio2_transition_approval_requests;
create trigger organizer_inbox_transition_state
after update of consumed_at on public.studio2_transition_approval_requests
for each row execute function private.reconcile_organizer_notification_state();

update public.admin_notifications n
set resolved_at = coalesce(n.resolved_at, now())
from public.integrity_cases c
where n.source_key = 'integrity_cases:' || c.id::text
  and c.status like 'closed%';

update public.admin_notifications n
set resolved_at = coalesce(n.resolved_at, now())
from public.integrity_case_appeals a
where n.source_key = 'integrity_case_appeals:' || a.id::text
  and a.status in ('upheld', 'reduced', 'increased', 'overturned', 'rejected_late', 'rejected_ineligible');

update public.admin_notifications n
set resolved_at = coalesce(n.resolved_at, now())
from public.integrity_identity_disclosure_requests d
where n.source_key = 'integrity_identity_disclosure_requests:' || d.id::text
  and d.status in ('rejected', 'used', 'expired');

update public.admin_notifications n
set resolved_at = coalesce(n.resolved_at, now())
from public.studio2_transition_approval_requests a
where n.source_key = 'studio2_transition_approval_requests:' || a.id::text
  and a.consumed_at is not null;

notify pgrst, 'reload schema';
