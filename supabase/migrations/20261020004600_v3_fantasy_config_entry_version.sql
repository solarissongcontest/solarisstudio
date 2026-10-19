begin;

select public.v3_register_migration_contract(
  '20261020004600_v3_fantasy_config_entry_version',
  1,
  'forward_fix_only',
  false,
  null,
  'Fantasy config version also advances when roster-market entry rows change through compatibility writers'
);

create or replace function private.v3_bump_fantasy_game_config_from_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
declare
  v_old_game_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.game_id else null end;
  v_new_game_id uuid := case when tg_op in ('UPDATE', 'INSERT') then new.game_id else null end;
begin
  if v_old_game_id is not null then
    update public.fantasy_games game
    set config_version = game.config_version + 1
    where game.id = v_old_game_id;
  end if;

  if v_new_game_id is not null
     and v_new_game_id is distinct from v_old_game_id then
    update public.fantasy_games game
    set config_version = game.config_version + 1
    where game.id = v_new_game_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_fantasy_game_config_from_entry()
  from public, anon, authenticated;

drop trigger if exists v3_bump_fantasy_game_config_from_entry
  on public.fantasy_game_entries;
create trigger v3_bump_fantasy_game_config_from_entry
after insert or update or delete
on public.fantasy_game_entries
for each row
execute function private.v3_bump_fantasy_game_config_from_entry();

-- Make semantic operation fingerprints deterministic even if a caller submits
-- the same set-like entry list in a different array order. Invalid duplicate
-- country entries are still rejected by the mature domain writer.
create or replace function private.v3_normalize_fantasy_config_entries(p_entries jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $normalize$
  select case
    when jsonb_typeof(p_entries) <> 'array' then p_entries
    else coalesce(
      (
        select jsonb_agg(item order by item ->> 'countryId', item::text)
        from jsonb_array_elements(p_entries) item
      ),
      '[]'::jsonb
    )
  end
$normalize$;

revoke all on function private.v3_normalize_fantasy_config_entries(jsonb)
  from public, anon, authenticated;

commit;
