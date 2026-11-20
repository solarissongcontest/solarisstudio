begin;

-- System V3 S5: canonical Fantasy scoring authority on current main.
-- Preserve the established Fantasy SSC scoring formula while making scoring
-- revisioned, idempotent, replayable and transactionally event-backed.
select public.v3_register_migration_contract(
  'v3.fantasy.scoring-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Fantasy scoring uses server-owned revisions, R2 receipts, HTTP 409 CAS conflicts and canonical fantasy.scored events'
);

create table if not exists public.studio2_fantasy_score_versions (
  game_id uuid primary key references public.fantasy_games(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_fantasy_score_versions enable row level security;
revoke all on table public.studio2_fantasy_score_versions from public, anon, authenticated;
grant all on table public.studio2_fantasy_score_versions to service_role;

create or replace function private.studio2_fantasy_score_revision(
  p_game_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $revision$
  select coalesce(
    (
      select version_row.version
      from public.studio2_fantasy_score_versions version_row
      where version_row.game_id = p_game_id
    ),
    case
      when exists (
        select 1
        from public.fantasy_games game
        where game.id = p_game_id
          and (
            game.status = 'scored'
            or exists (
              select 1
              from public.fantasy_teams team
              where team.game_id = game.id
                and (team.state = 'scored' or team.score is not null)
            )
          )
      ) then 1
      else 0
    end
  );
$revision$;

revoke all on function private.studio2_fantasy_score_revision(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_fantasy_score_preview(
  p_game_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_game public.fantasy_games%rowtype;
  v_version bigint := 0;
begin
  if p_game_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id;

  if v_game.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_version := private.studio2_fantasy_score_revision(p_game_id);

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
  p_expected_score_revision bigint,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $score$
declare
  v_game public.fantasy_games%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_revision bigint := 0;
  v_next_revision bigint := 0;
  v_scored_count integer := 0;
  v_event_id uuid;
  v_result jsonb;
begin
  if p_game_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_score_revision is null
     or p_expected_score_revision < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Resolve only immutable request scope before claiming. Authorization,
  -- lifecycle and score revision are revalidated for every new operation after
  -- the claim so an exact retry can replay a committed result after state drift.
  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id;

  if v_game.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'fantasy.score',
    'R2',
    jsonb_build_object(
      'gameId', p_game_id,
      'editionId', v_game.edition_id,
      'showId', v_game.show_id,
      'subjectType', 'fantasy_game',
      'subjectId', p_game_id
    ),
    jsonb_build_object(
      'gameId', p_game_id,
      'expectedScoreRevision', p_expected_score_revision
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-fantasy-score:' || p_game_id::text, 0)
  );

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id
  for update;

  if v_game.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('results.preview', v_game.edition_id, false)
     and not public.studio2_access_allowed('results.publish', v_game.edition_id, false)
  then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

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

  if p_expected_score_revision is distinct from v_current_revision then
    raise sqlstate 'PT409' using
      message = 'VERSION_CONFLICT',
      hint = 'Reload the authoritative Fantasy score preview before retrying.';
  end if;

  -- Keep the established Fantasy SSC v1 scoring formula as the calculation
  -- authority. This command governs identity, concurrency, receipt and event
  -- provenance around that proven scorer rather than copying its formula.
  select public.score_fantasy_game(p_game_id)
  into v_scored_count;

  update public.studio2_fantasy_score_versions
  set version = version + 1,
      updated_at = now()
  where game_id = p_game_id
  returning version into v_next_revision;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id;

  if v_game.status <> 'scored' then
    raise exception using errcode = '23514', message = 'DATABASE';
  end if;

  v_event_id := private.v3_emit_domain_event(
    'fantasy.scored',
    'fantasy_score',
    p_game_id::text,
    v_next_revision,
    v_operation_id,
    v_game.edition_id,
    v_game.show_id,
    jsonb_build_object(
      'gameId', p_game_id,
      'scoredTeamCount', v_scored_count,
      'scoringVersion', v_game.scoring_version,
      'previousScoreRevision', v_current_revision,
      'scoreRevision', v_next_revision,
      'status', v_game.status
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', p_game_id,
    'editionId', v_game.edition_id,
    'showId', v_game.show_id,
    'scoredTeamCount', v_scored_count,
    'scoringVersion', v_game.scoring_version,
    'previousScoreRevision', v_current_revision,
    'scoreRevision', v_next_revision,
    'status', v_game.status,
    'eventId', v_event_id,
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$score$;

revoke all on function public.score_fantasy_game(uuid)
  from public, anon, authenticated;
grant execute on function public.score_fantasy_game(uuid)
  to service_role;

revoke all on function public.studio2_fantasy_score_preview(uuid)
  from public, anon;
grant execute on function public.studio2_fantasy_score_preview(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_score_fantasy_game(uuid, uuid, text, bigint, uuid)
  from public, anon;
grant execute on function public.studio2_score_fantasy_game(uuid, uuid, text, bigint, uuid)
  to authenticated, service_role;

comment on function public.studio2_score_fantasy_game(uuid, uuid, text, bigint, uuid) is
  'R2 Fantasy scoring command with exact score-revision CAS, lost-response reconciliation and transactional fantasy.scored provenance.';

notify pgrst, 'reload schema';

commit;
