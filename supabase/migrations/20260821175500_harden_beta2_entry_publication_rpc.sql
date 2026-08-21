-- Beta 2 security follow-up: new SECURITY DEFINER entry-publication RPCs were
-- created with PostgreSQL's default EXECUTE grant to PUBLIC. Restrict them to
-- signed-in users; the functions still enforce active country ownership.

revoke all on function public.owned_country_entry_publication(uuid) from public, anon;
revoke all on function public.set_owned_country_entry_publication(uuid, text, timestamptz, text) from public, anon;

grant execute on function public.owned_country_entry_publication(uuid) to authenticated;
grant execute on function public.set_owned_country_entry_publication(uuid, text, timestamptz, text) to authenticated;
