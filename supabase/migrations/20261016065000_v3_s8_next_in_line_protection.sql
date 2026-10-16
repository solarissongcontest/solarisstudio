begin;

-- System V3 S8: harden the existing public Next in Line authority without
-- creating a competing submission path. The browser contract already has
-- explicit field ceilings; enforce those same ceilings server-side, reject
-- unknown payload keys, guarantee one canonical row per edition/source, and
-- make identical retries true no-op replays.

create unique index if not exists next_in_line_submissions_edition_source_v3_uidx
  on public.next_in_line_submissions (edition_id, source_submission_id);

alter table public.next_in_line_submissions
  add constraint next_in_line_submissions_country_length_v3_check
    check (length(country) between 1 and 80) not valid,
  add constraint next_in_line_submissions_artist_length_v3_check
    check (artist is null or length(artist) <= 160) not valid,
  add constraint next_in_line_submissions_song_length_v3_check
    check (song_title is null or length(song_title) <= 160) not valid,
  add constraint next_in_line_submissions_url_length_v3_check
    check (song_url is null or length(song_url) <= 500) not valid,
  add constraint next_in_line_submissions_preview_start_length_v3_check
    check (preview_start is null or length(preview_start) <= 10) not valid,
  add constraint next_in_line_submissions_preview_end_length_v3_check
    check (preview_end is null or length(preview_end) <= 10) not valid;

alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_country_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_artist_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_song_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_url_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_preview_start_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_preview_end_length_v3_check;

create or replace function public.submit_next_in_line(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $submit$
declare
  v_edition_id uuid;
  v_source_submission_id uuid;
  v_country text;
  v_selection_type text;
  v_nf_entry_id uuid;
  v_artist text;
  v_song text;
  v_url text;
  v_preview_start text;
  v_preview_end text;
  v_source public.submissions;
  v_country_row public.countries;
  v_nf_entry public.national_final_entries;
  v_existing public.next_in_line_submissions;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid Next in Line payload' using errcode = '22023';
  end if;

  if payload - array[
    'edition_id',
    'source_submission_id',
    'country',
    'participating',
    'entry_unknown',
    'selection_type',
    'national_final_entry_id',
    'artist',
    'song_title',
    'song_url',
    'preview_start',
    'preview_end'
  ]::text[] <> '{}'::jsonb then
    raise exception 'Next in Line payload contains unsupported fields'
      using errcode = '22023';
  end if;

  begin
    v_edition_id := nullif(payload ->> 'edition_id', '')::uuid;
    v_source_submission_id := nullif(payload ->> 'source_submission_id', '')::uuid;
    v_nf_entry_id := nullif(payload ->> 'national_final_entry_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid Next in Line identifiers' using errcode = '22023';
  end;

  v_country := btrim(coalesce(payload ->> 'country', ''));
  v_selection_type := lower(btrim(coalesce(payload ->> 'selection_type', '')));
  v_artist := nullif(btrim(coalesce(payload ->> 'artist', '')), '');
  v_song := nullif(btrim(coalesce(payload ->> 'song_title', '')), '');
  v_url := nullif(btrim(coalesce(payload ->> 'song_url', '')), '');
  v_preview_start := nullif(btrim(coalesce(payload ->> 'preview_start', '')), '');
  v_preview_end := nullif(btrim(coalesce(payload ->> 'preview_end', '')), '');

  if v_edition_id is null or v_source_submission_id is null or v_country = '' then
    raise exception 'Next in Line edition, source submission and country are required'
      using errcode = '22023';
  end if;
  if length(v_country) > 80
     or (v_artist is not null and length(v_artist) > 160)
     or (v_song is not null and length(v_song) > 160)
     or (v_url is not null and length(v_url) > 500)
     or (v_preview_start is not null and length(v_preview_start) > 10)
     or (v_preview_end is not null and length(v_preview_end) > 10) then
    raise exception 'Next in Line payload exceeds supported field limits'
      using errcode = '22023';
  end if;
  if not private.studio2_next_in_line_window_is_open(v_edition_id) then
    raise exception 'Next in Line is closed' using errcode = '22023';
  end if;
  if v_preview_start is null or v_preview_end is null then
    raise exception 'preview_required' using errcode = '22023';
  end if;

  -- Serialize all submissions for one canonical source. The unique index below
  -- is the database backstop; the advisory lock lets the existing read/validate/
  -- upsert sequence remain deterministic under concurrent retries.
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-next-in-line:' || v_source_submission_id::text, 0)
  );

  select *
  into v_source
  from public.submissions submission
  where submission.id = v_source_submission_id
    and submission.edition_id = v_edition_id
    and lower(btrim(submission.country)) = lower(btrim(v_country))
  for update;

  if v_source.id is null
     or not private.studio2_next_in_line_source_eligible(v_source.id) then
    raise exception 'Next in Line source is not eligible' using errcode = '42501';
  end if;

  select country_row.*
  into v_country_row
  from public.countries country_row
  where lower(btrim(v_source.country)) in (
    lower(btrim(country_row.name)),
    lower(btrim(country_row.short_code))
  )
  limit 1;

  if v_country_row.id is null then
    raise exception 'Country identity could not be resolved' using errcode = '22023';
  end if;

  if v_selection_type = 'national_final' then
    select entry.*
    into v_nf_entry
    from public.national_finals nf
    join public.national_final_entries entry
      on entry.national_final_id = nf.id
    where nf.submission_id = v_source.id
      and entry.id = v_nf_entry_id
      and entry.review_status = 'accepted'
      and coalesce(entry.removed, false) = false
      and entry.id is distinct from nf.winning_entry_id;

    if v_nf_entry.id is null then
      raise exception 'invalid_nf_entry' using errcode = '22023';
    end if;

    v_artist := nullif(btrim(v_nf_entry.artist), '');
    v_song := nullif(btrim(v_nf_entry.song_title), '');
    v_url := nullif(btrim(v_nf_entry.song_url), '');
  elsif v_selection_type = 'internal' then
    if v_artist is null or v_song is null then
      raise exception 'Artist and song title are required for an internal-selection alternative'
        using errcode = '22023';
    end if;
    v_nf_entry_id := null;
  else
    raise exception 'Next in Line selection type must be internal or national_final'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception 'duplicate_song' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.country_id <> v_country_row.id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.artist)
          = private.studio2_next_in_line_normalize(v_artist)
  ) then
    raise exception 'duplicate_artist' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.next_in_line_submissions nil
    where nil.edition_id = v_edition_id
      and nil.source_submission_id <> v_source_submission_id
      and nil.participating = true
      and private.studio2_next_in_line_normalize(nil.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception 'duplicate_song' using errcode = '23505';
  end if;

  select nil.*
  into v_existing
  from public.next_in_line_submissions nil
  where nil.edition_id = v_edition_id
    and nil.source_submission_id = v_source_submission_id
  for update;

  -- Network retries of the same semantic submission return the original durable
  -- identity and timestamp without producing another write. A changed request is
  -- still an intentional resubmission while the authoritative window remains open.
  if v_existing.id is not null
     and v_existing.country is not distinct from v_source.country
     and v_existing.participating is true
     and v_existing.entry_unknown is false
     and v_existing.selection_type is not distinct from v_selection_type
     and v_existing.national_final_entry_id is not distinct from v_nf_entry_id
     and v_existing.artist is not distinct from v_artist
     and v_existing.song_title is not distinct from v_song
     and v_existing.song_url is not distinct from v_url
     and v_existing.preview_start is not distinct from v_preview_start
     and v_existing.preview_end is not distinct from v_preview_end then
    return jsonb_build_object(
      'ok', true,
      'submission_id', v_existing.id,
      'edition_id', v_edition_id,
      'source_submission_id', v_source_submission_id,
      'replayed', true,
      'submitted_at', v_existing.submitted_at
    );
  end if;

  if v_existing.id is null then
    insert into public.next_in_line_submissions (
      edition_id,
      source_submission_id,
      country,
      participating,
      entry_unknown,
      selection_type,
      national_final_entry_id,
      artist,
      song_title,
      song_url,
      preview_start,
      preview_end,
      submitted_at
    )
    values (
      v_edition_id,
      v_source_submission_id,
      v_source.country,
      true,
      false,
      v_selection_type,
      v_nf_entry_id,
      v_artist,
      v_song,
      v_url,
      v_preview_start,
      v_preview_end,
      now()
    )
    returning * into v_existing;
  else
    update public.next_in_line_submissions
    set
      country = v_source.country,
      participating = true,
      entry_unknown = false,
      selection_type = v_selection_type,
      national_final_entry_id = v_nf_entry_id,
      artist = v_artist,
      song_title = v_song,
      song_url = v_url,
      preview_start = v_preview_start,
      preview_end = v_preview_end,
      submitted_at = now()
    where id = v_existing.id
    returning * into v_existing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_existing.id,
    'edition_id', v_edition_id,
    'source_submission_id', v_source_submission_id,
    'replayed', false,
    'submitted_at', v_existing.submitted_at
  );
end
$submit$;

revoke all on function public.submit_next_in_line(jsonb) from public;
grant execute on function public.submit_next_in_line(jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
