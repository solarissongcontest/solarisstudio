begin;

-- auth.role() is deprecated for new authorization code. Read the immutable
-- role claim from the signed request JWT instead; authenticated users still
-- need organizer status or the communications.send capability.
create or replace function private.studio2_require_communications_access(p_edition_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  v_is_service boolean := v_request_role = 'service_role';
begin
  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'communications.send', p_edition_id) then
    raise exception 'Missing Solaris capability: communications.send' using errcode = '42501';
  end if;
end
$$;

revoke all on function private.studio2_require_communications_access(uuid)
  from public, anon, authenticated;

grant execute on function private.studio2_require_communications_access(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
