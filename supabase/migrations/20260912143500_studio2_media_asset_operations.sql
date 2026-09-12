begin;

-- Phase 9 keeps canonical media in the systems that already own it. This table
-- records organizer review decisions only; it is deliberately not a second
-- asset/upload store.
create table if not exists public.studio2_media_asset_reviews (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  asset_key text not null check (length(btrim(asset_key)) between 3 and 220),
  asset_type text not null check (asset_type in (
    'logo', 'flag', 'artist_photo', 'cover_artwork', 'audio_master',
    'performance_video', 'postcard', 'press_image', 'broadcast_graphic'
  )),
  country_id uuid references public.countries(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete cascade,
  source_fingerprint text not null check (length(btrim(source_fingerprint)) >= 1),
  decision text not null check (decision in ('approved', 'invalid')),
  reason text not null check (length(btrim(reason)) >= 5),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  superseded_at timestamptz
);

create index if not exists studio2_media_asset_reviews_edition_idx
  on public.studio2_media_asset_reviews (edition_id, reviewed_at desc);
create index if not exists studio2_media_asset_reviews_asset_idx
  on public.studio2_media_asset_reviews (edition_id, asset_key, reviewed_at desc);
create unique index if not exists studio2_media_asset_reviews_active_idx
  on public.studio2_media_asset_reviews (edition_id, asset_key)
  where superseded_at is null;

alter table public.studio2_media_asset_reviews enable row level security;
revoke all on table public.studio2_media_asset_reviews from public, anon, authenticated;

create or replace function private.studio2_can_manage_media_assets(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'entry.approve', p_edition_id), false);
$$;

revoke all on function private.studio2_can_manage_media_assets(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_can_manage_media_assets(uuid, uuid)
  to service_role;

create or replace function private.studio2_resolve_media_asset_source(
  p_edition_id uuid,
  p_asset_key text,
  p_asset_type text,
  p_country_id uuid,
  p_entry_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_source text;
  v_metadata jsonb := '{}'::jsonb;
  v_entry_country_id uuid;
begin
  if p_edition_id is null or nullif(btrim(p_asset_key), '') is null then
    raise exception 'Edition and media asset key are required' using errcode = '22023';
  end if;

  if p_asset_type not in (
    'logo', 'flag', 'artist_photo', 'cover_artwork', 'audio_master',
    'performance_video', 'postcard', 'press_image', 'broadcast_graphic'
  ) then
    raise exception 'Unsupported media asset type: %', p_asset_type using errcode = '22023';
  end if;

  if p_asset_type = 'logo' then
    if p_asset_key <> 'edition:' || p_edition_id::text || ':logo'
       or p_country_id is not null
       or p_entry_id is not null then
      raise exception 'Edition logo asset identity is invalid' using errcode = '22023';
    end if;

    select nullif(btrim(e.logo), '')
      into v_source
    from public.editions e
    where e.id = p_edition_id;

    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;
    return v_source;
  end if;

  if p_country_id is null then
    raise exception 'Country-scoped media requires a country id' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.edition_id = p_edition_id and p.country_id = p_country_id
    union all
    select 1 from public.entries e
    where e.edition_id = p_edition_id and e.country_id = p_country_id
  ) then
    raise exception 'Country does not participate in this edition' using errcode = '22023';
  end if;

  if p_asset_type = 'flag' then
    if p_asset_key <> 'country:' || p_country_id::text || ':flag'
       or p_entry_id is not null then
      raise exception 'Country flag asset identity is invalid' using errcode = '22023';
    end if;

    select nullif(btrim(c.flag_image), '')
      into v_source
    from public.countries c
    where c.id = p_country_id;

    if not found then
      raise exception 'Country not found: %', p_country_id using errcode = 'P0002';
    end if;
    return v_source;
  end if;

  if p_entry_id is null then
    raise exception 'Entry media requires an entry id' using errcode = '22023';
  end if;

  select e.country_id, coalesce(e.metadata, '{}'::jsonb), nullif(btrim(e.song_url), '')
    into v_entry_country_id, v_metadata, v_source
  from public.entries e
  where e.id = p_entry_id
    and e.edition_id = p_edition_id;

  if not found then
    raise exception 'Entry not found in this edition: %', p_entry_id using errcode = 'P0002';
  end if;
  if v_entry_country_id is distinct from p_country_id then
    raise exception 'Entry does not belong to the selected country' using errcode = '22023';
  end if;
  if p_asset_key <> 'entry:' || p_entry_id::text || ':' || p_asset_type then
    raise exception 'Entry media asset identity is invalid' using errcode = '22023';
  end if;

  if p_asset_type = 'performance_video' then
    return v_source;
  elsif p_asset_type = 'artist_photo' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'artist_photo_url'), ''),
      nullif(btrim(v_metadata ->> 'artistPhotoUrl'), ''),
      nullif(btrim(v_metadata ->> 'artist_image_url'), ''),
      nullif(btrim(v_metadata ->> 'artistImageUrl'), '')
    );
  elsif p_asset_type = 'cover_artwork' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'cover_artwork_url'), ''),
      nullif(btrim(v_metadata ->> 'coverArtworkUrl'), ''),
      nullif(btrim(v_metadata ->> 'artwork_url'), ''),
      nullif(btrim(v_metadata ->> 'artworkUrl'), '')
    );
  elsif p_asset_type = 'audio_master' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'audio_master_url'), ''),
      nullif(btrim(v_metadata ->> 'audioMasterUrl'), ''),
      nullif(btrim(v_metadata ->> 'audio_url'), ''),
      nullif(btrim(v_metadata ->> 'audioUrl'), '')
    );
  elsif p_asset_type = 'postcard' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'postcard_url'), ''),
      nullif(btrim(v_metadata ->> 'postcardUrl'), '')
    );
  elsif p_asset_type = 'press_image' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'press_image_url'), ''),
      nullif(btrim(v_metadata ->> 'pressImageUrl'), '')
    );
  elsif p_asset_type = 'broadcast_graphic' then
    return coalesce(
      nullif(btrim(v_metadata ->> 'broadcast_graphic_url'), ''),
      nullif(btrim(v_metadata ->> 'broadcastGraphicUrl'), '')
    );
  end if;

  return null;
end
$$;

revoke all on function private.studio2_resolve_media_asset_source(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_resolve_media_asset_source(uuid, text, text, uuid, uuid)
  to service_role;

create or replace function public.studio2_media_asset_reviews(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if not v_is_service and not private.studio2_can_manage_media_assets(v_actor, p_edition_id) then
    raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'editionId', r.edition_id,
        'assetKey', r.asset_key,
        'assetType', r.asset_type,
        'countryId', r.country_id,
        'entryId', r.entry_id,
        'sourceFingerprint', r.source_fingerprint,
        'decision', r.decision,
        'reason', r.reason,
        'reviewedBy', coalesce(r.reviewed_by::text, 'service_role'),
        'reviewedByName', null,
        'reviewedAt', r.reviewed_at,
        'supersededAt', r.superseded_at
      ) order by r.reviewed_at desc
    ),
    '[]'::jsonb
  ) into v_rows
  from public.studio2_media_asset_reviews r
  where r.edition_id = p_edition_id;

  return v_rows;
end
$$;

revoke all on function public.studio2_media_asset_reviews(uuid) from public, anon;
grant execute on function public.studio2_media_asset_reviews(uuid) to authenticated, service_role;

create or replace function public.studio2_review_media_assets(
  p_edition_id uuid,
  p_reviews jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_reason text := btrim(coalesce(p_reason, ''));
  v_item jsonb;
  v_asset_key text;
  v_asset_type text;
  v_country_id uuid;
  v_entry_id uuid;
  v_expected_source text;
  v_decision text;
  v_current_source text;
  v_review public.studio2_media_asset_reviews%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A media review reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_reviews) <> 'array' then
    raise exception 'Media reviews must be a JSON array' using errcode = '22023';
  end if;

  select jsonb_array_length(p_reviews) into v_count;
  if v_count < 1 or v_count > 100 then
    raise exception 'Review between 1 and 100 media assets per operation' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct item ->> 'assetKey')
    from jsonb_array_elements(p_reviews) item
  ) then
    raise exception 'A media asset may appear only once in a review operation' using errcode = '22023';
  end if;

  if not v_is_service and not private.studio2_can_manage_media_assets(v_actor, p_edition_id) then
    raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
  end if;

  -- Serialize review batches per edition so two operators cannot both approve
  -- stale content at the same time. The canonical source is re-read below.
  perform pg_advisory_xact_lock(hashtextextended('studio2-media:' || p_edition_id::text, 0));

  for v_item in select value from jsonb_array_elements(p_reviews)
  loop
    v_asset_key := btrim(coalesce(v_item ->> 'assetKey', ''));
    v_asset_type := btrim(coalesce(v_item ->> 'assetType', ''));
    v_country_id := nullif(v_item ->> 'countryId', '')::uuid;
    v_entry_id := nullif(v_item ->> 'entryId', '')::uuid;
    v_expected_source := btrim(coalesce(v_item ->> 'sourceFingerprint', ''));
    v_decision := btrim(coalesce(v_item ->> 'decision', ''));

    if v_asset_key = '' or v_expected_source = '' then
      raise exception 'Media asset key and source fingerprint are required' using errcode = '22023';
    end if;
    if v_decision not in ('approved', 'invalid') then
      raise exception 'Media review decision must be approved or invalid' using errcode = '22023';
    end if;

    v_current_source := private.studio2_resolve_media_asset_source(
      p_edition_id,
      v_asset_key,
      v_asset_type,
      v_country_id,
      v_entry_id
    );

    if v_current_source is null then
      raise exception 'The canonical media source is missing; it cannot be reviewed' using errcode = '55000';
    end if;
    if btrim(v_current_source) <> v_expected_source then
      raise exception 'Media asset changed since it was loaded. Refresh before reviewing.' using errcode = '40001';
    end if;

    update public.studio2_media_asset_reviews
    set superseded_at = now()
    where edition_id = p_edition_id
      and asset_key = v_asset_key
      and superseded_at is null;

    insert into public.studio2_media_asset_reviews (
      edition_id,
      asset_key,
      asset_type,
      country_id,
      entry_id,
      source_fingerprint,
      decision,
      reason,
      reviewed_by
    ) values (
      p_edition_id,
      v_asset_key,
      v_asset_type,
      v_country_id,
      v_entry_id,
      v_expected_source,
      v_decision,
      v_reason,
      v_actor
    ) returning * into v_review;

    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      p_edition_id,
      'rule.changed',
      v_actor,
      'media_asset',
      v_asset_key,
      jsonb_build_object(
        'changeKind', 'media.asset_reviewed',
        'assetType', v_asset_type,
        'countryId', v_country_id,
        'entryId', v_entry_id,
        'decision', v_decision,
        'reason', v_reason,
        'sourceFingerprint', v_expected_source
      )
    );

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_review.id,
      'editionId', v_review.edition_id,
      'assetKey', v_review.asset_key,
      'assetType', v_review.asset_type,
      'countryId', v_review.country_id,
      'entryId', v_review.entry_id,
      'sourceFingerprint', v_review.source_fingerprint,
      'decision', v_review.decision,
      'reason', v_review.reason,
      'reviewedBy', coalesce(v_review.reviewed_by::text, 'service_role'),
      'reviewedByName', null,
      'reviewedAt', v_review.reviewed_at,
      'supersededAt', v_review.superseded_at
    ));
  end loop;

  return v_result;
end
$$;

revoke all on function public.studio2_review_media_assets(uuid, jsonb, text) from public, anon;
grant execute on function public.studio2_review_media_assets(uuid, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
