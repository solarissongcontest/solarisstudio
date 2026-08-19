begin;

-- Function creation/grant history can leave Supabase's `anon` role with a
-- direct EXECUTE grant even after PUBLIC is revoked. Reordering is an owner /
-- organizer action, so make the intended boundary explicit.
revoke execute on function public.reorder_country_profile_sections(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_country_profile_sections(uuid, uuid[]) to authenticated, service_role;

commit;
