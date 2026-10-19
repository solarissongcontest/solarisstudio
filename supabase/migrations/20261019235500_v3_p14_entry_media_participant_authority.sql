begin;

-- Solaris Studio V3 P14 / System authority for participant Entry media.
--
-- This deliberately reuses the existing verified image quarantine/finalizer
-- instead of inventing another upload store. The existing `country_media`
-- transport profile remains the byte-validation profile for now; the
-- authorization context binds the upload to one canonical Entry + asset slot.
-- Only image slots supported by the current signature-verifying finalizer are
-- exposed here. Audio/video stay fail-closed until their bytes have an equally
-- authoritative verification profile.

create or replace function private.v3_entry_media_supported_asset_type(
  p_asset_type text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $supported$
  select lower(btrim(coalesce(p_asset_type, ''))) in (
    'artist_photo',
    'cover_artwork'
  );
$supported$;

revoke all on function private.v3_entry_media_supported_asset_type(text)
  from public, anon, authenticated, service_role;

create or replace function private.v3_entry_media_storage_base_from_jwt()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, auth
as $base$
declare
  v_issuer text := nullif(btrim(coalesce(auth.jwt() ->> 'iss', '')), '');
  v_base text;
begin
  -- Supabase user JWT issuers end in /auth/v1 on both local/loopback and hosted
  -- projects. The issuer is signed server context, never a browser-supplied URL.
  if v_issuer is null
     or v_issuer !~* '^https?://[^[:space:]]+/auth/v1/?$' then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION',
      hint = 'Solaris could not bind the upload to this authenticated project.';
  end if;

  v_base := regexp_replace(v_issuer, '/auth/v1/?$', '', 'i');
  return v_base || '/storage/v1/object/public';
end
$base$;

revoke all on function private.v3_entry_media_storage_base_from_jwt()
  from public, anon, authenticated, service_role;

create or replace function public.v3_prepare_entry_media_upload(
  p_entry_id uuid,
  p_asset_type text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $prepare$
declare
  v_actor uuid := auth.uid();
  v_entry public.entries%rowtype;
  v_asset_type text := lower(btrim(coalesce(p_asset_type, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_extension text;
  v_authorization_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_quarantine_path text;
  v_final_path text;
  v_expected_source text;
  v_storage_base text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_entry_id is null
     or not private.v3_entry_media_supported_asset_type(v_asset_type) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_name = '' or length(v_name) > 220
     or p_size is null or p_size <= 0 or p_size > 5242880
     or v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      hint = 'Entry images must be JPG, PNG or WebP and no larger than 5 MB.';
  end if;

  if not coalesce(private.studio2_platform_mutation_allowed('upload.prepare'), false) then
    raise exception
      'Uploads are unavailable while Solaris is Read-only or in Maintenance'
      using errcode = '25006';
  end if;

  select entry.*
  into v_entry
  from public.entries entry
  where entry.id = p_entry_id
  for share;

  if v_entry.id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if not private.v3_next_in_line_actor_controls_country(
    v_actor,
    v_entry.edition_id,
    v_entry.country_id
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_entry.status in ('withdrawn', 'disqualified') then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      hint = 'Entry media cannot be changed for an inactive Entry.';
  end if;

  v_extension := private.studio2_upload_extension(
    'country_media',
    v_name,
    v_mime
  );
  if v_extension is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_expected_source := private.studio2_resolve_media_asset_source(
    v_entry.edition_id,
    'entry:' || v_entry.id::text || ':' || v_asset_type,
    v_asset_type,
    v_entry.country_id,
    v_entry.id
  );
  v_storage_base := private.v3_entry_media_storage_base_from_jwt();

  v_quarantine_path :=
    v_authorization_id::text || '/' || v_authorization_id::text || '.' || v_extension;
  v_final_path :=
    v_entry.country_id::text || '/entry/' || v_entry.id::text || '/' ||
    v_asset_type || '/' || v_authorization_id::text || '.' || v_extension;

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
    v_authorization_id,
    v_actor,
    'country_media',
    v_entry.id,
    v_asset_type,
    'country-media',
    v_quarantine_path,
    v_final_path,
    v_name,
    v_mime,
    p_size,
    v_secret,
    jsonb_build_object(
      'purpose', 'entry_media',
      'entryId', v_entry.id,
      'editionId', v_entry.edition_id,
      'countryId', v_entry.country_id,
      'assetType', v_asset_type,
      'assetKey', 'entry:' || v_entry.id::text || ':' || v_asset_type,
      'expectedSourceFingerprint', v_expected_source,
      'storagePublicBase', v_storage_base
    )
  );

  return jsonb_build_object(
    'token_id', v_authorization_id,
    'upload_secret', v_secret,
    'bucket', 'solaris-upload-quarantine',
    'object_path', v_quarantine_path,
    'final_bucket', 'country-media',
    'expires_at', now() + interval '10 minutes',
    'entry_id', v_entry.id,
    'asset_type', v_asset_type,
    'asset_key', 'entry:' || v_entry.id::text || ':' || v_asset_type
  );
end
$prepare$;

revoke all on function public.v3_prepare_entry_media_upload(
  uuid, text, text, text, bigint
) from public, anon;
grant execute on function public.v3_prepare_entry_media_upload(
  uuid, text, text, text, bigint
) to authenticated;

create or replace function public.v3_commit_entry_media_upload(
  p_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $commit$
declare
  v_actor uuid := auth.uid();
  v_authorization public.studio2_upload_authorizations%rowtype;
  v_entry public.entries%rowtype;
  v_asset_type text;
  v_expected_source text;
  v_current_source text;
  v_public_base text;
  v_public_url text;
  v_metadata jsonb;
  v_replayed boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_token_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-entry-media:' || p_token_id::text, 0)
  );

  select upload_auth.*
  into v_authorization
  from public.studio2_upload_authorizations upload_auth
  where upload_auth.id = p_token_id
    and upload_auth.actor_id = v_actor
    and upload_auth.context ->> 'purpose' = 'entry_media'
  for update;

  -- Do not reveal whether another actor owns a token.
  if v_authorization.id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_asset_type := lower(btrim(coalesce(v_authorization.context ->> 'assetType', '')));
  if v_authorization.domain <> 'country_media'
     or v_authorization.final_bucket <> 'country-media'
     or v_authorization.entity_id is null
     or v_authorization.scope is distinct from v_asset_type
     or not private.v3_entry_media_supported_asset_type(v_asset_type) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  if v_authorization.status <> 'verified' then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      hint = case
        when v_authorization.status = 'rejected' then 'upload_rejected'
        when v_authorization.status = 'expired' then 'upload_expired'
        else 'upload_not_verified'
      end;
  end if;

  select entry.*
  into v_entry
  from public.entries entry
  where entry.id = v_authorization.entity_id
    and entry.edition_id::text = v_authorization.context ->> 'editionId'
    and entry.country_id::text = v_authorization.context ->> 'countryId'
  for update;

  if v_entry.id is null
     or not private.v3_next_in_line_actor_controls_country(
       v_actor,
       v_entry.edition_id,
       v_entry.country_id
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_entry.status in ('withdrawn', 'disqualified') then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  v_public_base := nullif(btrim(coalesce(
    v_authorization.context ->> 'storagePublicBase',
    ''
  )), '');
  if v_public_base is null
     or v_public_base !~* '^https?://[^[:space:]]+/storage/v1/object/public$' then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  v_public_url := v_public_base || '/' ||
    v_authorization.final_bucket || '/' || v_authorization.final_path;
  v_current_source := private.studio2_resolve_media_asset_source(
    v_entry.edition_id,
    'entry:' || v_entry.id::text || ':' || v_asset_type,
    v_asset_type,
    v_entry.country_id,
    v_entry.id
  );

  -- A duplicate/replayed commit for the same verified token is harmless.
  if v_current_source is not distinct from v_public_url then
    v_replayed := true;
  else
    v_expected_source := nullif(
      btrim(coalesce(v_authorization.context ->> 'expectedSourceFingerprint', '')),
      ''
    );

    -- This is the per-slot optimistic concurrency boundary. A token prepared
    -- for source A must never overwrite source B after another device/user has
    -- changed the canonical slot.
    if v_current_source is distinct from v_expected_source then
      raise exception using
        errcode = '40001',
        message = 'STATE_CHANGED',
        hint = 'Entry media changed after this upload was authorized.';
    end if;

    v_metadata := coalesce(v_entry.metadata, '{}'::jsonb);

    if v_asset_type = 'artist_photo' then
      v_metadata :=
        v_metadata
        - 'artistPhotoUrl'
        - 'artist_image_url'
        - 'artistImageUrl'
        - 'artistPhotoProcessing'
        || jsonb_build_object(
          'artist_photo_url', v_public_url,
          'artist_photo_processing', false
        );
    elsif v_asset_type = 'cover_artwork' then
      v_metadata :=
        v_metadata
        - 'coverArtworkUrl'
        - 'artwork_url'
        - 'artworkUrl'
        - 'coverArtworkProcessing'
        || jsonb_build_object(
          'cover_artwork_url', v_public_url,
          'cover_artwork_processing', false
        );
    else
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update public.entries
    set
      metadata = v_metadata,
      updated_at = clock_timestamp()
    where id = v_entry.id;

    -- S3's after-update trigger supersedes any active review whose exact source
    -- fingerprint no longer matches. No approval can silently survive a file
    -- replacement.
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', v_replayed,
    'tokenId', v_authorization.id,
    'entryId', v_entry.id,
    'assetKey', 'entry:' || v_entry.id::text || ':' || v_asset_type,
    'assetType', v_asset_type,
    'state', 'validating',
    'sourceFingerprint', v_public_url,
    'updatedAt', clock_timestamp()
  );
end
$commit$;

revoke all on function public.v3_commit_entry_media_upload(uuid)
  from public, anon;
grant execute on function public.v3_commit_entry_media_upload(uuid)
  to authenticated;

create or replace function public.v3_my_entry_media(
  p_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $projection$
declare
  v_actor uuid := auth.uid();
  v_entry public.entries%rowtype;
  v_asset_type text;
  v_asset_key text;
  v_source text;
  v_review public.studio2_media_asset_reviews%rowtype;
  v_upload public.studio2_upload_authorizations%rowtype;
  v_state text;
  v_reason text;
  v_updated_at timestamptz;
  v_assets jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_entry_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select entry.*
  into v_entry
  from public.entries entry
  where entry.id = p_entry_id;

  if v_entry.id is null
     or not private.v3_next_in_line_actor_controls_country(
       v_actor,
       v_entry.edition_id,
       v_entry.country_id
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  foreach v_asset_type in array array['artist_photo'::text, 'cover_artwork'::text]
  loop
    v_asset_key := 'entry:' || v_entry.id::text || ':' || v_asset_type;
    v_source := private.studio2_resolve_media_asset_source(
      v_entry.edition_id,
      v_asset_key,
      v_asset_type,
      v_entry.country_id,
      v_entry.id
    );

    v_review := null;
    if v_source is not null then
      select review.*
      into v_review
      from public.studio2_media_asset_reviews review
      where review.edition_id = v_entry.edition_id
        and review.entry_id = v_entry.id
        and review.country_id = v_entry.country_id
        and review.asset_key = v_asset_key
        and review.asset_type = v_asset_type
        and review.superseded_at is null
        and review.source_fingerprint = v_source
      order by review.reviewed_at desc, review.id desc
      limit 1;
    end if;

    select upload_auth.*
    into v_upload
    from public.studio2_upload_authorizations upload_auth
    where upload_auth.actor_id = v_actor
      and upload_auth.entity_id = v_entry.id
      and upload_auth.context ->> 'purpose' = 'entry_media'
      and upload_auth.context ->> 'assetType' = v_asset_type
    order by upload_auth.created_at desc, upload_auth.id desc
    limit 1;

    -- Empty slots with no upload history are owned by the Entry form itself,
    -- not this pipeline projection. Omit them rather than inventing a failure.
    if v_source is null and v_upload.id is null then
      continue;
    end if;

    if v_source is not null and v_review.id is not null and v_review.decision = 'approved' then
      v_state := 'accepted';
      v_reason := null;
      v_updated_at := v_review.reviewed_at;
    elsif v_source is not null and v_review.id is not null and v_review.decision = 'invalid' then
      v_state := 'replacement_required';
      -- Organizer review text can contain internal context. The participant
      -- projection intentionally exposes a stable safe action instead.
      v_reason := 'Organizer review requires a replacement for this media.';
      v_updated_at := v_review.reviewed_at;
    elsif v_source is not null then
      v_state := 'validating';
      v_reason := null;
      v_updated_at := greatest(v_entry.updated_at, coalesce(v_upload.finalized_at, v_entry.updated_at));
    elsif v_upload.status in ('rejected', 'expired') then
      v_state := 'failed';
      v_reason := case
        when v_upload.status = 'expired' then
          'The upload authorization expired. Start a new authorized upload.'
        else
          'Solaris rejected this upload. Choose a supported replacement file.'
      end;
      v_updated_at := coalesce(v_upload.finalized_at, v_upload.created_at);
    else
      -- prepared or verified-but-not-yet-committed are both non-terminal
      -- processing states. Retrying the same logical upload/commit reconciles
      -- ambiguous network outcomes without minting a duplicate asset.
      v_state := 'processing';
      v_reason := null;
      v_updated_at := coalesce(v_upload.finalized_at, v_upload.created_at);
    end if;

    v_assets := v_assets || jsonb_build_array(jsonb_build_object(
      'assetKey', v_asset_key,
      'assetType', v_asset_type,
      'state', v_state,
      'reason', v_reason,
      'sourceFingerprint', v_source,
      'updatedAt', v_updated_at
    ));
  end loop;

  return jsonb_build_object(
    'entryId', v_entry.id,
    'editionId', v_entry.edition_id,
    'countryId', v_entry.country_id,
    'assets', v_assets,
    'serverTime', clock_timestamp()
  );
end
$projection$;

revoke all on function public.v3_my_entry_media(uuid)
  from public, anon;
grant execute on function public.v3_my_entry_media(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
