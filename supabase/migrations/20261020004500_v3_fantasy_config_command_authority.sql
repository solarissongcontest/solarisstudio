begin;

-- Organizer V3 / O15 System authority for Fantasy SSC configuration.
-- Preserve studio2_save_fantasy_game as the validated domain writer while
-- adding monotonic config versioning, exact scope, idempotency and receipts.
select public.v3_register_migration_contract(
  '20261020004500_v3_fantasy_config_command_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Organizer Fantasy configuration uses exact edition/show scope, monotonic config versions and idempotent V3 operation receipts'
);

alter table public.fantasy_games
  add column if not exists config_version bigint;

update public.fantasy_games
set config_version = 1
where config_version is null;

alter table public.fantasy_games
  alter column config_version set default 1,
  alter column config_version set not null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fantasy_games_config_version_check'
      and conrelid = 'public.fantasy_games'::regclass
  ) then
    alter table public.fantasy_games
      add constraint fantasy_games_config_version_check check (config_version >= 1);
  end if;
end
$constraints$;

create or replace function private.v3_bump_fantasy_game_config_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $bump$
begin
  if new.show_id is distinct from old.show_id
     or new.name is distinct from old.name
     or new.opens_at is distinct from old.opens_at
     or new.locks_at is distinct from old.locks_at
     or new.roster_size is distinct from old.roster_size
     or new.budget is distinct from old.budget
     or new.captain_multiplier is distinct from old.captain_multiplier then
    new.config_version := old.config_version + 1;
  else
    new.config_version := old.config_version;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_fantasy_game_config_version()
  from public, anon, authenticated;

drop trigger if exists v3_bump_fantasy_game_config_version on public.fantasy_games;
create trigger v3_bump_fantasy_game_config_version
before update of show_id, name, opens_at, locks_at, roster_size, budget, captain_multiplier
on public.fantasy_games
for each row
execute function private.v3_bump_fantasy_game_config_version();

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
        select jsonb_agg(item order by item ->> 'countryId')
        from jsonb_array_elements(p_entries) item
      ),
      '[]'::jsonb
    )
  end
$normalize$;

revoke all on function private.v3_normalize_fantasy_config_entries(jsonb)
  from public, anon, authenticated;

create or replace function public.v3_organizer_fantasy_game(
  p_edition_id uuid,
  p_game_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $projection$
declare
  v_actor uuid := auth.uid();
  v_game public.fantasy_games%rowtype;
  v_entries jsonb := '[]'::jsonb;
  v_server_time timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.edition_id = p_edition_id
    and (p_game_id is null or game.id = p_game_id)
  order by game.created_at desc, game.id desc
  limit 1;

  if p_game_id is not null and v_game.id is null then
    -- Do not reveal whether the supplied id exists in another edition.
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  if v_game.id is null then
    return jsonb_build_object(
      'editionId', p_edition_id,
      'game', null,
      'entries', '[]'::jsonb,
      'stateVersion', 0,
      'serverTime', v_server_time
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'countryId', entry.country_id,
        'cost', entry.cost,
        'eligible', entry.eligible
      )
      order by entry.country_id
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.fantasy_game_entries entry
  where entry.game_id = v_game.id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', v_game.show_id,
    'gameId', v_game.id,
    'stateVersion', v_game.config_version,
    'serverTime', v_server_time,
    'game', jsonb_build_object(
      'id', v_game.id,
      'editionId', v_game.edition_id,
      'showId', v_game.show_id,
      'name', v_game.name,
      'opensAt', v_game.opens_at,
      'locksAt', v_game.locks_at,
      'status', v_game.status,
      'rosterSize', v_game.roster_size,
      'budget', v_game.budget,
      'captainMultiplier', v_game.captain_multiplier,
      'scoringVersion', v_game.scoring_version,
      'configVersion', v_game.config_version,
      'updatedAt', v_game.updated_at
    ),
    'entries', v_entries
  );
end
$projection$;

revoke all on function public.v3_organizer_fantasy_game(uuid, uuid)
  from public, anon;
grant execute on function public.v3_organizer_fantasy_game(uuid, uuid)
  to authenticated, service_role;

comment on function public.v3_organizer_fantasy_game(uuid, uuid) is
  'Bounded exact-edition Organizer Fantasy configuration projection. Caller authorization is server-side and cross-edition game ids fail closed.';

create or replace function public.v3_save_fantasy_game_config(
  p_edition_id uuid,
  p_show_id uuid,
  p_game_id uuid,
  p_expected_config_version bigint,
  p_name text,
  p_opens_at timestamptz,
  p_locks_at timestamptz,
  p_roster_size integer,
  p_budget numeric,
  p_captain_multiplier numeric,
  p_entries jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_game public.fantasy_games%rowtype;
  v_game_id uuid;
  v_normalized_entries jsonb;
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_event_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_show_id is null
     or p_expected_config_version is null
     or p_expected_config_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not exists (
    select 1
    from public.shows show
    where show.id = p_show_id
      and show.edition_id = p_edition_id
  ) then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;

  if p_game_id is null then
    if p_expected_config_version <> 0 then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
  else
    select game.*
    into v_game
    from public.fantasy_games game
    where game.id = p_game_id;

    if v_game.id is null then
      raise exception using errcode = 'P0002', message = 'NOT_FOUND';
    end if;
    if v_game.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
    end if;
  end if;

  v_normalized_entries := private.v3_normalize_fantasy_config_entries(p_entries);
  v_scope := jsonb_strip_nulls(jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'subjectType', 'fantasy_game',
    'subjectId', p_game_id
  ));
  v_request := jsonb_build_object(
    'gameId', p_game_id,
    'expectedConfigVersion', p_expected_config_version,
    'name', btrim(coalesce(p_name, '')),
    'opensAt', p_opens_at,
    'locksAt', p_locks_at,
    'rosterSize', p_roster_size,
    'budget', p_budget,
    'captainMultiplier', p_captain_multiplier,
    'entries', v_normalized_entries
  );

  -- Claim before mutable CAS so an exact retry after a lost success response
  -- returns the original receipt instead of failing against the new version.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'fantasy.game.config.save',
    'R1',
    v_scope,
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if p_game_id is not null then
    select game.*
    into v_game
    from public.fantasy_games game
    where game.id = p_game_id
    for update;

    if v_game.id is null then
      raise exception using errcode = 'P0002', message = 'NOT_FOUND';
    end if;
    if v_game.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
    end if;
    if v_game.config_version is distinct from p_expected_config_version then
      raise exception using
        errcode = '40001',
        message = 'VERSION_CONFLICT',
        hint = 'Reload the current Fantasy configuration before saving.';
    end if;
  end if;

  -- Reuse the established validator for capability, show ownership, lock state,
  -- roster bounds, participant eligibility, duplicate choices and entry costs.
  v_game_id := public.studio2_save_fantasy_game(
    p_game_id,
    p_edition_id,
    p_show_id,
    p_name,
    p_opens_at,
    p_locks_at,
    p_roster_size,
    p_budget,
    p_captain_multiplier,
    v_normalized_entries
  );

  -- A semantically successful V3 save advances the command version exactly
  -- once even when values are unchanged. If the compatibility trigger already
  -- advanced it because fields changed, greatest(...) leaves that increment.
  if p_game_id is not null then
    update public.fantasy_games game
    set config_version = greatest(game.config_version, p_expected_config_version + 1)
    where game.id = v_game_id;
  end if;

  select game.*
  into v_game
  from public.fantasy_games game
  where game.id = v_game_id
    and game.edition_id = p_edition_id;

  if v_game.id is null
     or v_game.show_id is distinct from p_show_id
     or v_game.config_version < 1 then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_event_id := private.v3_emit_domain_event(
    'fantasy.changed',
    'fantasy_game',
    v_game.id::text,
    v_game.config_version,
    v_operation_id,
    v_game.edition_id,
    v_game.show_id,
    jsonb_build_object(
      'change', 'config_saved',
      'gameId', v_game.id,
      'configVersion', v_game.config_version,
      'status', v_game.status,
      'rosterSize', v_game.roster_size,
      'scoringVersion', v_game.scoring_version
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'editionId', v_game.edition_id,
    'showId', v_game.show_id,
    'state', v_game.status,
    'stateVersion', v_game.config_version,
    'eventId', v_event_id,
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$command$;

revoke all on function public.v3_save_fantasy_game_config(
  uuid, uuid, uuid, bigint, text, timestamptz, timestamptz,
  integer, numeric, numeric, jsonb, uuid, text, uuid
) from public, anon;
grant execute on function public.v3_save_fantasy_game_config(
  uuid, uuid, uuid, bigint, text, timestamptz, timestamptz,
  integer, numeric, numeric, jsonb, uuid, text, uuid
) to authenticated, service_role;

comment on function public.v3_save_fantasy_game_config(
  uuid, uuid, uuid, bigint, text, timestamptz, timestamptz,
  integer, numeric, numeric, jsonb, uuid, text, uuid
) is
  'Canonical Organizer Fantasy config save: exact edition/show scope, monotonic CAS, semantic idempotency, receipt/reconciliation and fantasy.changed fact. Existing scoring authority is intentionally separate.';

notify pgrst, 'reload schema';

commit;
