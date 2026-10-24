begin;

-- Canonical participant Fantasy authority. Keep the proven legacy roster
-- validator as an internal primitive, but move participant lifecycle/read truth
-- and submit continuity onto the V3 projection + operation contract.
select public.v3_register_migration_contract(
  'v3.fantasy.participant-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Participant Fantasy uses server-derived lifecycle state and revision-bound idempotent submit receipts'
);

alter table public.fantasy_teams
  add column if not exists revision bigint not null default 1;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fantasy_teams_revision_check'
      and conrelid = 'public.fantasy_teams'::regclass
  ) then
    alter table public.fantasy_teams
      add constraint fantasy_teams_revision_check check (revision >= 1);
  end if;
end
$constraints$;

create or replace function public.v3_fantasy_game(
  p_game_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $projection$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_game public.fantasy_games%rowtype;
  v_team public.fantasy_teams%rowtype;
  v_choices jsonb := '[]'::jsonb;
  v_team_entries jsonb := '[]'::jsonb;
  v_effective_state text;
  v_is_organizer boolean := false;
begin
  if p_game_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id
    and game.status <> 'cancelled'
    and exists (
      select 1
      from public.editions edition
      where edition.id = game.edition_id
        and edition.published = true
    )
    and public.show_publication_enabled(game.show_id, 'participants');

  if v_game.id is null then
    return null;
  end if;

  if v_actor is not null then
    v_is_organizer := public.studio2_access_allowed(
      'edition.manage',
      v_game.edition_id,
      false
    );
  end if;

  -- Preserve the legacy publication boundary. Organizers may inspect an
  -- upcoming game; ordinary viewers cannot discover it before opens_at.
  if v_now < v_game.opens_at and not v_is_organizer then
    return null;
  end if;

  if v_actor is not null then
    select team.*
    into v_team
    from public.fantasy_teams team
    where team.game_id = v_game.id
      and team.profile_id = v_actor;
  end if;

  if v_now < v_game.opens_at then
    v_effective_state := 'upcoming';
  elsif v_game.status = 'scored' or v_team.state = 'scored' then
    v_effective_state := 'settled';
  elsif v_game.status = 'scoring' then
    v_effective_state := 'live_scoring';
  elsif v_game.status = 'locked'
        or v_team.state = 'locked'
        or v_now >= v_game.locks_at then
    v_effective_state := 'locked';
  elsif v_team.id is not null then
    v_effective_state := 'submitted';
  else
    v_effective_state := 'open';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'game_id', choice.game_id,
        'country_id', choice.country_id,
        'cost', choice.cost,
        'eligible', choice.eligible
      )
      order by choice.cost desc, choice.country_id
    ),
    '[]'::jsonb
  )
  into v_choices
  from public.fantasy_game_entries choice
  where choice.game_id = v_game.id
    and choice.eligible = true
    and (v_now >= v_game.opens_at or v_is_organizer);

  if v_team.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'team_id', entry.team_id,
          'country_id', entry.country_id,
          'cost_locked', entry.cost_locked
        )
        order by entry.country_id
      ),
      '[]'::jsonb
    )
    into v_team_entries
    from public.fantasy_team_entries entry
    where entry.team_id = v_team.id;
  end if;

  return jsonb_build_object(
    'serverTime', v_now,
    'effectiveState', v_effective_state,
    'stateVersion', coalesce(v_team.revision, 0),
    'canEdit', v_effective_state in ('open', 'submitted'),
    'game', jsonb_build_object(
      'id', v_game.id,
      'edition_id', v_game.edition_id,
      'show_id', v_game.show_id,
      'name', v_game.name,
      'opens_at', v_game.opens_at,
      'locks_at', v_game.locks_at,
      'status', v_game.status,
      'roster_size', v_game.roster_size,
      'budget', v_game.budget,
      'captain_multiplier', v_game.captain_multiplier,
      'scoring_version', v_game.scoring_version
    ),
    'choices', v_choices,
    'team', case
      when v_team.id is null then null
      else jsonb_build_object(
        'id', v_team.id,
        'game_id', v_team.game_id,
        'state', v_team.state,
        'captain_country_id', v_team.captain_country_id,
        'score', v_team.score,
        'revision', v_team.revision
      )
    end,
    'teamEntries', v_team_entries
  );
end
$projection$;

revoke all on function public.v3_fantasy_game(uuid) from public;
grant execute on function public.v3_fantasy_game(uuid)
  to anon, authenticated, service_role;

comment on function public.v3_fantasy_game(uuid) is
  'Caller-safe participant Fantasy projection. Server time and canonical game/team state determine lifecycle; private roster data is scoped only from auth.uid().';

create or replace function public.v3_submit_fantasy_team(
  p_game_id uuid,
  p_country_ids uuid[],
  p_captain_country_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $submit$
declare
  v_actor uuid := auth.uid();
  v_game public.fantasy_games%rowtype;
  v_team public.fantasy_teams%rowtype;
  v_existing_team boolean := false;
  v_claim jsonb;
  v_operation_id uuid;
  v_team_id uuid;
  v_revision bigint;
  v_event_id uuid;
  v_sorted_country_ids jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_game_id is null
     or p_country_ids is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id;

  if v_game.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  select coalesce(jsonb_agg(country_id order by country_id), '[]'::jsonb)
  into v_sorted_country_ids
  from unnest(p_country_ids) country_id;

  -- Claim before mutable-state/CAS checks so a lost-response retry can replay
  -- after the original transaction advanced the team revision or deadline.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'fantasy.team.submit',
    'R1',
    jsonb_build_object(
      'editionId', v_game.edition_id,
      'showId', v_game.show_id,
      'subjectType', 'fantasy_game',
      'subjectId', v_game.id
    ),
    jsonb_build_object(
      'gameId', v_game.id,
      'countryIds', v_sorted_country_ids,
      'captainCountryId', p_captain_country_id,
      'expectedRevision', p_expected_revision
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Lock game before caller-owned team. The legacy validator uses the same
  -- object order; two distinct submissions therefore serialize cleanly.
  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = p_game_id
  for update;

  select team.*
  into v_team
  from public.fantasy_teams team
  where team.game_id = p_game_id
    and team.profile_id = v_actor
  for update;

  v_existing_team := v_team.id is not null;

  if (not v_existing_team and p_expected_revision <> 0)
     or (v_existing_team and v_team.revision is distinct from p_expected_revision) then
    raise sqlstate 'PT409' using
      message = 'VERSION_CONFLICT',
      hint = 'Reload the authoritative Fantasy roster before retrying.';
  end if;

  -- Reuse the established server validator for authentication, server time,
  -- public availability, roster size/uniqueness, eligibility, budget and captain.
  v_team_id := public.submit_fantasy_team(
    p_game_id,
    p_country_ids,
    p_captain_country_id
  );

  if v_existing_team then
    update public.fantasy_teams team
    set revision = team.revision + 1
    where team.id = v_team_id
      and team.profile_id = v_actor
    returning team.revision into v_revision;
  else
    select team.revision
    into v_revision
    from public.fantasy_teams team
    where team.id = v_team_id
      and team.profile_id = v_actor;
  end if;

  if v_revision is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  -- Participant roster mutation uses the canonical Fantasy vocabulary already
  -- declared by the System domain registry. Scoring remains separate
  -- `fantasy.scored` authority and is not duplicated here.
  v_event_id := private.v3_emit_domain_event(
    'fantasy.changed',
    'fantasy_team',
    v_team_id::text,
    v_revision,
    v_operation_id,
    v_game.edition_id,
    v_game.show_id,
    jsonb_build_object(
      'change', 'team_submitted',
      'gameId', v_game.id,
      'teamId', v_team_id,
      'revision', v_revision,
      'rosterSize', cardinality(p_country_ids),
      'captainSelected', p_captain_country_id is not null
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'teamId', v_team_id,
    'gameId', v_game.id,
    'state', 'submitted',
    'stateVersion', v_revision,
    'eventId', v_event_id,
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$submit$;

revoke all on function public.v3_submit_fantasy_team(
  uuid, uuid[], uuid, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.v3_submit_fantasy_team(
  uuid, uuid[], uuid, bigint, uuid, text, uuid
) to authenticated, service_role;

comment on function public.v3_submit_fantasy_team(
  uuid, uuid[], uuid, bigint, uuid, text, uuid
) is
  'Revision-bound participant Fantasy submit command with semantic idempotency, lost-response reconciliation, authoritative receipt and transactional fantasy.changed DomainEvent.';

-- Browser clients must use the V3 command. Keep the validated legacy writer as
-- an internal service primitive so its mature validation is not duplicated.
revoke all on function public.submit_fantasy_team(uuid, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.submit_fantasy_team(uuid, uuid[], uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
