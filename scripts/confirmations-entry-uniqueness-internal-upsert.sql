-- Applied to the dedicated Confirmations Supabase project.
--
-- BEFORE INSERT triggers run before ON CONFLICT resolution. internal_entries has
-- UNIQUE (submission_id), so an upsert for an existing submission receives a new
-- temporary UUID and the old duplicate check mistakes that submission's own row
-- for a second song. Exclude the current submission for internal-entry checks;
-- cross-submission and cross-table duplicate protection remains unchanged.

create or replace function public.enforce_entry_uniqueness()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  current_submission_id uuid;
  current_edition_id uuid;
  normalized_artist text;
  normalized_song text;
  normalized_url text;
  duplicate_found boolean;
begin
  if TG_TABLE_NAME = 'internal_entries' then
    select s.id, s.edition_id
      into current_submission_id, current_edition_id
    from public.submissions s
    where s.id = NEW.submission_id;
  elsif TG_TABLE_NAME = 'national_final_entries' then
    select s.id, s.edition_id
      into current_submission_id, current_edition_id
    from public.national_finals nf
    join public.submissions s on s.id = nf.submission_id
    where nf.id = NEW.national_final_id;
  else
    raise exception 'Unsupported entry table';
  end if;

  if current_submission_id is null or current_edition_id is null then
    raise exception 'Entry submission could not be resolved';
  end if;

  normalized_artist := public.normalize_entry_text(NEW.artist);
  normalized_song := public.normalize_entry_text(NEW.song_title);
  normalized_url := lower(trim(coalesce(NEW.song_url, '')));

  if normalized_artist <> '' and normalized_song <> '' then
    perform pg_advisory_xact_lock(hashtextextended('ssc-song:' || normalized_artist || ':' || normalized_song, 0));
  end if;
  if normalized_url <> '' then
    perform pg_advisory_xact_lock(hashtextextended('ssc-url:' || normalized_url, 0));
  end if;
  if normalized_artist <> '' then
    perform pg_advisory_xact_lock(hashtextextended('ssc-artist-edition:' || current_edition_id::text || ':' || normalized_artist, 0));
  end if;

  duplicate_found := false;
  if normalized_artist <> '' and normalized_song <> '' then
    select exists (
      select 1
      from public.internal_entries i
      where public.normalize_entry_text(i.artist) = normalized_artist
        and public.normalize_entry_text(i.song_title) = normalized_song
        and not (
          TG_TABLE_NAME = 'internal_entries'
          and i.submission_id = current_submission_id
        )
    ) into duplicate_found;
  end if;
  if not duplicate_found and normalized_url <> '' then
    select exists (
      select 1
      from public.internal_entries i
      where lower(trim(coalesce(i.song_url, ''))) = normalized_url
        and not (
          TG_TABLE_NAME = 'internal_entries'
          and i.submission_id = current_submission_id
        )
    ) into duplicate_found;
  end if;
  if duplicate_found then raise exception 'duplicate_song'; end if;

  duplicate_found := false;
  if normalized_artist <> '' and normalized_song <> '' then
    select exists (
      select 1
      from public.national_final_entries e
      where public.normalize_entry_text(e.artist) = normalized_artist
        and public.normalize_entry_text(e.song_title) = normalized_song
        and not (TG_TABLE_NAME = 'national_final_entries' and e.id = NEW.id)
    ) into duplicate_found;
  end if;
  if not duplicate_found and normalized_url <> '' then
    select exists (
      select 1
      from public.national_final_entries e
      where lower(trim(coalesce(e.song_url, ''))) = normalized_url
        and not (TG_TABLE_NAME = 'national_final_entries' and e.id = NEW.id)
    ) into duplicate_found;
  end if;
  if duplicate_found then raise exception 'duplicate_song'; end if;

  if normalized_artist <> '' then
    select exists (
      select 1
      from public.internal_entries i
      join public.submissions s on s.id = i.submission_id
      where s.edition_id = current_edition_id
        and s.id <> current_submission_id
        and public.normalize_entry_text(i.artist) = normalized_artist
    ) into duplicate_found;
    if duplicate_found then raise exception 'duplicate_artist'; end if;

    select exists (
      select 1
      from public.national_final_entries e
      join public.national_finals nf on nf.id = e.national_final_id
      join public.submissions s on s.id = nf.submission_id
      where s.edition_id = current_edition_id
        and s.id <> current_submission_id
        and public.normalize_entry_text(e.artist) = normalized_artist
    ) into duplicate_found;
    if duplicate_found then raise exception 'duplicate_artist'; end if;
  end if;

  return NEW;
end;
$$;
