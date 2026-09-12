begin;

-- The legacy roster mutators are retained only for controlled service-level
-- compatibility. Delegation and anonymous clients must never create a second
-- jury identity outside canonical HOD history.
revoke all on function public.studio2_assign_jury_member(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.studio2_remove_jury_member(uuid)
  from public, anon, authenticated;

grant execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.studio2_remove_jury_member(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
