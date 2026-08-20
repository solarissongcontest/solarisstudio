begin;

-- Legacy wrappers stay available for older authenticated clients during the
-- transition, but anonymous callers do not need executable access.
revoke all on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

revoke all on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
