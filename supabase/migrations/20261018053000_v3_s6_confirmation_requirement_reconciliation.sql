begin;

-- System V3 S6: bounded independent verification for the canonical
-- Confirmation requirement state.
--
-- IMPORTANT: studio2_confirmation_requirements is part of the Confirmation
-- canonical write model, not a disposable projection. Recovery must therefore
-- never rewrite it merely to make a projection green. The existing private
-- per-country reconciler remains an incremental domain invariant attached to
-- canonical submission writes; this migration deliberately adds no bulk repair
-- function. It adds only a service-only, read-only verifier so drift can be
-- surfaced explicitly without mutating canonical truth.

create or replace function public.studio2_verify_confirmation_requirements(
  p_edition_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $verify$
declare
  v_country_id uuid;
  v_requirement public.studio2_confirmation_requirements%rowtype;
  v_submission public.submissions%rowtype;
  v_total integer := 0;
  v_checked integer := 0;
  v_expected_status text;
  v_expected_resolved_at timestamptz;
  v_drift jsonb := '[]'::jsonb;
begin
  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Confirmation verification edition not found'
      using errcode = 'P0002';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Confirmation verification limit must be between 1 and 500'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_total
  from (
    select requirement.country_id
    from public.studio2_confirmation_requirements requirement
    where requirement.edition_id = p_edition_id
      and requirement.superseded_at is null

    union

    select private.studio2_confirmation_country_id(submission.country) as country_id
    from public.submissions submission
    where submission.edition_id = p_edition_id
  ) candidate
  where candidate.country_id is not null;

  if v_total > p_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'verification_limit_exceeded',
      'editionId', p_edition_id,
      'totalCandidates', v_total,
      'verificationLimit', p_limit,
      'checked', 0,
      'drift', '[]'::jsonb
    );
  end if;

  for v_country_id in
    select candidate.country_id
    from (
      select requirement.country_id
      from public.studio2_confirmation_requirements requirement
      where requirement.edition_id = p_edition_id
        and requirement.superseded_at is null

      union

      select private.studio2_confirmation_country_id(submission.country) as country_id
      from public.submissions submission
      where submission.edition_id = p_edition_id
    ) candidate
    where candidate.country_id is not null
    order by candidate.country_id
  loop
    v_checked := v_checked + 1;
    v_requirement := null;
    v_submission := null;

    select *
    into v_requirement
    from public.studio2_confirmation_requirements requirement
    where requirement.edition_id = p_edition_id
      and requirement.country_id = v_country_id
      and requirement.superseded_at is null
    limit 1;

    if v_requirement.id is not null then
      select submission.*
      into v_submission
      from public.submissions submission
      where submission.edition_id = p_edition_id
        and private.studio2_confirmation_country_id(submission.country) = v_country_id
        and coalesce(submission.updated_at, submission.submitted_at) >= v_requirement.valid_from
      order by
        coalesce(submission.updated_at, submission.submitted_at) desc,
        submission.submitted_at desc,
        submission.id desc
      limit 1;
    else
      select submission.*
      into v_submission
      from public.submissions submission
      where submission.edition_id = p_edition_id
        and private.studio2_confirmation_country_id(submission.country) = v_country_id
      order by
        coalesce(submission.updated_at, submission.submitted_at) desc,
        submission.submitted_at desc,
        submission.id desc
      limit 1;
    end if;

    if v_requirement.id is null then
      if v_submission.id is not null then
        v_drift := v_drift || jsonb_build_array(jsonb_build_object(
          'countryId', v_country_id,
          'kind', 'missing_requirement',
          'submissionId', v_submission.id
        ));
      end if;
      continue;
    end if;

    -- Explicit invalidation is canonical lifecycle state. The existing domain
    -- reconciler intentionally refuses to resolve it implicitly, so verification
    -- must not misclassify it as projection drift.
    if v_requirement.status = 'invalidated' then
      continue;
    end if;

    if v_submission.id is not null then
      v_expected_status := case when v_submission.participating then 'satisfied' else 'waived' end;
      v_expected_resolved_at := coalesce(v_submission.updated_at, v_submission.submitted_at);

      if v_requirement.status is distinct from v_expected_status
         or v_requirement.resolved_by_submission_id is distinct from v_submission.id
         or v_requirement.resolved_at is distinct from v_expected_resolved_at then
        v_drift := v_drift || jsonb_build_array(jsonb_build_object(
          'countryId', v_country_id,
          'kind', 'resolution_mismatch',
          'requirementId', v_requirement.id,
          'submissionId', v_submission.id,
          'currentStatus', v_requirement.status,
          'expectedStatus', v_expected_status,
          'currentSubmissionId', v_requirement.resolved_by_submission_id,
          'expectedResolvedAt', v_expected_resolved_at
        ));
      end if;
    elsif v_requirement.status in ('satisfied', 'waived')
          and v_requirement.resolved_by_submission_id is not null then
      -- Legacy already-confirmed requirements can legitimately be satisfied
      -- without a retained submission id. Only a stale concrete resolution is
      -- reportable from current canonical submission evidence.
      v_drift := v_drift || jsonb_build_array(jsonb_build_object(
        'countryId', v_country_id,
        'kind', 'stale_resolution',
        'requirementId', v_requirement.id,
        'currentSubmissionId', v_requirement.resolved_by_submission_id
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'state', case when jsonb_array_length(v_drift) = 0 then 'consistent' else 'drift' end,
    'editionId', p_edition_id,
    'totalCandidates', v_total,
    'verificationLimit', p_limit,
    'checked', v_checked,
    'driftCount', jsonb_array_length(v_drift),
    'drift', v_drift
  );
end
$verify$;

revoke all on function public.studio2_verify_confirmation_requirements(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_confirmation_requirements(uuid, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;