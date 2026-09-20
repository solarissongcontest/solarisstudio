begin;

drop policy if exists "public reads published fantasy games" on public.fantasy_games;
drop policy if exists "organizers read fantasy games" on public.fantasy_games;

create policy "anon reads published fantasy games"
on public.fantasy_games for select
to anon
using (
  status <> 'cancelled'
  and now() >= opens_at
  and exists (
    select 1
    from public.editions edition
    where edition.id = fantasy_games.edition_id
      and edition.published = true
  )
  and public.show_publication_enabled(show_id, 'participants')
);

create policy "authenticated reads fantasy games"
on public.fantasy_games for select
to authenticated
using (
  (
    status <> 'cancelled'
    and now() >= opens_at
    and exists (
      select 1
      from public.editions edition
      where edition.id = fantasy_games.edition_id
        and edition.published = true
    )
    and public.show_publication_enabled(show_id, 'participants')
  )
  or public.studio2_access_allowed('edition.manage', edition_id, false)
);

drop policy if exists "public reads published fantasy choices" on public.fantasy_game_entries;
drop policy if exists "organizers read fantasy choices" on public.fantasy_game_entries;

create policy "anon reads published fantasy choices"
on public.fantasy_game_entries for select
to anon
using (
  exists (
    select 1
    from public.fantasy_games game
    where game.id = fantasy_game_entries.game_id
      and game.status <> 'cancelled'
      and now() >= game.opens_at
      and public.show_publication_enabled(game.show_id, 'participants')
      and exists (
        select 1
        from public.editions edition
        where edition.id = game.edition_id
          and edition.published = true
      )
  )
);

create policy "authenticated reads fantasy choices"
on public.fantasy_game_entries for select
to authenticated
using (
  exists (
    select 1
    from public.fantasy_games game
    where game.id = fantasy_game_entries.game_id
      and (
        (
          game.status <> 'cancelled'
          and now() >= game.opens_at
          and public.show_publication_enabled(game.show_id, 'participants')
          and exists (
            select 1
            from public.editions edition
            where edition.id = game.edition_id
              and edition.published = true
          )
        )
        or public.studio2_access_allowed('edition.manage', game.edition_id, false)
      )
  )
);

commit;
