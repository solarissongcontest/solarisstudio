create or replace function public.normalize_show_publication_channels()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jury_enabled boolean := true;
  televote_enabled boolean := true;
  jury_weight numeric := 50;
  televote_weight numeric := 50;
begin
  if new.voting_config is not null then
    jury_enabled := coalesce((new.voting_config ->> 'juryEnabled')::boolean, true);
    televote_enabled := coalesce((new.voting_config ->> 'televoteEnabled')::boolean, true);
    jury_weight := coalesce((new.voting_config -> 'weighting' ->> 'jury')::numeric, 50);
    televote_weight := coalesce((new.voting_config -> 'weighting' ->> 'televote')::numeric, 50);
  end if;

  if new.publication_config is not null then
    if not jury_enabled or jury_weight <= 0 then
      new.publication_config := jsonb_set(new.publication_config, '{jury_results}', 'false'::jsonb, true);
    end if;

    if not televote_enabled or televote_weight <= 0 then
      new.publication_config := jsonb_set(new.publication_config, '{televote_results}', 'false'::jsonb, true);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_show_publication_channels_trigger on public.shows;
create trigger normalize_show_publication_channels_trigger
before insert or update of voting_config, publication_config on public.shows
for each row
execute function public.normalize_show_publication_channels();

update public.shows
set publication_config = case
  when publication_config is null then null
  else jsonb_set(
    jsonb_set(
      publication_config,
      '{jury_results}',
      to_jsonb(not (
        coalesce((voting_config ->> 'juryEnabled')::boolean, true) = false
        or coalesce((voting_config -> 'weighting' ->> 'jury')::numeric, 50) <= 0
      ) and coalesce((publication_config ->> 'jury_results')::boolean, false)),
      true
    ),
    '{televote_results}',
    to_jsonb(not (
      coalesce((voting_config ->> 'televoteEnabled')::boolean, true) = false
      or coalesce((voting_config -> 'weighting' ->> 'televote')::numeric, 50) <= 0
    ) and coalesce((publication_config ->> 'televote_results')::boolean, false)),
    true
  )
end
where publication_config is not null;
