begin;

select public.v3_register_migration_contract(
  'v3.identity.storage-session-boundary', 1, 'forward_fix_only', false, null,
  'Bind authenticated Storage access to live canonical sessions; retain anonymous capability semantics and verify revocation denial locally.'
);

-- Identity/sign-out authority must follow the canonical Supabase Auth session,
-- including Storage requests that do not traverse PostgREST's db_pre_request
-- hook. Reuse the existing auth.sessions-backed guard instead of inventing a
-- second session-validity model.
create or replace function private.v3_storage_authenticated_session_active()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $active$
begin
  if auth.uid() is null then
    return false;
  end if;

  perform private.v3_require_active_auth_session();
  return true;
exception
  when sqlstate '42501' then
    return false;
end
$active$;

revoke all on function private.v3_storage_authenticated_session_active()
  from public, anon, service_role;
grant execute on function private.v3_storage_authenticated_session_active()
  to authenticated;

-- Unified quarantine supports anonymous public beta uploads and authenticated
-- account uploads. Anonymous capabilities remain intentionally available, while
-- any actor-bound upload now also proves that the JWT's session_id still exists
-- in canonical auth.sessions.
create or replace function private.studio2_upload_quarantine_path_allowed(
  p_actor uuid,
  p_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $allowed$
begin
  if p_actor is not null
     and not private.v3_storage_authenticated_session_active() then
    return false;
  end if;

  return exists (
    select 1
    from public.studio2_upload_authorizations as upload_auth
    where upload_auth.quarantine_path = p_path
      and upload_auth.status = 'prepared'
      and upload_auth.expires_at > now()
      and (
        upload_auth.actor_id = p_actor
        or (upload_auth.actor_id is null and p_actor is null)
      )
  );
end
$allowed$;

revoke all on function private.studio2_upload_quarantine_path_allowed(uuid, text)
  from public, anon, service_role;
grant execute on function private.studio2_upload_quarantine_path_allowed(uuid, text)
  to anon, authenticated;

-- Private beta screenshots are an authenticated Organizer read. A stale JWT
-- from a signed-out/revoked session must not remain a usable Storage reader.
drop policy if exists "Organizers can read beta screenshots" on storage.objects;
create policy "Organizers can read beta screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'beta-feedback'::text
  and private.v3_storage_authenticated_session_active()
  and public.studio2_access_allowed('rollout.manage', null, false)
);

-- Final country-media bytes are service-published, but authenticated deletion
-- remains a direct Storage operation. Bind that operation to the same live
-- session authority used by the Data API.
drop policy if exists "country media bucket owner delete" on storage.objects;
create policy "country media bucket owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-media'::text
  and private.v3_storage_authenticated_session_active()
  and coalesce(private.studio2_platform_mutation_allowed('storage.delete'), false)
  and (
    public.studio2_access_allowed('delegation.manage', null, false)
    or exists (
      select 1
      from public.country_accounts account
      where account.user_id = auth.uid()
        and account.country_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- Edition artwork is also service-published after quarantine finalization. Keep
-- its remaining authenticated delete authority session-live.
drop policy if exists "organizers delete edition artwork" on storage.objects;
create policy "organizers delete edition artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'edition-artwork'::text
  and private.v3_storage_authenticated_session_active()
  and coalesce(private.studio2_platform_mutation_allowed('storage.delete'), false)
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

-- Country fonts retain an authenticated owner delete path. A user id claim by
-- itself is insufficient after canonical sign-out/session revocation.
drop policy if exists "country fonts owner delete" on storage.objects;
create policy "country fonts owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-fonts'
  and private.v3_storage_authenticated_session_active()
  and coalesce(private.studio2_platform_mutation_allowed('storage.delete'), false)
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';

commit;
