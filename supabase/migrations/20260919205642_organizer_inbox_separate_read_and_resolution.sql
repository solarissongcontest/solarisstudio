alter table public.admin_notifications
  add column if not exists resolved_at timestamptz,
  add column if not exists requires_action boolean not null default true;

create index if not exists admin_notifications_recipient_resolved_idx
  on public.admin_notifications (recipient_id, resolved_at, created_at desc);

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
      v_resolved := new.status in (
        'upheld', 'reduced', 'increased', 'overturned',
        'rejected_late', 'rejected_ineligible'
      );
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
after update on public.studio2_transition_approval_requests
for each row execute function private.reconcile_organizer_notification_state();

notify pgrst, 'reload schema';
