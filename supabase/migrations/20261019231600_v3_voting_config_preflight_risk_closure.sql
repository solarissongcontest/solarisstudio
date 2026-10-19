begin;

-- Keep the #674 preflight risk contract aligned with the command boundary.
-- Any genuinely post-start/evidence-bearing change is blocked by the database
-- guard, so the only allowed consequential config edit is pre-voting R2 work.
select public.v3_register_migration_contract(
  '20261019231600_v3_voting_config_preflight_risk_closure',
  1,
  'forward_fix_only',
  false,
  null,
  'Align allowed VotingConfig edits to R2; post-start/evidence-bearing changes remain blocked rather than mislabeled R3'
);

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
