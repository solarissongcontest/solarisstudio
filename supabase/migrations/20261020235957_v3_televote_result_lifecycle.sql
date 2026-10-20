begin;

-- System V3 / #687 + #725.
--
-- Keep Televoting's existing calculation algorithms and S14 published-result
-- projection, but provide one exact-edition, versioned, idempotent persistence
-- boundary for result configuration, official recalculation and lifecycle.
-- Precomputed calculation rows are accepted only when the canonical calculation
-- input fingerprint still matches, then replaced transactionally with the round
-- result state and S2 operation receipt.
select public.v3_register_migration_contract(
  'v3.s7.televote-result-lifecycle',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern exact-edition Televote result config, recalculation and publication with CAS, semantic idempotency, atomic result replacement and Solaris projection reconciliation.'
);

create or replace function private.v3_televote_result_input_fingerprint(
  p_round_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $fingerprint$
declare
  v_round televoting.rounds%rowtype;
  v_entries jsonb := '[]'::jsonb;
  v_ballots jsonb := '[]'::jsonb;
begin
  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entryKey', entry.entry_key,
        'displayOrder', entry.display_order
      )
      order by entry.display_order, entry.entry_key, entry.id
    ),
    '[]'::jsonb
  )
  into v_entries
  from televoting.round_entries entry
  where entry.round_id = p_round_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submissionId', submission.id,
        'status', submission.status,
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'target', vote_entry.target_country_code,
              'points', vote_entry.points
            )
            order by vote_entry.target_country_code, vote_entry.id
          )
          from televoting.vote_entries vote_entry
          where vote_entry.submission_id = submission.id
        ), '[]'::jsonb)
      )
      order by submission.id
    ),
    '[]'::jsonb
  )
  into v_ballots
  from televoting.vote_submissions submission
  where submission.round_id = p_round_id;

  return encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'roundId', v_round.id,
          'status', v_round.status,
          'totalPoints', v_round.total_points_to_distribute,
          'rankExponent', v_round.rank_exponent,
          'engineVersion', v_round.televote_engine_version,
          'ballotExponent', v_round.ballot_exponent,
          'breadthFloor', v_round.breadth_floor,
          'breadthExponent', v_round.breadth_exponent,
          'supportExponent', v_round.support_exponent,
          'rankBoostStrength', v_round.rank_boost_strength,
          'rankBoostShape', v_round.rank_boost_shape,
          'entries', v_entries,
          'ballots', v_ballots
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
end
$fingerprint$;

revoke all on function private.v3_televote_result_input_fingerprint(uuid)
  from public, anon, authenticated;

create or replace function private.v3_televote_round_solaris_edition(
  p_round_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, televoting
as $binding$
  select link.solaris_id
  from televoting.rounds round_row
  join public.integration_links link
    on link.service = 'televoting'
   and link.entity_type = 'edition'
   and link.remote_id = round_row.edition_id::text
  where round_row.id = p_round_id
  limit 1
$binding$;

revoke all on function private.v3_televote_round_solaris_edition(uuid)
  from public, anon, authenticated;

create or replace function private.v3_televote_result_round_version(
  p_round_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $version$
  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0::bigint)
$version$;

revoke all on function private.v3_televote_result_round_version(uuid)
  from public, anon, authenticated;

create or replace function televoting.studio2_televote_result_preview(
  p_solaris_edition_id uuid,
  p_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $preview$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_show_id uuid;
  v_round_version bigint := 0;
  v_result_row_count integer := 0;
  v_current_result_row_count integer := 0;
  v_sync jsonb := null;
begin
  if p_solaris_edition_id is null or p_round_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  v_solaris_edition_id := private.v3_televote_round_solaris_edition(p_round_id);
  if v_solaris_edition_id is null
     or v_solaris_edition_id is distinct from p_solaris_edition_id then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_round_version := private.v3_televote_result_round_version(p_round_id);

  select binding.show_id
  into v_show_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text
    and binding.edition_id = p_solaris_edition_id
  limit 1;

  select
    count(*)::integer,
    count(*) filter (
      where result_row.calculation_version = v_round.calculation_version
        and result_row.engine_version = v_round.televote_engine_version
    )::integer
  into v_result_row_count, v_current_result_row_count
  from televoting.round_results result_row
  where result_row.round_id = p_round_id;

  if v_show_id is not null then
    select jsonb_build_object(
      'sourceType', source.source_type,
      'sourceId', source.source_id,
      'sourceVersion', source.source_version,
      'projectionRevision', source.projection_revision,
      'syncedAt', source.synced_at
    )
    into v_sync
    from private.v3_televote_result_projection_sources source
    where source.show_id = v_show_id;
  end if;

  return jsonb_build_object(
    'solarisEditionId', p_solaris_edition_id,
    'remoteEditionId', v_round.edition_id,
    'roundId', v_round.id,
    'roundName', v_round.name,
    'showId', v_show_id,
    'roundStatus', v_round.status,
    'resultsStatus', v_round.results_status,
    'resultsOutdated', v_round.results_outdated,
    'expectedRoundVersion', v_round_version,
    'expectedCalculationVersion', v_round.calculation_version,
    'calculationInputFingerprint', private.v3_televote_result_input_fingerprint(p_round_id),
    'resultRowCount', v_result_row_count,
    'currentResultRowCount', v_current_result_row_count,
    'config', jsonb_build_object(
      'totalPoints', v_round.total_points_to_distribute,
      'rankExponent', v_round.rank_exponent,
      'engineVersion', v_round.televote_engine_version,
      'ballotExponent', v_round.ballot_exponent,
      'breadthFloor', v_round.breadth_floor,
      'breadthExponent', v_round.breadth_exponent,
      'supportExponent', v_round.support_exponent,
      'rankBoostStrength', v_round.rank_boost_strength,
      'rankBoostShape', v_round.rank_boost_shape,
      'advancedTransparency', v_round.public_advanced_transparency,
      'broadcastMode', v_round.broadcast_display_mode
    ),
    'solarisSync', v_sync,
    'publicationReady',
      v_round.status = 'closed'
      and v_round.calculation_version > 0
      and not coalesce(v_round.results_outdated, false)
      and v_result_row_count > 0
      and v_result_row_count = v_current_result_row_count,
    'serverTime', now()
  );
end
$preview$;

revoke all on function televoting.studio2_televote_result_preview(uuid, uuid)
  from public, anon;
grant execute on function televoting.studio2_televote_result_preview(uuid, uuid)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_televote_result_config(
  p_solaris_edition_id uuid,
  p_round_id uuid,
  p_patch jsonb,
  p_expected_round_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_round_version bigint;
  v_next_round_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_math_changed boolean := false;
  v_result jsonb;
begin
  if p_solaris_edition_id is null
     or p_round_id is null
     or p_operation_id is null
     or p_expected_round_version is null
     or p_expected_round_version < 0
     or jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object'
     or coalesce(p_patch, '{}'::jsonb) - array[
       'totalPoints','rankExponent','engineVersion','ballotExponent','breadthFloor',
       'breadthExponent','supportExponent','rankBoostStrength','rankBoostShape',
       'advancedTransparency','broadcastMode'
     ]::text[] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_solaris_edition_id := private.v3_televote_round_solaris_edition(p_round_id);
  if v_solaris_edition_id is null
     or v_solaris_edition_id is distinct from p_solaris_edition_id
     or not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'televote.result.config.update',
    'R2',
    jsonb_build_object(
      'solarisEditionId', p_solaris_edition_id,
      'roundId', p_round_id
    ),
    jsonb_build_object(
      'patch', p_patch,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object(
      'ok', false,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true
    );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  if v_round.id is null then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  v_current_round_version := private.v3_televote_result_round_version(p_round_id);
  if v_current_round_version is distinct from p_expected_round_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  if v_round.results_status in ('locked', 'published') then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  if p_patch ? 'totalPoints' and (
    jsonb_typeof(p_patch -> 'totalPoints') <> 'number'
    or (p_patch ->> 'totalPoints')::numeric < 0
    or trunc((p_patch ->> 'totalPoints')::numeric) <> (p_patch ->> 'totalPoints')::numeric
  ) then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'rankExponent' and (p_patch ->> 'rankExponent')::numeric not between 0.01 and 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_patch ? 'engineVersion' and p_patch ->> 'engineVersion' not in ('rank-weighted-v1','robust-televote-v2') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_patch ? 'ballotExponent' and (p_patch ->> 'ballotExponent')::numeric not between 0.1 and 2 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'breadthFloor' and (p_patch ->> 'breadthFloor')::numeric not between 0 and 1 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'breadthExponent' and (p_patch ->> 'breadthExponent')::numeric not between 0.1 and 2 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'supportExponent' and (p_patch ->> 'supportExponent')::numeric not between 0.1 and 3 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'rankBoostStrength' and (p_patch ->> 'rankBoostStrength')::numeric not between 0 and 3 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'rankBoostShape' and (p_patch ->> 'rankBoostShape')::numeric not between 0.1 and 4 then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'advancedTransparency' and jsonb_typeof(p_patch -> 'advancedTransparency') <> 'boolean' then raise exception using errcode = '22023', message = 'VALIDATION'; end if;
  if p_patch ? 'broadcastMode' and p_patch ->> 'broadcastMode' not in ('original','converted','combined') then raise exception using errcode = '22023', message = 'VALIDATION'; end if;

  v_math_changed :=
    (p_patch ? 'totalPoints' and (p_patch ->> 'totalPoints')::integer is distinct from v_round.total_points_to_distribute)
    or (p_patch ? 'rankExponent' and (p_patch ->> 'rankExponent')::numeric is distinct from v_round.rank_exponent)
    or (p_patch ? 'engineVersion' and p_patch ->> 'engineVersion' is distinct from v_round.televote_engine_version)
    or (p_patch ? 'ballotExponent' and (p_patch ->> 'ballotExponent')::numeric is distinct from v_round.ballot_exponent)
    or (p_patch ? 'breadthFloor' and (p_patch ->> 'breadthFloor')::numeric is distinct from v_round.breadth_floor)
    or (p_patch ? 'breadthExponent' and (p_patch ->> 'breadthExponent')::numeric is distinct from v_round.breadth_exponent)
    or (p_patch ? 'supportExponent' and (p_patch ->> 'supportExponent')::numeric is distinct from v_round.support_exponent)
    or (p_patch ? 'rankBoostStrength' and (p_patch ->> 'rankBoostStrength')::numeric is distinct from v_round.rank_boost_strength)
    or (p_patch ? 'rankBoostShape' and (p_patch ->> 'rankBoostShape')::numeric is distinct from v_round.rank_boost_shape);

  update televoting.rounds
  set total_points_to_distribute = case when p_patch ? 'totalPoints' then (p_patch ->> 'totalPoints')::integer else total_points_to_distribute end,
      rank_exponent = case when p_patch ? 'rankExponent' then (p_patch ->> 'rankExponent')::numeric else rank_exponent end,
      televote_engine_version = case when p_patch ? 'engineVersion' then p_patch ->> 'engineVersion' else televote_engine_version end,
      ballot_exponent = case when p_patch ? 'ballotExponent' then (p_patch ->> 'ballotExponent')::numeric else ballot_exponent end,
      breadth_floor = case when p_patch ? 'breadthFloor' then (p_patch ->> 'breadthFloor')::numeric else breadth_floor end,
      breadth_exponent = case when p_patch ? 'breadthExponent' then (p_patch ->> 'breadthExponent')::numeric else breadth_exponent end,
      support_exponent = case when p_patch ? 'supportExponent' then (p_patch ->> 'supportExponent')::numeric else support_exponent end,
      rank_boost_strength = case when p_patch ? 'rankBoostStrength' then (p_patch ->> 'rankBoostStrength')::numeric else rank_boost_strength end,
      rank_boost_shape = case when p_patch ? 'rankBoostShape' then (p_patch ->> 'rankBoostShape')::numeric else rank_boost_shape end,
      public_advanced_transparency = case when p_patch ? 'advancedTransparency' then (p_patch ->> 'advancedTransparency')::boolean else public_advanced_transparency end,
      broadcast_display_mode = case when p_patch ? 'broadcastMode' then p_patch ->> 'broadcastMode' else broadcast_display_mode end,
      results_outdated = case when calculation_version > 0 and v_math_changed then true else results_outdated end,
      updated_at = now()
  where id = p_round_id;

  v_next_round_version := private.v3_televote_result_round_version(p_round_id);

  insert into televoting.admin_audit_log (
    actor_admin_id, actor_username, action, target_type, target_id, old_values, new_values
  ) values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text),
    'v3_televote_result_config_update',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'roundVersion', v_current_round_version,
      'calculationVersion', v_round.calculation_version,
      'resultsStatus', v_round.results_status
    ),
    jsonb_build_object(
      'patch', p_patch,
      'roundVersion', v_next_round_version,
      'resultsOutdated', case when v_round.calculation_version > 0 and v_math_changed then true else v_round.results_outdated end,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'solarisEditionId', p_solaris_edition_id,
    'roundId', p_round_id,
    'previousRoundVersion', v_current_round_version,
    'roundVersion', v_next_round_version,
    'calculationVersion', v_round.calculation_version,
    'resultsOutdated', case when v_round.calculation_version > 0 and v_math_changed then true else v_round.results_outdated end,
    'serverTime', now(),
    'replayed', false
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_televote_result_config(
  uuid, uuid, jsonb, bigint, uuid, text
) from public, anon;
grant execute on function televoting.studio2_apply_televote_result_config(
  uuid, uuid, jsonb, bigint, uuid, text
) to authenticated, service_role;

create or replace function televoting.studio2_apply_televote_result_recalculation(
  p_solaris_edition_id uuid,
  p_round_id uuid,
  p_expected_round_version bigint,
  p_expected_calculation_version integer,
  p_expected_input_fingerprint text,
  p_result_rows jsonb,
  p_influence_rows jsonb,
  p_calculation_summary jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth, extensions
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_round_version bigint;
  v_next_round_version bigint;
  v_next_calculation_version integer;
  v_current_fingerprint text;
  v_payload_fingerprint text;
  v_claim jsonb;
  v_operation_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_risk text := 'R2';
  v_entry_count integer := 0;
  v_row_count integer := 0;
  v_distinct_code_count integer := 0;
  v_points_total bigint := 0;
  v_all_zero boolean := false;
  v_result jsonb;
begin
  if p_solaris_edition_id is null
     or p_round_id is null
     or p_operation_id is null
     or p_expected_round_version is null
     or p_expected_round_version < 0
     or p_expected_calculation_version is null
     or p_expected_calculation_version < 0
     or coalesce(p_expected_input_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_result_rows, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_result_rows) not between 1 and 50
     or pg_column_size(p_result_rows) > 131072
     or jsonb_typeof(coalesce(p_influence_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_influence_rows, '[]'::jsonb)) > 5000
     or pg_column_size(coalesce(p_influence_rows, '[]'::jsonb)) > 524288
     or jsonb_typeof(coalesce(p_calculation_summary, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_calculation_summary, '{}'::jsonb)) > 16384 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_solaris_edition_id := private.v3_televote_round_solaris_edition(p_round_id);
  if v_solaris_edition_id is null
     or v_solaris_edition_id is distinct from p_solaris_edition_id
     or not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  if v_round.results_status = 'published' then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  if v_round.results_status = 'locked' then
    v_risk := 'R3';
    if v_reason is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    perform private.studio2_require_fresh_auth(300);
  end if;

  v_payload_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'results', p_result_rows,
          'influence', coalesce(p_influence_rows, '[]'::jsonb),
          'summary', coalesce(p_calculation_summary, '{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'televote.result.recalculate',
    v_risk,
    jsonb_build_object(
      'solarisEditionId', p_solaris_edition_id,
      'roundId', p_round_id
    ),
    jsonb_build_object(
      'expectedRoundVersion', p_expected_round_version,
      'expectedCalculationVersion', p_expected_calculation_version,
      'expectedInputFingerprint', p_expected_input_fingerprint,
      'payloadFingerprint', v_payload_fingerprint,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object(
      'ok', false,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true
    );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  v_current_round_version := private.v3_televote_result_round_version(p_round_id);
  v_current_fingerprint := private.v3_televote_result_input_fingerprint(p_round_id);

  if v_current_round_version is distinct from p_expected_round_version
     or v_round.calculation_version is distinct from p_expected_calculation_version
     or v_current_fingerprint is distinct from p_expected_input_fingerprint then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  if v_round.status <> 'closed' then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_result_rows) item
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(coalesce(item ->> 'countryCode', '')), '') is null
       or coalesce(item ->> 'finalPoints', '') !~ '^[0-9]+$'
       or coalesce(item ->> 'engineVersion', '') not in ('rank-weighted-v1','robust-televote-v2')
       or item ->> 'engineVersion' is distinct from v_round.televote_engine_version
       or jsonb_typeof(coalesce(item -> 'calculationConfig', '{}'::jsonb)) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select
    count(*)::integer,
    count(distinct item ->> 'countryCode')::integer,
    coalesce(sum((item ->> 'finalPoints')::bigint), 0),
    coalesce(bool_and((item ->> 'finalPoints')::bigint = 0), false)
  into v_row_count, v_distinct_code_count, v_points_total, v_all_zero
  from jsonb_array_elements(p_result_rows) item;

  select count(*)::integer
  into v_entry_count
  from televoting.round_entries entry
  where entry.round_id = p_round_id;

  if v_row_count <> v_distinct_code_count
     or v_row_count <> v_entry_count
     or exists (
       select 1
       from jsonb_array_elements(p_result_rows) item
       where not exists (
         select 1
         from televoting.round_entries entry
         where entry.round_id = p_round_id
           and entry.entry_key = item ->> 'countryCode'
       )
     ) then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  if not v_all_zero and v_points_total <> v_round.total_points_to_distribute then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_influence_rows, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'subjectType', '') not in ('voter','cluster')
       or nullif(btrim(coalesce(item ->> 'subjectKey', '')), '') is null
       or jsonb_typeof(coalesce(item -> 'members', '[]'::jsonb)) <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_next_calculation_version := v_round.calculation_version + 1;

  delete from televoting.round_results result_row
  where result_row.round_id = p_round_id;

  delete from televoting.round_influence_results influence
  where influence.round_id = p_round_id;

  insert into televoting.round_results (
    round_id, country_code, original_votes, original_voters, original_rank,
    participant_count, rank_base, rank_exponent, rank_factor, weighted_score,
    exact_points, floored_points, decimal_remainder, remainder_bonus,
    final_points, total_points_to_distribute, calculation_version,
    calculated_at, calculated_by_username, engine_version, effective_points,
    supporter_count, effective_supporters, breadth_ratio, breadth_factor,
    robust_support, robust_rank, rank_percentile, rank_boost, calculation_config
  )
  select
    p_round_id,
    item ->> 'countryCode',
    coalesce((item ->> 'originalVotes')::integer, 0),
    coalesce((item ->> 'originalVoters')::integer, 0),
    nullif(item ->> 'originalRank', '')::integer,
    v_row_count,
    nullif(item ->> 'rankBase', '')::integer,
    nullif(item ->> 'rankExponent', '')::numeric,
    nullif(item ->> 'rankFactor', '')::numeric,
    coalesce(nullif(item ->> 'weightedScore', '')::numeric, 0),
    coalesce(nullif(item ->> 'exactPoints', '')::numeric, 0),
    coalesce(nullif(item ->> 'flooredPoints', '')::integer, 0),
    coalesce(nullif(item ->> 'decimalRemainder', '')::numeric, 0),
    coalesce(nullif(item ->> 'remainderBonus', '')::integer, 0),
    (item ->> 'finalPoints')::integer,
    v_round.total_points_to_distribute,
    v_next_calculation_version,
    now(),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text),
    item ->> 'engineVersion',
    nullif(item ->> 'effectivePoints', '')::numeric,
    nullif(item ->> 'supporterCount', '')::integer,
    nullif(item ->> 'effectiveSupporters', '')::numeric,
    nullif(item ->> 'breadthRatio', '')::numeric,
    nullif(item ->> 'breadthFactor', '')::numeric,
    nullif(item ->> 'robustSupport', '')::numeric,
    nullif(item ->> 'robustRank', '')::integer,
    nullif(item ->> 'rankPercentile', '')::numeric,
    nullif(item ->> 'rankBoost', '')::numeric,
    coalesce(item -> 'calculationConfig', '{}'::jsonb)
  from jsonb_array_elements(p_result_rows) item;

  insert into televoting.round_influence_results (
    round_id, calculation_version, subject_type, subject_key, members,
    winner_changed, top_three_changed, qualifier_changed, max_rank_movement,
    max_point_movement, most_affected_entry
  )
  select
    p_round_id,
    v_next_calculation_version,
    item ->> 'subjectType',
    item ->> 'subjectKey',
    coalesce(item -> 'members', '[]'::jsonb),
    coalesce((item ->> 'winnerChanged')::boolean, false),
    coalesce((item ->> 'topThreeChanged')::boolean, false),
    coalesce((item ->> 'qualifierChanged')::boolean, false),
    coalesce((item ->> 'maxRankMovement')::integer, 0),
    coalesce((item ->> 'maxPointMovement')::integer, 0),
    nullif(item ->> 'mostAffectedEntry', '')
  from jsonb_array_elements(coalesce(p_influence_rows, '[]'::jsonb)) item;

  update televoting.rounds
  set results_status = 'calculated',
      calculation_version = v_next_calculation_version,
      calculated_at = now(),
      calculated_by = auth.uid(),
      calculated_by_username = coalesce(auth.jwt() ->> 'email', auth.uid()::text),
      calc_participant_codes = array(
        select entry.entry_key
        from televoting.round_entries entry
        where entry.round_id = p_round_id
        order by entry.display_order, entry.entry_key
      ),
      results_outdated = false,
      updated_at = now()
  where id = p_round_id;

  v_next_round_version := private.v3_televote_result_round_version(p_round_id);

  insert into televoting.admin_audit_log (
    actor_admin_id, actor_username, action, target_type, target_id, old_values, new_values, reason
  ) values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text),
    'v3_televote_result_recalculate',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'roundVersion', v_current_round_version,
      'calculationVersion', p_expected_calculation_version,
      'resultsStatus', v_round.results_status,
      'resultsOutdated', v_round.results_outdated
    ),
    jsonb_build_object(
      'roundVersion', v_next_round_version,
      'calculationVersion', v_next_calculation_version,
      'resultsStatus', 'calculated',
      'rowCount', v_row_count,
      'pointsTotal', v_points_total,
      'summary', p_calculation_summary,
      'operationId', v_operation_id
    ),
    v_reason
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'solarisEditionId', p_solaris_edition_id,
    'roundId', p_round_id,
    'previousRoundVersion', v_current_round_version,
    'roundVersion', v_next_round_version,
    'previousCalculationVersion', p_expected_calculation_version,
    'calculationVersion', v_next_calculation_version,
    'resultsStatus', 'calculated',
    'rowCount', v_row_count,
    'pointsTotal', v_points_total,
    'inputFingerprint', p_expected_input_fingerprint,
    'serverTime', now(),
    'replayed', false
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_televote_result_recalculation(
  uuid, uuid, bigint, integer, text, jsonb, jsonb, jsonb, text, uuid, text
) from public, anon;
grant execute on function televoting.studio2_apply_televote_result_recalculation(
  uuid, uuid, bigint, integer, text, jsonb, jsonb, jsonb, text, uuid, text
) to authenticated, service_role;

create or replace function televoting.studio2_apply_televote_result_status(
  p_solaris_edition_id uuid,
  p_round_id uuid,
  p_target_status text,
  p_expected_round_version bigint,
  p_expected_calculation_version integer,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_round_version bigint;
  v_next_round_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_risk text := 'R2';
  v_entry_count integer := 0;
  v_result_count integer := 0;
  v_current_result_count integer := 0;
  v_points_total bigint := 0;
  v_all_zero boolean := false;
  v_sync jsonb := null;
  v_result jsonb;
begin
  if p_solaris_edition_id is null
     or p_round_id is null
     or p_operation_id is null
     or p_target_status not in ('calculated','locked','published')
     or p_expected_round_version is null
     or p_expected_round_version < 0
     or p_expected_calculation_version is null
     or p_expected_calculation_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_solaris_edition_id := private.v3_televote_round_solaris_edition(p_round_id);
  if v_solaris_edition_id is null
     or v_solaris_edition_id is distinct from p_solaris_edition_id
     or not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  if v_round.results_status = 'published'
     and p_target_status <> 'published' then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  if p_target_status = 'published'
     or (v_round.results_status = 'locked' and p_target_status = 'calculated') then
    v_risk := 'R3';
    perform private.studio2_require_fresh_auth(300);
  end if;

  if v_round.results_status = 'locked'
     and p_target_status = 'calculated'
     and v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'televote.result.status.' || p_target_status,
    v_risk,
    jsonb_build_object(
      'solarisEditionId', p_solaris_edition_id,
      'roundId', p_round_id
    ),
    jsonb_build_object(
      'targetStatus', p_target_status,
      'expectedRoundVersion', p_expected_round_version,
      'expectedCalculationVersion', p_expected_calculation_version,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object(
      'ok', false,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true
    );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  v_current_round_version := private.v3_televote_result_round_version(p_round_id);
  if v_current_round_version is distinct from p_expected_round_version
     or v_round.calculation_version is distinct from p_expected_calculation_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  if p_target_status in ('locked','published') then
    if v_round.status <> 'closed'
       or v_round.calculation_version < 1
       or coalesce(v_round.results_outdated, false) then
      raise sqlstate 'PT409' using message = 'STATE_CHANGED';
    end if;

    select count(*)::integer
    into v_entry_count
    from televoting.round_entries entry
    where entry.round_id = p_round_id;

    select
      count(*)::integer,
      count(*) filter (
        where result_row.calculation_version = v_round.calculation_version
          and result_row.engine_version = v_round.televote_engine_version
      )::integer,
      coalesce(sum(result_row.final_points), 0)::bigint,
      coalesce(bool_and(result_row.final_points = 0), false)
    into v_result_count, v_current_result_count, v_points_total, v_all_zero
    from televoting.round_results result_row
    where result_row.round_id = p_round_id;

    if v_entry_count < 1
       or v_result_count <> v_entry_count
       or v_current_result_count <> v_entry_count
       or exists (
         select 1
         from televoting.round_results result_row
         where result_row.round_id = p_round_id
           and not exists (
             select 1 from televoting.round_entries entry
             where entry.round_id = p_round_id
               and entry.entry_key = result_row.country_code
           )
       )
       or (not v_all_zero and v_points_total <> v_round.total_points_to_distribute) then
      raise sqlstate 'PT409' using message = 'DEPENDENCY_FAILURE';
    end if;
  end if;

  update televoting.rounds
  set results_status = p_target_status,
      updated_at = now()
  where id = p_round_id;

  v_next_round_version := private.v3_televote_result_round_version(p_round_id);

  if p_target_status = 'published' then
    v_sync := private.v3_sync_published_televote_round(p_round_id);
    if not coalesce((v_sync ->> 'ok')::boolean, false)
       and coalesce(v_sync ->> 'status', '') <> 'waiting_for_combined' then
      raise sqlstate 'PT409' using message = 'DEPENDENCY_FAILURE';
    end if;
  end if;

  insert into televoting.admin_audit_log (
    actor_admin_id, actor_username, action, target_type, target_id, old_values, new_values, reason
  ) values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text),
    'v3_televote_results_' || p_target_status,
    'round',
    p_round_id::text,
    jsonb_build_object(
      'resultsStatus', v_round.results_status,
      'roundVersion', v_current_round_version,
      'calculationVersion', v_round.calculation_version
    ),
    jsonb_build_object(
      'resultsStatus', p_target_status,
      'roundVersion', v_next_round_version,
      'calculationVersion', v_round.calculation_version,
      'solarisSync', v_sync,
      'operationId', v_operation_id
    ),
    v_reason
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'solarisEditionId', p_solaris_edition_id,
    'roundId', p_round_id,
    'previousStatus', v_round.results_status,
    'resultsStatus', p_target_status,
    'previousRoundVersion', v_current_round_version,
    'roundVersion', v_next_round_version,
    'calculationVersion', v_round.calculation_version,
    'solarisSync', case
      when p_target_status = 'published' then v_sync
      else null
    end,
    'serverTime', now(),
    'replayed', false
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_televote_result_status(
  uuid, uuid, text, bigint, integer, text, uuid, text
) from public, anon;
grant execute on function televoting.studio2_apply_televote_result_status(
  uuid, uuid, text, bigint, integer, text, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
