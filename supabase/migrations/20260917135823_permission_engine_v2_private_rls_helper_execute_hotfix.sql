begin;

-- Permission Engine v2 hotfix.
--
-- PostgreSQL evaluates helper functions referenced by RLS policies with the
-- caller's function EXECUTE privilege. These helpers intentionally live in the
-- private schema so they are not exposed as PostgREST RPCs, but authenticated
-- policy evaluation still needs EXECUTE on the function object itself.
--
-- Keep direct schema access closed; grant only the minimum function privilege
-- required by the policies that already reference these helpers.

revoke all on function private.studio2_can_manage_permissions(uuid)
from public, anon, service_role;
grant execute on function private.studio2_can_manage_permissions(uuid)
to authenticated;

revoke all on function private.studio2_show_access_allowed(text, uuid, boolean)
from public, anon, service_role;
grant execute on function private.studio2_show_access_allowed(text, uuid, boolean)
to authenticated;

-- Anonymous Prediction reads must never need to execute the elevated private
-- helper. Preserve the existing published/public path and explicitly guard the
-- capability-only bypass behind an authenticated actor.
drop policy if exists "public reads published prediction rounds"
on public.prediction_rounds;

create policy "public reads published prediction rounds"
on public.prediction_rounds
for select
to anon, authenticated
using (
  (
    status = any (array['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])
    and public.show_publication_enabled(show_id, 'participants'::text)
  )
  or (
    auth.uid() is not null
    and private.studio2_show_access_allowed('voting.manage', show_id, false)
  )
);

-- Fail the migration if the intended privilege boundary is not exactly present.
do $verify$
begin
  if not has_function_privilege(
    'authenticated',
    'private.studio2_can_manage_permissions(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.studio2_can_manage_permissions through RLS';
  end if;

  if has_function_privilege(
    'anon',
    'private.studio2_can_manage_permissions(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly gained private.studio2_can_manage_permissions EXECUTE';
  end if;

  if not has_function_privilege(
    'authenticated',
    'private.studio2_show_access_allowed(text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.studio2_show_access_allowed through RLS';
  end if;

  if has_function_privilege(
    'anon',
    'private.studio2_show_access_allowed(text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly gained private.studio2_show_access_allowed EXECUTE';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
