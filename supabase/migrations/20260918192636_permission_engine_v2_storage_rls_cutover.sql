begin;

-- Permission Engine v2 cutover batch 21.
--
-- Storage policies mix three distinct authorization models:
-- - beta feedback screenshots: elevated rollout administration
-- - country media: country ownership OR elevated delegation administration
-- - edition artwork: edition-scoped configuration administration
-- Preserve those independent safeguards while removing legacy Organizer checks.

create or replace function private.studio2_storage_edition_access_allowed(
  p_object_name text,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public', 'private', 'storage', 'pg_temp'
as $function$
declare
  v_folder text;
  v_edition_id uuid;
begin
  -- Global edition managers retain access to all edition artwork, including
  -- legacy/malformed paths that cannot safely be resolved to one edition.
  if public.studio2_access_allowed('edition.manage', null, p_strict_before_cutover) then
    return true;
  end if;

  v_folder := (storage.foldername(p_object_name))[1];
  if v_folder is null
     or v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_edition_id := v_folder::uuid;
  return public.studio2_access_allowed('edition.manage', v_edition_id, p_strict_before_cutover);
end;
$function$;

-- The helper remains in the private schema and therefore is not a PostgREST
-- RPC surface. RLS evaluation by authenticated callers still requires EXECUTE
-- on the function object itself.
revoke all on function private.studio2_storage_edition_access_allowed(text, boolean)
from public, anon, service_role;
grant execute on function private.studio2_storage_edition_access_allowed(text, boolean)
to authenticated;

-- Beta feedback screenshots remain elevated administration rather than a
-- viewer-class rollout.read surface.
drop policy if exists "Organizers can read beta screenshots" on storage.objects;
create policy "Organizers can read beta screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'beta-feedback'::text
  and public.studio2_access_allowed('rollout.manage', null, false)
);

-- Country ownership remains an independent authorization path. The Organizer
-- override moves to global delegation.manage because country media is not tied
-- to one edition.
drop policy if exists "country media bucket owner delete" on storage.objects;
create policy "country media bucket owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-media'::text
  and (
    public.studio2_access_allowed('delegation.manage', null, false)
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

drop policy if exists "country media bucket owner insert" on storage.objects;
create policy "country media bucket owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-media'::text
  and (
    public.studio2_access_allowed('delegation.manage', null, false)
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

drop policy if exists "country media bucket owner update" on storage.objects;
create policy "country media bucket owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-media'::text
  and (
    public.studio2_access_allowed('delegation.manage', null, false)
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(objects.name))[1]
    )
  )
)
with check (
  bucket_id = 'country-media'::text
  and (
    public.studio2_access_allowed('delegation.manage', null, false)
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- Edition artwork paths are `${editionId}/...`; allow global edition managers
-- or managers scoped to the edition encoded in the first folder segment.
drop policy if exists "organizers delete edition artwork" on storage.objects;
create policy "organizers delete edition artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'edition-artwork'::text
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

drop policy if exists "organizers update edition artwork" on storage.objects;
create policy "organizers update edition artwork"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'edition-artwork'::text
  and private.studio2_storage_edition_access_allowed(objects.name, false)
)
with check (
  bucket_id = 'edition-artwork'::text
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

drop policy if exists "organizers upload edition artwork" on storage.objects;
create policy "organizers upload edition artwork"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'edition-artwork'::text
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

-- Fail closed if the policy helper privilege boundary drifts.
do $verify$
begin
  if not has_function_privilege(
    'authenticated',
    'private.studio2_storage_edition_access_allowed(text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.studio2_storage_edition_access_allowed through RLS';
  end if;

  if has_function_privilege(
    'anon',
    'private.studio2_storage_edition_access_allowed(text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly gained private.studio2_storage_edition_access_allowed EXECUTE';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
