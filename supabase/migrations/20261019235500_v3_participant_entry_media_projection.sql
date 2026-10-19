begin;

-- Solaris Studio V3 P14 / System integration:
-- expose the submitting delegation's current Entry-media review state without
-- granting participant clients access to Organizer review rows or raw media
-- moderation history. Canonical media remains owned by public.entries and the
-- existing source-bound review table remains immutable decision evidence.

create or replace function private.v3_entry_media_processing(
  p_metadata jsonb,
  p_asset_type text
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $processing$
  select case p_asset_type
    when 'performance_video' then
      coalesce(p_metadata ->> 'video_processing', p_metadata ->> 'videoProcessing', 'false') = 'true'
    when 'artist_photo' then
      coalesce(p_metadata ->> 'artist_photo_processing', p_metadata ->> 'artistPhotoProcessing', 'false') = 'true'
    when 'cover_artwork' then
      coalesce(p_metadata ->> 'cover_artwork_processing', p_metadata ->> 'coverArtworkProcessing', 'false') = 'true'
    when 'audio_master' then
      coalesce(p_metadata ->> 'audio_master_processing', p_metadata ->> 'audioMasterProcessing', 'false') = 'true'
    when 'postcard' then
      coalesce(p_metadata ->> 'postcard_processing', p_metadata ->> 'postcardProcessing', 'false') = 'true'
    when 'press_image' then
      coalesce(p_metadata ->> 'press_image_processing', p_metadata ->> 'pressImageProcessing', 'false') = 'true'
    when 'broadcast_graphic' then
      coalesce(p_metadata ->> 'broadcast_graphic_processing', p_metadata ->> 'broadcastGraphicProcessing', 'false') = 'true'
    else false
  end;
$processing$;

revoke all on function private.v3_entry_media_processing(jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_my_entry_media(p_entry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $projection$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_entry public.entries%rowtype;
  v_asset_type text;
  v_asset_key text;
  v_source text;
  v_processing boolean;
  v_review public.studio2_media_asset_reviews%rowtype;
  v_state text;
  v_reason text;
  v_updated_at timestamptz;
  v_assets jsonb := '[]'::jsonb;
begin
  if p_entry_id is null then
    raise exception 'Entry id is required' using errcode = '22023';
  end if;

  if v_actor is null and not v_is_service then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select entry.*
  into v_entry
  from public.entries entry
  where entry.id = p_entry_id;

  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;

  -- Participant authority is intentionally the same active country-account
  -- ownership model used by the existing owned-country Entry mutation RPCs.
  -- Do not accept a caller-supplied country/delegation id as authority.
  if not v_is_service and not exists (
    select 1
    from public.country_accounts account
    where account.user_id = v_actor
      and account.country_id = v_entry.country_id
      and account.status = 'active'
  ) then
    raise exception 'This Entry does not belong to your active delegation' using errcode = '42501';
  end if;

  foreach v_asset_type in array array[
    'performance_video',
    'artist_photo',
    'cover_artwork',
    'audio_master',
    'postcard',
    'press_image',
    'broadcast_graphic'
  ]
  loop
    v_asset_key := 'entry:' || v_entry.id::text || ':' || v_asset_type;
    v_source := private.studio2_resolve_media_asset_source(
      v_entry.edition_id,
      v_asset_key,
      v_asset_type,
      v_entry.country_id,
      v_entry.id
    );

    -- A missing canonical source is an empty slot, not evidence that an upload
    -- failed. Public P14 renders absence from Entry state and only consumes this
    -- projection once System has a canonical source/review state to report.
    if nullif(btrim(coalesce(v_source, '')), '') is null then
      continue;
    end if;

    v_processing := private.v3_entry_media_processing(
      coalesce(v_entry.metadata, '{}'::jsonb),
      v_asset_type
    );

    v_review := null;
    select review.*
    into v_review
    from public.studio2_media_asset_reviews review
    where review.edition_id = v_entry.edition_id
      and review.asset_key = v_asset_key
      and review.asset_type = v_asset_type
      and review.country_id = v_entry.country_id
      and review.entry_id = v_entry.id
      and review.source_fingerprint = v_source
      and review.superseded_at is null
    order by review.reviewed_at desc
    limit 1;

    if v_review.id is not null and v_review.decision = 'invalid' then
      v_state := 'replacement_required';
      v_reason := nullif(btrim(v_review.reason), '');
      v_updated_at := greatest(v_entry.updated_at, v_review.reviewed_at);
    elsif v_review.id is not null and v_review.decision = 'approved' then
      v_state := 'accepted';
      v_reason := null;
      v_updated_at := greatest(v_entry.updated_at, v_review.reviewed_at);
    elsif v_processing then
      v_state := 'processing';
      v_reason := null;
      v_updated_at := v_entry.updated_at;
    else
      v_state := 'validating';
      v_reason := null;
      v_updated_at := v_entry.updated_at;
    end if;

    v_assets := v_assets || jsonb_build_array(jsonb_build_object(
      'assetKey', v_asset_key,
      'assetType', v_asset_type,
      'state', v_state,
      'reason', v_reason,
      -- Do not expose an unpublished/private URL merely so the client can bind
      -- state. A stable opaque version lets Public discard stale evidence while
      -- the server compares Organizer review evidence against the real source.
      'sourceVersion', md5(v_source),
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

revoke all on function public.studio2_my_entry_media(uuid)
  from public, anon;
grant execute on function public.studio2_my_entry_media(uuid)
  to authenticated, service_role;

comment on function public.studio2_my_entry_media(uuid) is
  'Participant-safe V3 Entry-media projection. Authorizes the current Entry against the authenticated active country account, binds review state to the current canonical source, and does not expose Organizer-only review history or raw media URLs.';

notify pgrst, 'reload schema';

commit;
