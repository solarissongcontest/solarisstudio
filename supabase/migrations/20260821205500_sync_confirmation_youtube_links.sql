begin;

create or replace function public.sync_confirmation_entry_youtube_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'confirmations'
     and new.country_id is not null
     and new.edition_id is not null
     and new.song_url is not null
     and (
       new.song_url ~* '^https://((www|music)\.)?youtube\.com/'
       or new.song_url ~* '^https://youtu\.be/'
     ) then
    update public.participants p
    set youtube_url = new.song_url
    where p.edition_id = new.edition_id
      and p.country_id = new.country_id
      and p.youtube_url is distinct from new.song_url;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_confirmation_entry_youtube_link() from public, anon, authenticated;

drop trigger if exists entries_sync_confirmation_youtube on public.entries;
create trigger entries_sync_confirmation_youtube
after insert or update of song_url, source, country_id, edition_id on public.entries
for each row
execute function public.sync_confirmation_entry_youtube_link();

-- Existing confirmation imports predate the dedicated listening-link fields.
-- Backfill only genuine YouTube links; generic/non-YouTube song URLs remain in entries.song_url.
update public.participants p
set youtube_url = e.song_url
from public.entries e
where e.edition_id = p.edition_id
  and e.country_id = p.country_id
  and e.source = 'confirmations'
  and e.song_url is not null
  and (
    e.song_url ~* '^https://((www|music)\.)?youtube\.com/'
    or e.song_url ~* '^https://youtu\.be/'
  )
  and p.youtube_url is distinct from e.song_url;

notify pgrst, 'reload schema';
commit;
