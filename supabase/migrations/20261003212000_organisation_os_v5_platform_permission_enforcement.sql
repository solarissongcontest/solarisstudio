begin;

-- Organisation OS V5 operational-mode enforcement at the authoritative
-- permission boundary. Most legacy security-definer mutation RPCs already
-- authorize through studio2_access_allowed(), so restricting mutation-level
-- capabilities here closes them without duplicating mode checks everywhere.

create or replace function private.studio2_capability_allowed_in_platform_mode(
  p_capability text,
  p_access_level text,
  p_mode text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $allowed$
  select case coalesce(p_mode, 'normal')
    when 'normal' then true
    when 'degraded' then true
    when 'read_only' then
      p_access_level = 'read'
      or p_capability in (
        'maintenance.manage',
        'incident.manage',
        'incident.resolve',
        'integrity.manage',
        'communications.send'
      )
    when 'maintenance' then
      p_access_level = 'read'
      or p_capability in (
        'maintenance.manage',
        'incident.manage',
        'incident.resolve',
        'communications.send'
      )
    else false
  end;
$allowed$;

revoke all on function private.studio2_capability_allowed_in_platform_mode(
  text, text, text
) from public, anon, authenticated;

create or replace function public.studio2_access_allowed(
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
declare
  v_actor uuid := auth.uid();
  v_has_capability boolean := false;
  v_access_level text;
  v_mode text := 'normal';
begin
  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  v_has_capability := private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );

  if not v_has_capability then
    return false;
  end if;

  select capability.access_level
  into v_access_level
  from public.studio2_capabilities capability
  where capability.key = p_capability;

  if v_access_level is null then
    return false;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  return private.studio2_capability_allowed_in_platform_mode(
    p_capability,
    v_access_level,
    coalesce(v_mode, 'normal')
  );
end
$allowed$;

revoke all on function public.studio2_access_allowed(text, uuid, boolean)
  from public, anon;
grant execute on function public.studio2_access_allowed(text, uuid, boolean)
  to authenticated, service_role;

-- New upload authorizations are mutations and must fail closed in Read-only
-- and Maintenance even though public beta feedback can be anonymous.
create or replace function private.studio2_upload_platform_allows_prepare()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select coalesce(
    private.studio2_platform_mutation_allowed('upload.prepare'),
    false
  );
$allowed$;

revoke all on function private.studio2_upload_platform_allows_prepare()
  from public, anon, authenticated;

create or replace function public.studio2_prepare_upload(
  p_domain text,
  p_entity_id uuid,
  p_scope text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $prepare$
declare
  v_actor uuid := auth.uid();
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_scope text := lower(btrim(coalesce(p_scope, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_context jsonb := case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end;
  v_token_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_extension text;
  v_final_bucket text;
  v_final_path text;
  v_quarantine_path text;
  v_admin_beta boolean := coalesce((v_context ->> 'admin')::boolean, false);
begin
  if not private.studio2_upload_platform_allows_prepare() then
    raise exception 'Uploads are unavailable while Solaris is Read-only or in Maintenance'
      using errcode = '25006';
  end if;

  if v_name = '' or length(v_name) > 220 then
    raise exception 'A valid upload file name is required' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 then
    raise exception 'Upload must contain at least one byte' using errcode = '22023';
  end if;

  v_extension := private.studio2_upload_extension(v_domain, v_name, v_mime);
  if v_extension is null then
    raise exception 'Unsupported file type for upload domain %', v_domain using errcode = '22023';
  end if;

  if v_domain = 'country_media' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country media upload access required' using errcode = '42501';
    end if;
    if v_scope not in ('flags', 'gallery', 'backgrounds') then
      raise exception 'Unknown country media folder' using errcode = '22023';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
       or p_size > 8388608 then
      raise exception 'Country media must be an allowed image no larger than 8 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-media';
    v_final_path := p_entity_id::text || '/' || v_scope || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'edition_artwork' then
    if v_actor is null
       or p_entity_id is null
       or not public.studio2_access_allowed('edition.manage', p_entity_id, false) then
      raise exception 'Edition design access required' using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
       or p_size > 15728640 then
      raise exception 'Edition artwork must be JPG, PNG or WebP and no larger than 15 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'edition-artwork';
    v_final_path := p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'country_font' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country font upload access required' using errcode = '42501';
    end if;
    if v_mime not in (
      'font/woff2',
      'font/woff',
      'font/ttf',
      'font/otf',
      'application/font-woff',
      'application/x-font-ttf',
      'application/x-font-opentype',
      'application/octet-stream'
    ) or p_size > 4194304 then
      raise exception 'Custom fonts must be WOFF2, WOFF, TTF or OTF and no larger than 4 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-fonts';
    v_final_path := v_actor::text || '/' || p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'beta_feedback' then
    if v_admin_beta and v_actor is null then
      raise exception 'Authenticated Organizer session required for admin beta feedback'
        using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
       or p_size > 8388608 then
      raise exception 'Beta screenshots must be an allowed image no larger than 8 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'beta-feedback';
    v_final_path :=
      case when v_admin_beta then 'admin/' else 'public/' end
      || v_token_id::text || '.' || v_extension;

  else
    raise exception 'Unknown upload domain' using errcode = '22023';
  end if;

  v_quarantine_path := v_token_id::text || '/' || v_token_id::text || '.' || v_extension;

  insert into public.studio2_upload_authorizations (
    id,
    actor_id,
    domain,
    entity_id,
    scope,
    final_bucket,
    quarantine_path,
    final_path,
    original_name,
    declared_mime,
    expected_size,
    authorization_secret,
    context
  )
  values (
    v_token_id,
    v_actor,
    v_domain,
    p_entity_id,
    nullif(v_scope, ''),
    v_final_bucket,
    v_quarantine_path,
    v_final_path,
    v_name,
    v_mime,
    p_size,
    v_secret,
    v_context
  );

  return jsonb_build_object(
    'token_id', v_token_id,
    'upload_secret', v_secret,
    'bucket', 'solaris-upload-quarantine',
    'object_path', v_quarantine_path,
    'final_bucket', v_final_bucket,
    'expires_at', now() + interval '10 minutes'
  );
end
$prepare$;

revoke all on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) from public;
grant execute on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
