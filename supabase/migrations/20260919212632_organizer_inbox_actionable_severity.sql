update public.admin_notifications
set requires_action = false
where severity in ('info', 'success');

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
    source_key,
    requires_action
  )
  select distinct
    assignment.user_id,
    p_severity,
    p_title,
    p_body,
    p_href,
    p_source_key,
    p_severity not in ('info', 'success')
  from public.studio2_role_assignments assignment
  where assignment.role_key = 'organizer'
    and assignment.edition_id is null
    and (assignment.expires_at is null or assignment.expires_at > now())
  on conflict do nothing;
end;
$$;

revoke all on function private.notify_solaris_organizers(text, text, text, text, text)
from public, anon, authenticated;

notify pgrst, 'reload schema';
