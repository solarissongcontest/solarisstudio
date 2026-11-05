begin;

select public.v3_register_migration_contract(
  'v3.results.atomic-televote-calculation',
  1,
  'forward_fix_only',
  false,
  null,
  'Commits official Televote calculation results, influence evidence and authoritative round lifecycle atomically with optimistic version validation.'
);

-- Robust Televote influence evidence is Organizer-only, but Solaris Organizer
-- actions run with the signed-in authenticated session. The v2 migration
-- revoked authenticated access without restoring the capability-scoped policy,
-- which made every official calculation fail while clearing old influence
-- evidence. Restore the same voting.manage boundary used by rounds/results.
grant select, insert, update, delete
  on table televoting.round_influence_results
  to authenticated;

drop policy if exists "televoting organizer full access"
  on televoting.round_influence_results;
create policy "televoting organizer full access"
  on televoting.round_influence_results
  for all
  to authenticated
  using (public.studio2_access_allowed('voting.manage', null, false))
  with check (public.studio2_access_allowed('voting.manage', null, false));

-- Replace the official calculation snapshot and its lifecycle metadata in one
-- PostgreSQL transaction. Result-row writes intentionally invalidate the round
-- through the S14 source-truth trigger; the final round update clears that
-- invalidation only after every result and influence row has been persisted.
-- Any failure therefore rolls the whole replacement back instead of exposing a
-- half-calculated round to Organizer/Public readers.
create or replace function televoting.v3_commit_official_round_calculation(
  p_round_id uuid,
  p_expected_previous_version integer,
  p_calculated_at timestamptz,
  p_calculated_by uuid,
  p_calculated_by_username text,
  p_participant_codes text[],
  p_result_rows jsonb,
  p_influence_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, televoting
as $$
declare
  v_round televoting.rounds%rowtype;
  v_next_version integer;
  v_participant_count integer;
begin
  if p_round_id is null then
    raise exception 'ROUND_REQUIRED: round id is required';
  end if;

  if p_expected_previous_version is null or p_expected_previous_version < 0 then
    raise exception 'INVALID_VERSION: expected previous calculation version must be non-negative';
  end if;

  if p_calculated_at is null then
    raise exception 'CALCULATED_AT_REQUIRED: calculation timestamp is required';
  end if;

  if p_calculated_by is null or nullif(btrim(coalesce(p_calculated_by_username, '')), '') is null then
    raise exception 'ACTOR_REQUIRED: calculation actor is required';
  end if;

  if coalesce(array_length(p_participant_codes, 1), 0) = 0 then
    raise exception 'PARTICIPANTS_REQUIRED: official calculation requires at least one participant';
  end if;

  if jsonb_typeof(p_result_rows) is distinct from 'array' then
    raise exception 'INVALID_RESULTS: result payload must be a JSON array';
  end if;

  if jsonb_typeof(coalesce(p_influence_rows, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'INVALID_INFLUENCE: influence payload must be a JSON array';
  end if;

  select r.*
    into v_round
    from televoting.rounds r
   where r.id = p_round_id
   for update;

  if not found then
    raise exception 'ROUND_NOT_FOUND: %', p_round_id;
  end if;

  if coalesce(v_round.calculation_version, 0) <> p_expected_previous_version then
    raise exception 'STALE_CALCULATION_VERSION: expected %, found %',
      p_expected_previous_version,
      coalesce(v_round.calculation_version, 0);
  end if;

  select count(*)::integer
    into v_participant_count
    from unnest(p_participant_codes) as participant(code);

  if v_participant_count <> (
    select count(distinct participant.code)::integer
      from unnest(p_participant_codes) as participant(code)
  ) then
    raise exception 'DUPLICATE_PARTICIPANT: participant codes must be unique';
  end if;

  if exists (
    select entry.entry_key
      from televoting.round_entries entry
     where entry.round_id = p_round_id
    except
    select participant.code
      from unnest(p_participant_codes) as participant(code)
  ) or exists (
    select participant.code
      from unnest(p_participant_codes) as participant(code)
    except
    select entry.entry_key
      from televoting.round_entries entry
     where entry.round_id = p_round_id
  ) then
    raise exception 'LINEUP_CHANGED: calculation participants no longer match the round lineup';
  end if;

  if jsonb_array_length(p_result_rows) <> v_participant_count then
    raise exception 'RESULT_COUNT_MISMATCH: expected % result rows, received %',
      v_participant_count,
      jsonb_array_length(p_result_rows);
  end if;

  if exists (
    select 1
      from (
        select result.country_code, count(*) as row_count
          from jsonb_to_recordset(p_result_rows) as result(country_code text)
         group by result.country_code
        having count(*) <> 1
      ) duplicate
  ) then
    raise exception 'DUPLICATE_RESULT: each participant must have exactly one result row';
  end if;

  if exists (
    select result.country_code
      from jsonb_to_recordset(p_result_rows) as result(country_code text)
    except
    select participant.code
      from unnest(p_participant_codes) as participant(code)
  ) or exists (
    select participant.code
      from unnest(p_participant_codes) as participant(code)
    except
    select result.country_code
      from jsonb_to_recordset(p_result_rows) as result(country_code text)
  ) then
    raise exception 'RESULT_LINEUP_MISMATCH: result rows must exactly match calculation participants';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_result_rows) as result(
        engine_version text,
        total_points_to_distribute integer
      )
     where result.engine_version is distinct from v_round.televote_engine_version
        or result.total_points_to_distribute is distinct from v_round.total_points_to_distribute
  ) then
    raise exception 'RESULT_CONFIG_MISMATCH: result rows do not match the locked calculation configuration';
  end if;

  v_next_version := p_expected_previous_version + 1;

  delete from televoting.round_influence_results
   where round_id = p_round_id;

  delete from televoting.round_results
   where round_id = p_round_id;

  insert into televoting.round_results (
    round_id,
    country_code,
    original_votes,
    original_voters,
    original_rank,
    participant_count,
    rank_base,
    rank_exponent,
    rank_factor,
    weighted_score,
    exact_points,
    floored_points,
    decimal_remainder,
    remainder_bonus,
    final_points,
    total_points_to_distribute,
    calculation_version,
    calculated_at,
    calculated_by_username,
    engine_version,
    effective_points,
    supporter_count,
    effective_supporters,
    breadth_ratio,
    breadth_factor,
    robust_support,
    robust_rank,
    rank_percentile,
    rank_boost,
    calculation_config
  )
  select
    p_round_id,
    result.country_code,
    result.original_votes,
    result.original_voters,
    result.original_rank,
    result.participant_count,
    result.rank_base,
    result.rank_exponent,
    result.rank_factor,
    result.weighted_score,
    result.exact_points,
    result.floored_points,
    result.decimal_remainder,
    result.remainder_bonus,
    result.final_points,
    result.total_points_to_distribute,
    v_next_version,
    p_calculated_at,
    p_calculated_by_username,
    result.engine_version,
    result.effective_points,
    result.supporter_count,
    result.effective_supporters,
    result.breadth_ratio,
    result.breadth_factor,
    result.robust_support,
    result.robust_rank,
    result.rank_percentile,
    result.rank_boost,
    coalesce(result.calculation_config, '{}'::jsonb)
  from jsonb_to_recordset(p_result_rows) as result(
    country_code text,
    original_votes integer,
    original_voters integer,
    original_rank integer,
    participant_count integer,
    rank_base integer,
    rank_exponent numeric,
    rank_factor numeric,
    weighted_score numeric,
    exact_points numeric,
    floored_points integer,
    decimal_remainder numeric,
    remainder_bonus integer,
    final_points integer,
    total_points_to_distribute integer,
    engine_version text,
    effective_points numeric,
    supporter_count integer,
    effective_supporters numeric,
    breadth_ratio numeric,
    breadth_factor numeric,
    robust_support numeric,
    robust_rank integer,
    rank_percentile numeric,
    rank_boost numeric,
    calculation_config jsonb
  );

  if jsonb_array_length(coalesce(p_influence_rows, '[]'::jsonb)) > 0 then
    insert into televoting.round_influence_results (
      round_id,
      calculation_version,
      subject_type,
      subject_key,
      members,
      winner_changed,
      top_three_changed,
      qualifier_changed,
      max_rank_movement,
      max_point_movement,
      most_affected_entry
    )
    select
      p_round_id,
      v_next_version,
      influence.subject_type,
      influence.subject_key,
      coalesce(influence.members, '[]'::jsonb),
      coalesce(influence.winner_changed, false),
      coalesce(influence.top_three_changed, false),
      coalesce(influence.qualifier_changed, false),
      coalesce(influence.max_rank_movement, 0),
      coalesce(influence.max_point_movement, 0),
      influence.most_affected_entry
    from jsonb_to_recordset(coalesce(p_influence_rows, '[]'::jsonb)) as influence(
      subject_type text,
      subject_key text,
      members jsonb,
      winner_changed boolean,
      top_three_changed boolean,
      qualifier_changed boolean,
      max_rank_movement integer,
      max_point_movement integer,
      most_affected_entry text
    );
  end if;

  update televoting.rounds
     set results_status = 'calculated',
         calculation_version = v_next_version,
         calculated_at = p_calculated_at,
         calculated_by = p_calculated_by,
         calculated_by_username = p_calculated_by_username,
         calc_participant_codes = p_participant_codes,
         results_outdated = false,
         updated_at = now()
   where id = p_round_id;

  return v_next_version;
end;
$$;

revoke all on function televoting.v3_commit_official_round_calculation(
  uuid, integer, timestamptz, uuid, text, text[], jsonb, jsonb
) from public, anon, authenticated;
grant execute on function televoting.v3_commit_official_round_calculation(
  uuid, integer, timestamptz, uuid, text, text[], jsonb, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;