begin;

-- System V3 / S6: measurable freshness for the Jury operational-readiness
-- projection. The projection is not asynchronously materialized: the canonical
-- read authority recomputes it from Jury evidence on every bounded read. A
-- successful independent verification therefore proves zero projection-storage
-- lag at that read. If verification is bounded out or detects drift, freshness
-- remains unknown rather than inventing a timestamp-derived estimate.
select public.v3_register_migration_contract(
  'v3.s6.jury-readiness-lag',
  1,
  'forward_fix_only',
  false,
  null,
  'Expose bounded executable Jury readiness freshness evidence for the synchronous canonical read projection.'
);

create or replace function public.studio2_measure_jury_operational_projection_lag(
  p_show_id uuid,
  p_voter_limit integer default 200,
  p_evidence_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $lag$
declare
  v_verification jsonb;
  v_state text;
  v_reason text;
begin
  v_verification := public.studio2_verify_jury_operational_projection(
    p_show_id,
    p_voter_limit,
    p_evidence_limit
  );
  v_state := v_verification ->> 'state';
  v_reason := v_verification ->> 'reason';

  if v_state = 'consistent' then
    return jsonb_build_object(
      'state', 'measured',
      'reason', 'synchronous_read_through',
      'freshnessModel', 'synchronous_read_through',
      'showId', p_show_id,
      'lagSeconds', 0,
      'verificationState', v_state,
      'verificationReason', v_reason,
      'measuredAt', now()
    );
  end if;

  return jsonb_build_object(
    'state', 'unknown',
    'reason', case
      when v_state = 'unknown' then 'verification_bound_exceeded'
      else 'verification_drift'
    end,
    'freshnessModel', 'synchronous_read_through',
    'showId', p_show_id,
    'lagSeconds', null,
    'verificationState', v_state,
    'verificationReason', v_reason,
    'issueCount', v_verification -> 'issueCount',
    'measuredAt', now()
  );
end
$lag$;

revoke all on function public.studio2_measure_jury_operational_projection_lag(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_measure_jury_operational_projection_lag(uuid, integer, integer)
  to service_role;

comment on function public.studio2_measure_jury_operational_projection_lag(uuid, integer, integer) is
  'S6 bounded Jury projection freshness metric. Reports zero lag only after independent verification of the synchronous canonical read; otherwise reports unknown.';

notify pgrst, 'reload schema';

commit;
