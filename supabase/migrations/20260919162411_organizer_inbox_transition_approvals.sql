create or replace function private.route_organizer_transition_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.notify_solaris_organizers(
    'critical',
    'Edition transition approval required',
    format(
      'A critical edition transition from %s to %s needs a second organizer approval.',
      replace(new.from_state, '_', ' '),
      replace(new.to_state, '_', ' ')
    ),
    '/admin/control-room',
    'studio2_transition_approval_requests:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function private.route_organizer_transition_approval()
from public, anon, authenticated;

drop trigger if exists organizer_inbox_transition_approval_insert
on public.studio2_transition_approval_requests;

create trigger organizer_inbox_transition_approval_insert
after insert on public.studio2_transition_approval_requests
for each row
execute function private.route_organizer_transition_approval();

do $$
declare
  item record;
begin
  for item in
    select id, from_state, to_state
    from public.studio2_transition_approval_requests
    where approved_at is null
      and consumed_at is null
      and expires_at > now()
  loop
    perform private.notify_solaris_organizers(
      'critical',
      'Edition transition approval required',
      format(
        'A critical edition transition from %s to %s needs a second organizer approval.',
        replace(item.from_state, '_', ' '),
        replace(item.to_state, '_', ' ')
      ),
      '/admin/control-room',
      'studio2_transition_approval_requests:' || item.id::text
    );
  end loop;
end;
$$;
