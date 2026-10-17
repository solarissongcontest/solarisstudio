begin;

-- System V3 / S14 follow-up: the published Televote aggregate projection is
-- server-managed once source provenance exists. The previous guard treated a
-- postgres/supabase_admin session identity as sufficient bypass evidence. That
-- is not a request-safe authorization boundary: local rehearsals (and other
-- privileged connection pools) can SET ROLE authenticated while session_user
-- remains postgres. Canonical projection writes already establish the scoped
-- transaction-local marker below, and service workers have an explicit JWT
-- service-role identity, so no connection-login bypass is required.

create or replace function private.v3_guard_source_managed_televote_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_show_id uuid;
begin
  if tg_op = 'DELETE' then
    v_show_id := old.show_id;
  else
    v_show_id := new.show_id;
  end if;

  if coalesce(current_setting('solaris.v3_televote_projection_write', true), '') = '1'
     or private.studio2_request_is_service_role() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_show_id is not null
     and exists (
       select 1
       from private.v3_televote_result_projection_sources source
       where source.show_id = v_show_id
     ) then
    raise exception 'Published Televote projection is server-managed for this show'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_source_managed_televote_projection()
  from public, anon, authenticated;

commit;
