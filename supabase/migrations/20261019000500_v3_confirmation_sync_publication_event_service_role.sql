begin;

-- Forward-only follow-up to the clean-replay Confirmation sync ACL repair.
-- public.emit_entry_published_event(uuid, uuid) deliberately had inherited
-- PUBLIC execution revoked by the Entry reveal/history migration. The canonical
-- Confirmation -> Solaris service-role sync calls this boundary when an accepted
-- official Entry becomes public, so service_role must receive explicit EXECUTE.
-- Browser roles remain unchanged.

grant execute on function public.emit_entry_published_event(uuid, uuid)
  to service_role;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.emit_entry_published_event(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Canonical Confirmation sync requires service_role EXECUTE on public.emit_entry_published_event(uuid,uuid)';
  end if;

  if has_function_privilege(
    'anon',
    'public.emit_entry_published_event(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Confirmation publication event boundary must not be executable by anon';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.emit_entry_published_event(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Confirmation publication event boundary must not be executable by authenticated';
  end if;
end;
$$;

commit;
