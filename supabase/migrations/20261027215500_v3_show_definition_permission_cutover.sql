begin;

-- Permission Engine V2 is authoritative. The initial show-definition helper retained
-- a pre-cutover organizer-role fallback through public.has_role(uuid, app_role), but
-- that overload no longer exists after the authoritative permission cutover. Show
-- definition authority must therefore use the canonical edition capability only.
create or replace function private.v3_require_show_definition_manager(p_edition_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $auth$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return v_actor;
end
$auth$;

revoke all on function private.v3_require_show_definition_manager(uuid)
  from public, anon, authenticated, service_role;

commit;
