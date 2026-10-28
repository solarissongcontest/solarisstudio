begin;

select public.v3_register_migration_contract(
  'v3.entry.confirmation-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 makes Confirmation-to-Entry projection one scoped canonical Entry command and revokes raw API-role Entry DML'
);

-- S16 Entry authority cutover.
-- Confirmation owns its response/review state, but public.entries is canonical
-- Entry state. The caller supplies only the Confirmation submission identity;
-- scope and content are re-derived inside the authoritative transaction.
create or replace function public.v3_sync_confirmation_entry(
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_submission public.submissions%rowtype;
  v_country_id uuid;
  v_entity_id uuid;
  v_existing public.entries%rowtype;
  v_existing_source_updated_at timestamptz;
  v_entry_id uuid;
  v_source_ref text;
  v_artist text;
  v_song_title text;
  v_song_url text;
  v_national_final_id uuid;
  v_national_final_name text;
  v_official_known boolean := false;
  v_status text;
  v_metadata jsonb;
begin
  if p_submission_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'CONFIRMATION_SUBMISSION_NOT_FOUND';
  end if;

  select country.id
  into v_country_id
  from public.countries country
  where lower(btrim(country.name)) = lower(btrim(v_submission.country))
  order by country.id
  limit 1;

  if v_country_id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'unmatched_country',
      'editionId', v_submission.edition_id
    );
  end if;

  select entity.id
  into v_entity_id
  from public.contest_entities entity
  where entity.edition_id = v_submission.edition_id
    and entity.country_id = v_country_id
  order by entity.id
  limit 1;

  if v_entity_id is null then
    raise exception using errcode = '23503', message = 'ENTRY_CONTEST_ENTITY_MISSING';
  end if;

  select entry.*
  into v_existing
  from public.entries entry
  where entry.edition_id = v_submission.edition_id
    and entry.country_id = v_country_id
  for update;

  if found and v_existing.source <> 'confirmations' then
    return jsonb_build_object(
      'ok', false,
      'status', 'canonical_owned',
      'editionId', v_submission.edition_id,
      'countryId', v_country_id,
      'entryId', v_existing.id
    );
  end if;

  -- Compare source revisions, not the projection row's own updated_at. A retry
  -- of the same submission must remain idempotent after the first sync updates
  -- the projection timestamp.
  if v_existing.id is not null then
    begin
      v_existing_source_updated_at := nullif(
        v_existing.metadata ->> 'confirmation_submission_updated_at',
        ''
      )::timestamptz;
    exception when others then
      v_existing_source_updated_at := null;
    end;

    if coalesce(v_existing_source_updated_at, v_existing.updated_at) > v_submission.updated_at then
      return jsonb_build_object(
        'ok', false,
        'status', 'canonical_newer',
        'editionId', v_submission.edition_id,
        'countryId', v_country_id,
        'entryId', v_existing.id
      );
    end if;
  end if;

  v_status := case when v_submission.participating then 'confirmed' else 'withdrawn' end;

  if lower(coalesce(v_submission.selection_method, '')) = 'internal' then
    select
      entry.id::text,
      nullif(btrim(entry.artist), ''),
      nullif(btrim(entry.song_title), ''),
      nullif(btrim(entry.song_url), '')
    into v_source_ref, v_artist, v_song_title, v_song_url
    from public.internal_entries entry
    where entry.submission_id = v_submission.id
      and entry.review_status = 'accepted'
      and nullif(btrim(entry.artist), '') is not null
      and nullif(btrim(entry.song_title), '') is not null
    order by entry.id
    limit 1;

    v_official_known := v_source_ref is not null;
  elsif lower(coalesce(v_submission.selection_method, '')) = 'national_final' then
    select final.id, final.nf_name
    into v_national_final_id, v_national_final_name
    from public.national_finals final
    where final.submission_id = v_submission.id
    order by final.id
    limit 1;

    if v_national_final_id is not null then
      select
        candidate.id::text,
        nullif(btrim(candidate.artist), ''),
        nullif(btrim(candidate.song_title), ''),
        nullif(btrim(candidate.song_url), '')
      into v_source_ref, v_artist, v_song_title, v_song_url
      from public.national_final_entries candidate
      join public.national_finals final on final.id = candidate.national_final_id
      where final.id = v_national_final_id
        and final.winning_entry_id = candidate.id
        and candidate.review_status = 'accepted'
        and not coalesce(candidate.removed, false)
        and nullif(btrim(candidate.artist), '') is not null
        and nullif(btrim(candidate.song_title), '') is not null
      limit 1;

      v_official_known := v_source_ref is not null;
    end if;
  end if;

  if v_official_known then
    v_metadata := jsonb_build_object(
      'confirmation_submission_id', v_submission.id,
      'confirmation_edition_id', v_submission.edition_id,
      'confirmation_submission_updated_at', v_submission.updated_at,
      'national_final_id', v_national_final_id,
      'national_final_name', v_national_final_name,
      'reveal_date_type', v_submission.reveal_date_type,
      'reveal_exact_date', v_submission.reveal_exact_date,
      'nf_result_date_type', v_submission.nf_result_date_type,
      'nf_result_exact_date', v_submission.nf_result_exact_date
    );
  else
    v_source_ref := v_submission.id::text;
    v_artist := null;
    v_song_title := null;
    v_song_url := null;
    if v_submission.participating then
      v_status := 'pending';
    end if;
    v_metadata := jsonb_build_object(
      'confirmation_submission_id', v_submission.id,
      'confirmation_edition_id', v_submission.edition_id,
      'confirmation_submission_updated_at', v_submission.updated_at,
      'awaiting_official_entry', true,
      'reveal_date_type', v_submission.reveal_date_type,
      'reveal_exact_date', v_submission.reveal_exact_date,
      'nf_result_date_type', v_submission.nf_result_date_type,
      'nf_result_exact_date', v_submission.nf_result_exact_date
    );
  end if;

  insert into public.entries (
    edition_id,
    country_id,
    contest_entity_id,
    artist,
    song_title,
    song_url,
    status,
    selection_method,
    source,
    source_ref,
    metadata,
    updated_at
  )
  values (
    v_submission.edition_id,
    v_country_id,
    v_entity_id,
    v_artist,
    v_song_title,
    v_song_url,
    v_status,
    nullif(btrim(v_submission.selection_method), ''),
    'confirmations',
    v_source_ref,
    v_metadata,
    now()
  )
  on conflict (edition_id, country_id) do update
  set contest_entity_id = excluded.contest_entity_id,
      artist = excluded.artist,
      song_title = excluded.song_title,
      song_url = excluded.song_url,
      status = excluded.status,
      selection_method = excluded.selection_method,
      source = excluded.source,
      source_ref = excluded.source_ref,
      metadata = excluded.metadata,
      updated_at = now()
  where public.entries.source = 'confirmations'
  returning id into v_entry_id;

  if v_entry_id is null then
    select entry.id
    into v_entry_id
    from public.entries entry
    where entry.edition_id = v_submission.edition_id
      and entry.country_id = v_country_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'synced',
    'editionId', v_submission.edition_id,
    'countryId', v_country_id,
    'entryId', v_entry_id,
    'officialEntryKnown', v_official_known,
    'sourceRef', v_source_ref,
    'artist', v_artist,
    'songTitle', v_song_title
  );
end
$function$;

revoke all on function public.v3_sync_confirmation_entry(uuid)
  from public, anon, authenticated;
grant execute on function public.v3_sync_confirmation_entry(uuid)
  to service_role;

comment on function public.v3_sync_confirmation_entry(uuid) is
  'Canonical S16 Entry projection command for Confirmation-owned submissions. Derives Entry scope and content server-side; service_role cannot supply arbitrary Entry payloads.';

revoke insert, update, delete on table public.entries
  from anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
