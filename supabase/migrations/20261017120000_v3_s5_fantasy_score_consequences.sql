begin;

-- System V3 S5: canonical Fantasy scoring boundary.
-- Preserve the established Fantasy scoring formula while making repeated score
-- operations revisioned, idempotent and transactionally event-backed.

create table if not exists public.studio2_fantasy_score_versions (
  game_id uuid primary key references public.fantasy_games(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_fantasy_score_versions (game_id, version, updated_at)
select
  game.id,
  case
    when game.status = 'scored'
      or exists (
        select 1
        from public.fantasy_teams team
        where team.game_id = game.id
          and (team.state = 'scored' or team.score is not null)
      )
      then 1
    else 0
  end,
  now()
from public.fantasy_games game
on conflict (game_id) do nothing;

alter table public.studio2_fantasy_score_versions enable row level security;
revoke all on table public.studio2_fantasy_score_versions from public, anon, authenticated;
grant all on table public.studio2_fantasy_score_versions to service_role;

create or replace function public.studio2_fantasy_score_preview(
  p_game_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_game public.fantasy_games%rowtype;
  v_version bigint := 0;
begin
  if p_game_id is null then
    raise exception 'Fantasy game is required' using errcode = '22023';
  end if;

  select * into v_game from public.fantasy_games where id = p_game_id;
  if v_game.id is null then
    raise exception 'Fantasy game not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception 'Missing Solaris results capability' using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_fantasy_score_versions version_row
    where version_row.game_id = p_game_id
  ), 0)
  into v_version;

  return jsonb_build_object(
    'gameId', v_game.id,
    'editionId', v_game.edition_id,
    'showId', v_game.show_id,
    'status', v_game.status,
    'scoringVersion', v_game.scoring_version,
    'scoreRevision', v_version,
    'locksAt', v_game.locks_at
  );
end
$preview$;

create or replace function public.studio2_score_fantasy_game(
  p_game_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_score_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $score$
declare
  v_game public.fantasy_games%rowtype;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_current_revision bigint := 0;
  v_next_revision bigint := 0;
  v_scored_count integer := 0;
  v_result jsonb;
begin
  if p_game_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_score_revision is null
     or p_expected_score_revision < 0 then
    raise exception 'Fantasy score operation parameters are incomplete' using errcode = '22023';
  end if;

  select * into v_game from public.fantasy_games where id = p_game_id;
  if v_game.id is null then
    raise exception 'Fantasy game not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception 'Missing Solaris results capability' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'fantasy.score',
    'R2',
    jsonb_build_object(
      'gameId', p_game_id,
      'editionId', v_game.edition_id,
      'showId', v_game.show_id
    ),
    jsonb_build_object('expectedScoreRevision', p_expected_score_revision)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('studio2-fantasy-score:' || p_game_id::text, 0));

  select * into v_game
  from public.fantasy_games
  where id = p_game_id
  for update;

  insert into public.studio2_fantasy_score_versions (game_id, version, updated_at)
  values (
    p_game_id,
    case
      when v_game.status = 'scored'
        or exists (
          select 1
          from public.fantasy_teams team
          where team.game_id = p_game_id
            and (team.state = 'scored' or team.score is not null)
        )
        then 1
      else 0
    end,
    now()
  )
  on conflict (game_id) do nothing;

  select version_row.version
  into v_current_revision
  from public.studio2_fantasy_score_versions version_row
  where version_row.game_id = p_game_id
  for update;

  if p_expected_score_revision <> v_current_revision then
    raise exception 'Fantasy scores changed since this preview was loaded. Refresh before scoring again.'
      using errcode = '40001';
  end if;

  select public.score_fantasy_game(p_game_id)
  into v_scored_count;

  update public.studio2_fantasy_score_versions
  set version = version + 1,
      updated_at = now()
  where game_id = p_game_id
  returning version into v_next_revision;

  select * into v_game from public.fantasy_games where id = p_game_id;
  if v_game.status <> 'scored' then
    raise exception 'Fantasy scoring did not reach scored state' using errcode = '23514';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', p_game_id,
    'editionId', v_game.edition_id,
    'showId', v_game.show_id,
    'scoredTeamCount', v_scored_count,
    'scoringVersion', v_game.scoring_version,
    'previousScoreRevision', v_current_revision,
    'scoreRevision', v_next_revision,
    'status', v_game.status
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$score$;

create or replace function private.v3_emit_fantasy_score_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_game_id uuid;
  v_edition_id uuid;
  v_show_id uuid;
  v_score_revision bigint;
  v_current_revision bigint;
  v_game public.fantasy_games%rowtype;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'fantasy.score' then
    return new;
  end if;

  begin
    v_game_id := nullif(new.result ->> 'gameId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_score_revision := nullif(new.result ->> 'scoreRevision', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Fantasy score operation has invalid event provenance'
      using errcode = '23514';
  end;

  select * into v_game from public.fantasy_games where id = v_game_id;
  select version into v_current_revision
  from public.studio2_fantasy_score_versions
  where game_id = v_game_id;

  if v_game.id is null
     or v_game.edition_id is distinct from v_edition_id
     or v_game.show_id is distinct from v_show_id
     or v_score_revision is null
     or v_current_revision is distinct from v_score_revision then
    raise exception 'Completed Fantasy score operation lacks canonical event provenance'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'fantasy.scored',
    'fantasy_score',
    v_game_id::text,
    v_score_revision,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'gameId', v_game_id,
      'scoredTeamCount', (new.result ->> 'scoredTeamCount')::integer,
      'scoringVersion', new.result ->> 'scoringVersion',
      'previousScoreRevision', (new.result ->> 'previousScoreRevision')::bigint,
      'scoreRevision', v_score_revision,
      'status', new.result ->> 'status'
    ),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_fantasy_score_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_fantasy_score_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_fantasy_score_operation_event
after update of status, result
on public.studio2_operation_receipts
for each row execute function private.v3_emit_fantasy_score_operation_event();

revoke all on function public.score_fantasy_game(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.studio2_fantasy_score_preview(uuid) from public, anon;
revoke all on function public.studio2_score_fantasy_game(uuid, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_fantasy_score_preview(uuid) to authenticated;
grant execute on function public.studio2_score_fantasy_game(uuid, uuid, text, bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
