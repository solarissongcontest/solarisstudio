begin;

-- Historical editions are archive data, not future reveals. A later My Solaris
-- edit can create a fresh canonical participant row, so the one-time legacy
-- backfill is not enough: keep any populated entry from an older edition public
-- whenever it is inserted or edited. The newest edition keeps normal draft /
-- scheduled reveal controls.
create or replace function public.keep_historical_entry_public()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_edition_number integer;
  v_newest_edition_number integer;
begin
  select e.edition_number
    into v_edition_number
  from public.editions e
  where e.id = new.edition_id;

  select max(e.edition_number)
    into v_newest_edition_number
  from public.editions e
  where e.edition_number is not null;

  if v_edition_number is not null
     and v_newest_edition_number is not null
     and v_edition_number < v_newest_edition_number
     and new.publication_status = 'draft'
     and new.scheduled_publish_at is null
     and (
       nullif(trim(new.artist), '') is not null
       or nullif(trim(new.song), '') is not null
       or nullif(trim(new.youtube_url), '') is not null
       or nullif(trim(new.spotify_url), '') is not null
       or nullif(trim(new.apple_music_url), '') is not null
     ) then
    new.publication_status := 'published';
    new.published_at := coalesce(new.published_at, new.updated_at, new.created_at, now());
    new.publication_source := coalesce(new.publication_source, 'legacy');
  end if;

  return new;
end;
$$;

drop trigger if exists participants_keep_historical_entry_public on public.participants;
create trigger participants_keep_historical_entry_public
before insert or update of
  publication_status,
  scheduled_publish_at,
  artist,
  song,
  youtube_url,
  spotify_url,
  apple_music_url
on public.participants
for each row
execute function public.keep_historical_entry_public();

-- Repair historical rows that were created after the previous one-time legacy
-- backfill. Do not touch the newest edition, scheduled entries, or blank rows.
with newest as (
  select max(edition_number) as edition_number
  from public.editions
  where edition_number is not null
)
update public.participants p
set publication_status = 'published',
    published_at = coalesce(p.published_at, p.updated_at, p.created_at, now()),
    publication_source = coalesce(p.publication_source, 'legacy'),
    updated_at = now()
from public.editions e, newest n
where e.id = p.edition_id
  and e.edition_number < n.edition_number
  and p.publication_status = 'draft'
  and p.scheduled_publish_at is null
  and (
    nullif(trim(p.artist), '') is not null
    or nullif(trim(p.song), '') is not null
    or nullif(trim(p.youtube_url), '') is not null
    or nullif(trim(p.spotify_url), '') is not null
    or nullif(trim(p.apple_music_url), '') is not null
  );

commit;
