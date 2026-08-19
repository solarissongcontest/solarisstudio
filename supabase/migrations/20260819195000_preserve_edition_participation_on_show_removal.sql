create or replace function public.preserve_edition_participation_before_show_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A show line-up row is only a stage assignment. Removing it must not erase
  -- the country's edition-level participation. If no canonical edition row
  -- exists yet, preserve one before allowing the show-specific row to be deleted.
  if old.show_id is not null
     and old.country_id is not null
     and not exists (
       select 1
       from public.participants p
       where p.edition_id = old.edition_id
         and p.country_id = old.country_id
         and p.show_id is null
     ) then
    insert into public.participants (
      edition_id,
      country_id,
      artist,
      song,
      running_order,
      semi_final,
      show_id,
      qualified,
      notes,
      contest_entity_id,
      participation_status
    ) values (
      old.edition_id,
      old.country_id,
      old.artist,
      old.song,
      null,
      'final',
      null,
      null,
      coalesce(old.notes, 'Preserved when removed from show line-up'),
      old.contest_entity_id,
      old.participation_status
    )
    on conflict do nothing;
  end if;

  return old;
end;
$$;

drop trigger if exists participants_preserve_edition_participation on public.participants;
create trigger participants_preserve_edition_participation
before delete on public.participants
for each row
execute function public.preserve_edition_participation_before_show_delete();
