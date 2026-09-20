begin;

create index if not exists fantasy_games_show_id_idx
  on public.fantasy_games (show_id);

create index if not exists fantasy_games_created_by_idx
  on public.fantasy_games (created_by);

commit;
