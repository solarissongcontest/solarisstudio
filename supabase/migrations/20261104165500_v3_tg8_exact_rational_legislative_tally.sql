begin;

-- TG8 standalone server-side arithmetic foundation. This function does NOT
-- open votes, grant voting rights, cast ballots, certify official results, or
-- publish outcomes. It deliberately depends on no unmerged World tables.
-- Every production call must come from a later governed certification RPC.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg8.world-exact-legislative-vote-math',
      1,
      'forward_fix_only',
      false,
      null,
      'Add an isolated, non-public, integer-count/exact-numeric institutional legislative vote calculation primitive; no voting authority or publication enabled.'
    );
  end if;
end
$contract$;

create or replace function private.world_legislative_tally_v1(
  p_ayes bigint,
  p_nays bigint,
  p_abstentions bigint,
  p_eligible_electorate bigint,
  p_quorum_numerator bigint,
  p_quorum_denominator bigint,
  p_threshold_kind text,
  p_threshold_numerator bigint,
  p_threshold_denominator bigint,
  p_denominator_policy text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $tally$
declare
  v_cast numeric;
  v_denominator numeric;
  v_quorum_met boolean;
  v_threshold_met boolean;
begin
  -- Reject SQL NULLs rather than silently producing a potentially favorable
  -- three-valued-logic outcome.
  if p_ayes is null or p_nays is null or p_abstentions is null
     or p_eligible_electorate is null
     or p_quorum_numerator is null or p_quorum_denominator is null
     or p_threshold_kind is null or p_denominator_policy is null then
    raise exception 'World vote tally requires complete counts and configured rules'
      using errcode = '22023';
  end if;

  if p_ayes < 0 or p_nays < 0 or p_abstentions < 0
     or p_eligible_electorate < 0 then
    raise exception 'World vote counts and electorate must be nonnegative'
      using errcode = '22023';
  end if;

  -- Count conversion and every multiplication use exact NUMERIC, not float or
  -- overflow-prone bigint arithmetic.
  v_cast := p_ayes::numeric + p_nays::numeric + p_abstentions::numeric;
  if v_cast > p_eligible_electorate::numeric then
    raise exception 'World vote ballots exceed the frozen electorate'
      using errcode = '22023';
  end if;

  if p_quorum_numerator <= 0 or p_quorum_denominator <= 0
     or p_quorum_numerator > p_quorum_denominator then
    raise exception 'World vote quorum requires a fraction in (0,1]'
      using errcode = '22023';
  end if;

  -- This revision implements only the constitutionally specified legislative
  -- denominator: every cast ballot, INCLUDING abstentions. Unknown denominator
  -- policies must be configured and implemented explicitly before opening a vote.
  if p_denominator_policy <> 'all_cast_including_abstentions' then
    raise exception 'World vote denominator policy is not configured'
      using errcode = '22023';
  end if;

  if p_threshold_kind not in ('simple_majority', 'fraction', 'unanimity') then
    raise exception 'World vote threshold kind is not configured'
      using errcode = '22023';
  end if;

  if p_threshold_kind = 'fraction' then
    if p_threshold_numerator is null or p_threshold_denominator is null
       or p_threshold_numerator <= 0 or p_threshold_denominator <= 0
       or p_threshold_numerator > p_threshold_denominator then
      raise exception 'World vote fractional threshold must be in (0,1]'
        using errcode = '22023';
    end if;
  elsif p_threshold_numerator is not null or p_threshold_denominator is not null then
    raise exception 'World vote non-fractional rule must not contain a second threshold'
      using errcode = '22023';
  end if;

  v_denominator := v_cast;
  v_quorum_met := p_eligible_electorate > 0
    and v_cast * p_quorum_denominator::numeric
        >= p_eligible_electorate::numeric * p_quorum_numerator::numeric;

  -- An empty vote can never pass, including under a unanimous rule.
  v_threshold_met := false;
  if v_denominator > 0 then
    case p_threshold_kind
      when 'simple_majority' then
        v_threshold_met := p_ayes::numeric * 2 > v_denominator;
      when 'fraction' then
        v_threshold_met := p_ayes::numeric * p_threshold_denominator::numeric
                           >= v_denominator * p_threshold_numerator::numeric;
      when 'unanimity' then
        v_threshold_met := p_ayes::numeric = v_denominator;
    end case;
  end if;

  return jsonb_build_object(
    'eligibleElectorate', p_eligible_electorate,
    'castBallots', v_cast,
    'approvalDenominator', v_denominator,
    'ayeCount', p_ayes,
    'nayCount', p_nays,
    'abstainCount', p_abstentions,
    'quorumMet', v_quorum_met,
    'thresholdMet', v_threshold_met,
    'outcome', case
      when not v_quorum_met then 'no_quorum'
      when v_threshold_met then 'passed'
      else 'failed'
    end
  );
end
$tally$;

-- This is a private implementation primitive, NOT a browser callable vote API.
revoke all on function private.world_legislative_tally_v1(
  bigint,bigint,bigint,bigint,bigint,bigint,text,bigint,bigint,text
) from public, anon, authenticated, service_role;

comment on function private.world_legislative_tally_v1(
  bigint,bigint,bigint,bigint,bigint,bigint,text,bigint,bigint,text
) is 'TG8 internal exact-rational legislative tally: caller must separately prove frozen electorate, unique country ballots, authorized snapshot/rule and certification lifecycle. Not an official result or publication command.';

commit;
