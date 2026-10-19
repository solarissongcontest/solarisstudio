begin;

-- Close the #674 preflight/compatibility edge cases found during exact-head
-- review. Any genuinely post-start/evidence-bearing change remains blocked;
-- allowed edits are R2. Televote-round structure is validated and an explicit
-- qualifiers:null clears the legacy qualifier_count fallback as well.
select public.v3_register_migration_contract(
  '20261019231600_v3_voting_config_preflight_risk_closure',
  1,
  'forward_fix_only',
  false,
  null,
  'Align allowed VotingConfig edits to R2, validate Televote rounds and keep legacy qualifier_count projection exact'
);

create or replace function private.v3_assert_voting_config_televote_round_shape(
  p_config jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate_rounds$
declare
  v_round jsonb;
  v_weight numeric;
  v_weight_sum numeric := 0;
  v_count integer := 0;
  v_ids text[] := '{}'::text[];
  v_id text;
begin
  if not (p_config ? 'televoteRounds') then
    return;
  end if;
  if jsonb_typeof(p_config -> 'televoteRounds') <> 'array'
     or jsonb_array_length(p_config -> 'televoteRounds') < 1
     or jsonb_array_length(p_config -> 'televoteRounds') > 2 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  for v_round in select value from jsonb_array_elements(p_config -> 'televoteRounds') loop
    v_count := v_count + 1;
    if jsonb_typeof(v_round) <> 'object'
       or not (v_round ? 'weight')
       or jsonb_typeof(v_round -> 'weight') <> 'number' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    v_weight := (v_round ->> 'weight')::numeric;
    if v_weight < 0 or v_weight > 100 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_weight_sum := v_weight_sum + v_weight;

    if v_round ? 'id' then
      if jsonb_typeof(v_round -> 'id') <> 'string' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_id := btrim(v_round ->> 'id');
      if v_id = '' or char_length(v_id) > 80 or v_id = any(v_ids) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_ids := array_append(v_ids, v_id);
    end if;

    if v_round ? 'label'
       and (jsonb_typeof(v_round -> 'label') <> 'string'
            or char_length(btrim(v_round ->> 'label')) > 120) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end loop;

  if abs(v_weight_sum - 100) > 0.0001 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
end
$validate_rounds$;

revoke all on function private.v3_assert_voting_config_televote_round_shape(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_guard_voting_config_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  perform private.v3_assert_voting_config_shape(coalesce(new.voting_config, '{}'::jsonb));
  perform private.v3_assert_voting_config_televote_round_shape(coalesce(new.voting_config, '{}'::jsonb));

  -- Keep the old relational qualifier_count projection exact for legacy
  -- readers. In particular, explicit qualifiers:null must not fall back to a
  -- stale integer left from an older config.
  if coalesce(new.voting_config, '{}'::jsonb) ? 'qualifiers' then
    if jsonb_typeof(new.voting_config -> 'qualifiers') = 'number' then
      new.qualifier_count := (new.voting_config ->> 'qualifiers')::integer;
    elsif jsonb_typeof(new.voting_config -> 'qualifiers') = 'null' then
      new.qualifier_count := null;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.voting_config is distinct from new.voting_config then
    perform private.v3_assert_voting_config_change_allowed(new.edition_id, new.id);
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_voting_config_write()
  from public, anon, authenticated;

create or replace function public.studio2_voting_config_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_proposed_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_evidence jsonb;
  v_changed boolean;
  v_blocked boolean;
  v_risk text;
begin
  perform private.v3_assert_voting_config_shape(p_proposed_config);
  perform private.v3_assert_voting_config_televote_round_shape(p_proposed_config);
  v_snapshot := public.studio2_voting_config_snapshot(p_edition_id, p_show_id);
  v_evidence := v_snapshot -> 'evidence';
  v_changed := (v_snapshot -> 'config') is distinct from p_proposed_config;
  v_blocked := v_changed and private.v3_voting_config_change_blocked(v_evidence);
  v_risk := case
    when not v_changed then 'R1'
    when v_blocked then 'blocked'
    else 'R2'
  end;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'expectedVersion', v_snapshot -> 'version',
    'changed', v_changed,
    'blocked', v_blocked,
    'riskClass', v_risk,
    'reasonRequired', false,
    'recalculationRequired', coalesce((v_evidence ->> 'resultCalculationVersion')::bigint, 0) > 0,
    'evidence', v_evidence,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.studio2_voting_config_preflight(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.studio2_voting_config_preflight(uuid, uuid, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
