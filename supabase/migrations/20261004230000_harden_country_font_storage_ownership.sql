begin;

-- country-fonts paths are `${userId}/${countryId}/${file}`.
-- The original Storage policy validated only the userId segment, which allowed
-- an authenticated user to create public objects under arbitrary country IDs.
-- Bind the second path segment to real country ownership (or the elevated
-- delegation.manage capability) for every mutating operation.

create or replace function private.studio2_country_font_path_allowed(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, storage
as $$
  select
    (storage.foldername(p_object_name))[1] = auth.uid()::text
    and (storage.foldername(p_object_name))[2] is not null
    and (
      exists (
        select 1
        from public.country_accounts ca
        where ca.user_id = auth.uid()
          and ca.status = 'active'
          and ca.country_id::text = (storage.foldername(p_object_name))[2]
      )
      or public.studio2_access_allowed('delegation.manage', null, false)
    );
$$;

revoke all on function private.studio2_country_font_path_allowed(text)
  from public, anon, service_role;
grant execute on function private.studio2_country_font_path_allowed(text)
  to authenticated;

drop policy if exists "country fonts authenticated upload" on storage.objects;
create policy "country fonts authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-fonts'
  and private.studio2_country_font_path_allowed(name)
);

drop policy if exists "country fonts owner update" on storage.objects;
create policy "country fonts owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-fonts'
  and private.studio2_country_font_path_allowed(name)
)
with check (
  bucket_id = 'country-fonts'
  and private.studio2_country_font_path_allowed(name)
);

drop policy if exists "country fonts owner delete" on storage.objects;
create policy "country fonts owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-fonts'
  and private.studio2_country_font_path_allowed(name)
);

notify pgrst, 'reload schema';

commit;
