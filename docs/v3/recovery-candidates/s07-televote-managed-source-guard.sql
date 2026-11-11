-- S07 local forward-recovery override; no production authorization.
-- Extracted from #2404 at 01865d823c22897fad84629d984506603885850e.
-- Existing canonical adapters retain ownership; this protects their projection.
create or replace function private.v3_guard_source_managed_televote_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_show_id uuid;
  v_previous_show_id uuid;
begin
  if tg_op = 'DELETE' then
    v_show_id := old.show_id;
  else
    v_show_id := new.show_id;
    if tg_op = 'UPDATE' then
      v_previous_show_id := old.show_id;
    end if;
  end if;

  if coalesce(current_setting('role', true), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Guard BOTH identities when an UPDATE moves a vote across show scopes.
  -- The historical hardening checks only NEW.show_id; that can miss a
  -- previously source-managed show when a vote is moved away.
  if exists (
       select 1
       from private.v3_televote_result_projection_sources source
       where (v_show_id is not null and source.show_id = v_show_id)
          or (tg_op = 'UPDATE' and v_previous_show_id is not null
              and source.show_id = v_previous_show_id)
     ) then
    raise exception 'Published Televote projection is server-managed for this show'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;
