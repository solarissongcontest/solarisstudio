begin;

create or replace function private.studio2_enforce_locked_rundown_live_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rundown jsonb;
begin
  if new.broadcast_config is not distinct from old.broadcast_config then
    return new;
  end if;

  v_rundown := new.broadcast_config -> 'studio2Rundown';
  if v_rundown is null then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_rundown -> 'segments', '[]'::jsonb)) as items(segment)
    where segment ->> 'status' = 'live'
  ) and nullif(v_rundown ->> 'lockedAt', '') is null then
    raise exception 'Lock the broadcast rundown before taking a segment live' using errcode = '55000';
  end if;

  return new;
end
$$;

revoke all on function private.studio2_enforce_locked_rundown_live_state()
  from public, anon, authenticated;
grant execute on function private.studio2_enforce_locked_rundown_live_state()
  to service_role;

drop trigger if exists studio2_locked_rundown_live_state_guard on public.shows;
create trigger studio2_locked_rundown_live_state_guard
before update of broadcast_config on public.shows
for each row
execute function private.studio2_enforce_locked_rundown_live_state();

commit;
