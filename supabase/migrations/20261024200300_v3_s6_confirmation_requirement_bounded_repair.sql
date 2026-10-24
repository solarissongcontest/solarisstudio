begin;

-- System V3 / S6: bounded Confirmation requirement invariant repair.
--
-- studio2_confirmation_requirements is canonical Confirmation write state, not
-- a disposable projection. This recovery boundary therefore never writes that
-- table directly and never invents a later requirement generation. It only
-- delegates repairable edition/country invariants to the existing canonical
-- per-country reconciler created with the Confirmation requirement authority.
--
-- S13 contract: forward-only service recovery surface. No destructive phase,
-- bulk backfill, table rewrite, or automatic production invocation.
select public.v3_register_migration_contract(
  'v3.s6.confirmation-requirement-bounded-repair',
  1,
  'forward_fix_only',
  false,
  null,
  'S6 bounded Confirmation requirement invariant repair using the existing canonical per-country reconciler; unreconstructible lifecycle loss fails closed.'
);

create or replace function public.studio2_reconcile_confirmation_requirements(
  p_edition_id uuid,
  p_offset integer default 0,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $repair$
declare
  v_total integer := 0;
  v_country_id uuid;
  v_current_requirement_id uuid;
  v_historical_count integer := 0;
  v_processed integer := 0;
  v_reconciled integer := 0;
  v_canonical_recovery_required integer := 0;
  v_next_offset integer;
  v_outcomes jsonb := '[]'::jsonb;
  v_verification jsonb;
  v_state text;
begin
  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Confirmation repair edition not found'
      using errcode = 'P0002';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Confirmation repair offset must be zero or greater'
      using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Confirmation repair limit must be between 1 and 50'
      using errcode = '22023';
  end if;

  -- Include historical requirements as candidates too. A country whose current
  -- generation disappeared must not vanish from the recovery scan merely because
  -- it has no current submission row.
  select count(*)::integer
  into v_total
  from (
    select requirement.country_id
    from public.studio2_confirmation_requirements requirement
    where requirement.edition_id = p_edition_id

    union

    select private.studio2_confirmation_country_id(submission.country) as country_id
    from public.submissions submission
    where submission.edition_id = p_edition_id
  ) candidate
  where candidate.country_id is not null;

  -- Refuse an unexpectedly large edition before invoking any canonical writer.
  if v_total > 500 then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'repair_candidate_limit_exceeded',
      'editionId', p_edition_id,
      'offset', p_offset,
      'limit', p_limit,
      'totalCandidates', v_total,
      'repairCandidateLimit', 500,
      'processed', 0,
      'reconciled', 0,
      'canonicalRecoveryRequired', 0,
      'nextOffset', null,
      'complete', false,
      'outcomes', '[]'::jsonb
    );
  end if;

  for v_country_id in
    select candidate.country_id
    from (
      select requirement.country_id
      from public.studio2_confirmation_requirements requirement
      where requirement.edition_id = p_edition_id

      union

      select private.studio2_confirmation_country_id(submission.country) as country_id
      from public.submissions submission
      where submission.edition_id = p_edition_id
    ) candidate
    where candidate.country_id is not null
    order by candidate.country_id
    offset p_offset
    limit p_limit
  loop
    v_processed := v_processed + 1;
    v_current_requirement_id := null;
    v_historical_count := 0;

    select requirement.id
    into v_current_requirement_id
    from public.studio2_confirmation_requirements requirement
    where requirement.edition_id = p_edition_id
      and requirement.country_id = v_country_id
      and requirement.superseded_at is null
    limit 1;

    if v_current_requirement_id is null then
      select count(*)::integer
      into v_historical_count
      from public.studio2_confirmation_requirements requirement
      where requirement.edition_id = p_edition_id
        and requirement.country_id = v_country_id;

      -- A missing current requirement after historical generations is canonical
      -- lifecycle loss. Recovery must not infer max(generation)+1 or otherwise
      -- synthesize a reconfirmation generation from projection evidence.
      if v_historical_count > 0 then
        v_canonical_recovery_required := v_canonical_recovery_required + 1;
        v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
          'countryId', v_country_id,
          'state', 'canonical_recovery_required',
          'reason', 'missing_current_generation'
        ));
        continue;
      end if;
    end if;

    perform private.studio2_reconcile_confirmation_requirement(
      p_edition_id,
      v_country_id
    );
    v_reconciled := v_reconciled + 1;
    v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
      'countryId', v_country_id,
      'state', 'reconciled'
    ));
  end loop;

  v_next_offset := case
    when p_offset + v_processed < v_total then p_offset + v_processed
    else null
  end;

  -- Certification remains independent and read-only. It can report drift in
  -- unprocessed continuation pages or canonical recovery cases without hiding it.
  v_verification := public.studio2_verify_confirmation_requirements(
    p_edition_id,
    500
  );

  v_state := case
    when v_canonical_recovery_required > 0 then 'canonical_recovery_required'
    when v_next_offset is not null then 'continuation_required'
    when v_verification ->> 'state' = 'consistent' then 'consistent'
    else 'reconciliation_required'
  end;

  return jsonb_build_object(
    'state', v_state,
    'editionId', p_edition_id,
    'offset', p_offset,
    'limit', p_limit,
    'totalCandidates', v_total,
    'repairCandidateLimit', 500,
    'processed', v_processed,
    'reconciled', v_reconciled,
    'canonicalRecoveryRequired', v_canonical_recovery_required,
    'nextOffset', v_next_offset,
    'complete', v_next_offset is null,
    'outcomes', v_outcomes,
    'verification', v_verification
  );
end
$repair$;

revoke all on function public.studio2_reconcile_confirmation_requirements(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_reconcile_confirmation_requirements(uuid, integer, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
