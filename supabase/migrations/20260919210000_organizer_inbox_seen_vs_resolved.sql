alter table public.admin_notifications
  add column if not exists resolved_at timestamptz;

create index if not exists admin_notifications_recipient_resolved_idx
  on public.admin_notifications (recipient_id, resolved_at, created_at desc);

update public.admin_notifications
set resolved_at = read_at
where resolved_at is null
  and read_at is not null
  and coalesce(source_key, '') not like 'integrity_cases:%'
  and coalesce(source_key, '') not like 'studio2_transition_approval_requests:%';

create or replace function private.sync_organizer_inbox_integrity_case_resolution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status like 'closed%' then
    update public.admin_notifications
    set resolved_at = coalesce(resolved_at, now())
    where source_key = 'integrity_cases:' || new.id::text;
  elsif old.status like 'closed%' and new.status not like 'closed%' then
    update public.admin_notifications
    set resolved_at = null
    where source_key = 'integrity_cases:' || new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_organizer_inbox_integrity_case_resolution()
from public, anon, authenticated;

drop trigger if exists organizer_inbox_integrity_case_resolution on public.integrity_cases;
create trigger organizer_inbox_integrity_case_resolution
after update of status on public.integrity_cases
for each row execute function private.sync_organizer_inbox_integrity_case_resolution();

create or replace function private.sync_organizer_inbox_transition_resolution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.approved_at is not null or new.consumed_at is not null or new.expires_at <= now() then
    update public.admin_notifications
    set resolved_at = coalesce(resolved_at, now())
    where source_key = 'studio2_transition_approval_requests:' || new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_organizer_inbox_transition_resolution()
from public, anon, authenticated;

drop trigger if exists organizer_inbox_transition_resolution on public.studio2_transition_approval_requests;
create trigger organizer_inbox_transition_resolution
after update on public.studio2_transition_approval_requests
for each row execute function private.sync_organizer_inbox_transition_resolution();

notify pgrst, 'reload schema';
