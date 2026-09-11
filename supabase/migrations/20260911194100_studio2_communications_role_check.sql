begin;

-- Supabase now recommends role-scoped authorization instead of auth.role().
-- Keep the existing authenticated capability model, while allowing service-role
-- maintenance calls without depending on the deprecated JWT helper.
create or replace function private.studio2_require_communications_access(p_edition_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := current_user = 'service_role';
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
