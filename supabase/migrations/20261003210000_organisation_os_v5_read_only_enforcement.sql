begin;

-- Organisation OS V5 Read-only / Maintenance enforcement.
--
-- Canonical operation-contract RPCs are already guarded by
-- private.studio2_claim_operation. This migration closes the remaining
-- compatibility surfaces:
--   1. PostgREST legacy volatile RPCs and direct Data API table writes.
--   2. Direct writes to public tables that anon/authenticated can mutate.
--   3. User Storage writes, including uploads authorized before mode entry.
--
-- Storage/Auth/Realtime are not covered by PostgREST db_pre_request, so Storage
-- is guarded separately at RLS. Authentication remains available because fresh
-- auth is required for protected recovery operations.

create or replace function private.studio2_data_api_operational_gate()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $gate$
declare
  v_mode text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
  v_rpc_name text;
  v_read_only_rpc boolean := false;
begin
  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  if v_mode in ('normal', 'degraded') then
    return;
  end if;

  if v_method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;

  if v_path like '/rpc/%' then
    v_rpc_name := split_part(split_part(v_path, '/', 3), '?', 1);

    -- Explicit recovery mutation. All normal mutation RPCs remain denied.
    if v_rpc_name in (
      'studio2_apply_platform_mode_change',
      'studio2_platform_exit_database_preflight',
      'studio2_record_platform_exit_preflight'
    ) then
      return;
    end if;

    -- PostgREST invokes read RPCs with POST too. Allow only functions whose
    -- entire public overload set is declared STABLE/IMMUTABLE. A missing,
    -- ambiguous-volatility or VOLATILE RPC fails closed.
    select coalesce(bool_and(proc.provolatile in ('s', 'i')), false)
    into v_read_only_rpc
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = v_rpc_name;

    if v_read_only_rpc then
      return;
    end if;
  end if;

  raise exception 'Solaris is currently %, so normal writes are unavailable', v_mode
    using errcode = '25006',
          hint = 'Use an explicitly authorized recovery operation or wait until the platform mode changes.';
end
$gate$;

revoke all on function private.studio2_data_api_operational_gate()
  from public;
grant execute on function private.studio2_data_api_operational_gate()
  to anon, authenticated, service_role;

-- private is not an exposed PostgREST schema. USAGE is required only so the
-- switched request role can execute the configured pre-request function.
grant usage on schema private to anon, authenticated, service_role;

-- Storage RLS evaluates the canonical platform-mode helper as the request role.
-- Keep it private/unexposed, but permit policy execution.
grant execute on function private.studio2_platform_mutation_allowed(text)
  to anon, authenticated;

alter role authenticator
  set pgrst.db_pre_request = 'private.studio2_data_api_operational_gate';

create or replace function private.studio2_guard_direct_client_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_mode text;
begin
  -- Database administrators/migrations remain an out-of-band recovery path.
  if session_user in ('postgres', 'supabase_admin') then
    return null;
  end if;

  if coalesce(current_setting('studio2.platform_recovery_write', true), '') = 'on' then
    return null;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode in ('read_only', 'maintenance') then
    raise exception 'Solaris is currently %, so this write is unavailable', v_mode
      using errcode = '25006';
  end if;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  return null;
end
$guard$;

revoke all on function private.studio2_guard_direct_client_write()
  from public, anon, authenticated, service_role;

-- Attach one statement-level guard to every public base table that is directly
-- writable by anon/authenticated. The inventory is derived from real grants at
-- migration time rather than maintained as a brittle handwritten table list.
do $attach$
declare
  v_table record;
begin
  for v_table in
    select distinct grant_row.table_name
    from information_schema.table_privileges grant_row
    join information_schema.tables table_row
      on table_row.table_schema = grant_row.table_schema
     and table_row.table_name = grant_row.table_name
    where grant_row.table_schema = 'public'
      and table_row.table_type = 'BASE TABLE'
      and grant_row.grantee in ('anon', 'authenticated')
      and grant_row.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format(
      'drop trigger if exists studio2_platform_direct_write_guard on public.%I',
      v_table.table_name
    );
    execute format(
      'create trigger studio2_platform_direct_write_guard before insert or update or delete on public.%I for each statement execute function private.studio2_guard_direct_client_write()',
      v_table.table_name
    );
  end loop;
end
$attach$;

-- A country-media token ceases to authorize bytes immediately when Solaris is
-- Read-only/Maintenance. This invalidates tokens issued before mode entry too.
create or replace function private.studio2_country_media_upload_token_valid(
  p_user_id uuid,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $valid$
  select
    coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
    and exists (
      select 1
      from public.studio2_country_media_upload_tokens token
      where token.user_id = p_user_id
        and token.object_path = p_object_path
        and token.consumed_at is null
        and token.expires_at > now()
    );
$valid$;

revoke all on function private.studio2_country_media_upload_token_valid(uuid, text)
  from public, anon, service_role;
grant execute on function private.studio2_country_media_upload_token_valid(uuid, text)
  to authenticated;

-- Integrity evidence uses a separate anonymous/authenticated token model.
-- Preserve that ownership model, but make Storage write authorization respect
-- the platform mode at the final RLS boundary.
create or replace function public.integrity_can_upload_evidence(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $integrity_upload$
  select
    coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
    and (
      public.integrity_is_organizer()
      or exists (
        select 1
        from public.integrity_evidence_upload_tokens token
        where token.object_path = _name
          and token.expires_at > now()
          and token.used_at is null
      )
    );
$integrity_upload$;

revoke all on function public.integrity_can_upload_evidence(text) from public;
grant execute on function public.integrity_can_upload_evidence(text)
  to anon, authenticated;

-- Country-media deletes are normal writes too.
drop policy if exists "country media bucket owner delete" on storage.objects;
create policy "country media bucket owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-media'::text
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

-- Edition artwork keeps its edition-scoped Permission Engine boundary while all
-- byte mutations additionally obey platform mode.
drop policy if exists "organizers upload edition artwork" on storage.objects;
create policy "organizers upload edition artwork"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'edition-artwork'::text
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

drop policy if exists "organizers update edition artwork" on storage.objects;
create policy "organizers update edition artwork"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'edition-artwork'::text
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and private.studio2_storage_edition_access_allowed(objects.name, false)
)
with check (
  bucket_id = 'edition-artwork'::text
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

drop policy if exists "organizers delete edition artwork" on storage.objects;
create policy "organizers delete edition artwork"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'edition-artwork'::text
  and coalesce(private.studio2_platform_mutation_allowed('storage.delete'), false)
  and private.studio2_storage_edition_access_allowed(objects.name, false)
);

-- Custom fonts retain owner-folder isolation.
drop policy if exists "country fonts authenticated upload" on storage.objects;
create policy "country fonts authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-fonts'
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "country fonts owner update" on storage.objects;
create policy "country fonts owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-fonts'
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'country-fonts'
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "country fonts owner delete" on storage.objects;
create policy "country fonts owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-fonts'
  and coalesce(private.studio2_platform_mutation_allowed('storage.delete'), false)
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Public beta screenshots are intentionally anonymous, but a platform
-- Read-only/Maintenance state still suspends new screenshot bytes.
drop policy if exists "Public beta testers can upload screenshots" on storage.objects;
create policy "Public beta testers can upload screenshots"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'beta-feedback'
  and coalesce(private.studio2_platform_mutation_allowed('storage.upload'), false)
);

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
