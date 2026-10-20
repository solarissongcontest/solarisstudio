begin;

-- System V3 S6 Jury readiness verifier review hardening.
-- The recovery verifier must independently prove the projection and must bound
-- all evidence before invoking the canonical projection recomputation.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s6.jury-readiness-verifier-review-fix-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Bound all Jury vote evidence before projection recomputation and independently verify conflict/incomplete readiness inputs.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function public.studio2_verify_jury_operational_projection(
  p_show_id uuid,
  p_voter_limit integer default 200,
  p_evidence_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $verify$
declare
  v_config jsonb := '{}'::jsonb;
  v_jury_enabled boolean := true;
  v_jury_points_required integer := 10;
  v_expected_voters integer := 0;
  v_all_vote_rows integer := 0;
  v_vote_rows integer := 0;
  v_submission_rows integer := 0;
  v_pending_review integer := 0;
  v_invalidated integer := 0;
  v_status_rows integer := 0;
  v_dnv integer := 0;
  v_jury_conflicts integer := 0;
  v_jury_incomplete integer := 0;
  v_projection jsonb;
  v_expected_ready boolean;
  v_issues jsonb := '[]'::jsonb;
begin
  if p_show_id is null then
    raise exception 'Jury verification show not found' using errcode = 'P0002';
  end if;
  if p_voter_limit is null or p_voter_limit < 1 or p_voter_limit > 500 then
    raise exception 'Jury voter limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_evidence_limit is null or p_evidence_limit < 10 or p_evidence_limit > 10000 then
    raise exception 'Jury evidence limit must be between 10 and 10000' using errcode = '22023';
  end if;

  select coalesce(show_row.voting_config, '{}'::jsonb)
  into v_config
  from public.shows show_row
  where show_row.id = p_show_id;

  if not found then
    raise exception 'Jury verification show not found' using errcode = 'P0002';
  end if;

  v_jury_enabled := coalesce((v_config ->> 'juryEnabled')::boolean, true);
  v_jury_points_required := case
    when not v_jury_enabled then 0
    when jsonb_typeof(v_config -> 'juryPoints') = 'array'
      and jsonb_array_length(v_config -> 'juryPoints') > 0
      then jsonb_array_length(v_config -> 'juryPoints')
    else 10
  end;

  with expected as (
    select voter.id as voter_id
    from public.voters voter
    where voter.show_id = p_show_id

    union all

    select null::uuid as voter_id
    from public.participants participant
    where participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
      and not exists (
        select 1 from public.voters roster where roster.show_id = p_show_id
      )
  )
  select count(*)::integer
  into v_expected_voters
  from (
    select 1 from expected limit p_voter_limit + 1
  ) bounded_expected;

  if v_expected_voters > p_voter_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'verification_voter_bound_exceeded',
      'showId', p_show_id,
      'voterLimit', p_voter_limit,
      'evidenceLimit', p_evidence_limit,
      'observedVotersAtLeast', v_expected_voters,
      'issues', '[]'::jsonb
    );
  end if;

  -- Bound the complete vote relation first. Filtering invalid/superseded ballot
  -- rows before this check would allow pathological evidence to escape the
  -- verifier budget and then be scanned by studio2_result_preconditions().
  select count(*)::integer
  into v_all_vote_rows
  from (
    select 1
    from public.jury_votes vote
    where vote.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_votes;

  select
    count(*)::integer,
    count(*) filter (where bounded_submission.status in ('submitted', 'needs_review'))::integer,
    count(*) filter (where bounded_submission.status = 'invalidated')::integer
  into v_submission_rows, v_pending_review, v_invalidated
  from (
    select submission.status
    from public.jury_ballot_submissions submission
    where submission.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_submission;

  select
    count(*)::integer,
    count(*) filter (where bounded_status.status = 'did_not_vote')::integer
  into v_status_rows, v_dnv
  from (
    select status_row.status
    from public.jury_ballot_statuses status_row
    where status_row.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_status;

  if greatest(v_all_vote_rows, v_submission_rows, v_status_rows) > p_evidence_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'verification_evidence_bound_exceeded',
      'showId', p_show_id,
      'voterLimit', p_voter_limit,
      'evidenceLimit', p_evidence_limit,
      'observedVoteRowsAtLeast', v_all_vote_rows,
      'observedSubmissionRowsAtLeast', v_submission_rows,
      'observedStatusRowsAtLeast', v_status_rows,
      'issues', '[]'::jsonb
    );
  end if;

  -- The total vote relation is now proven bounded, so it is safe to derive the
  -- projection-compatible valid-vote count without hiding invalid ballot rows.
  select count(*)::integer
  into v_vote_rows
  from public.jury_votes vote
  where vote.show_id = p_show_id
    and (
      vote.ballot_submission_id is null
      or exists (
        select 1
        from public.jury_ballot_submissions submission
        where submission.id = vote.ballot_submission_id
          and submission.status = 'valid'
      )
    );

  -- Independently derive the two readiness inputs from bounded canonical
  -- ballot/DNV evidence. Do not reuse juryConflictCount/juryIncompleteCount from
  -- the projection that this verifier exists to check.
  if v_jury_enabled then
    with expected as (
      select voter.id as voter_id, voter.country_id, voter.contest_entity_id
      from public.voters voter
      where voter.show_id = p_show_id

      union all

      select null::uuid as voter_id, participant.country_id, participant.contest_entity_id
      from public.participants participant
      where participant.show_id = p_show_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and not exists (
          select 1 from public.voters roster where roster.show_id = p_show_id
        )
    )
    select
      count(*) filter (
        where exists (
          select 1
          from public.jury_ballot_statuses dnv
          where dnv.show_id = p_show_id
            and dnv.status = 'did_not_vote'
            and (
              (expected.voter_id is not null and dnv.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and dnv.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and dnv.voter_country_id = expected.country_id
              )
            )
        )
        and exists (
          select 1
          from public.jury_votes vote
          where vote.show_id = p_show_id
            and (
              (expected.voter_id is not null and vote.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and vote.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and vote.voter_country_id = expected.country_id
              )
            )
        )
      ),
      count(*) filter (
        where not exists (
          select 1
          from public.jury_ballot_statuses dnv
          where dnv.show_id = p_show_id
            and dnv.status = 'did_not_vote'
            and (
              (expected.voter_id is not null and dnv.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and dnv.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and dnv.voter_country_id = expected.country_id
              )
            )
        )
        and not (
          exists (
            select 1
            from public.jury_ballot_submissions submission
            where submission.show_id = p_show_id
              and submission.status = 'valid'
              and (
                (expected.voter_id is not null and submission.voter_id = expected.voter_id)
                or (
                  expected.voter_id is null
                  and expected.contest_entity_id is not null
                  and submission.voter_entity_id = expected.contest_entity_id
                )
                or (
                  expected.voter_id is null
                  and expected.contest_entity_id is null
                  and expected.country_id is not null
                  and submission.voter_country_id = expected.country_id
                )
              )
              and (
                select count(*)
                from public.jury_votes linked_vote
                where linked_vote.ballot_submission_id = submission.id
              ) >= v_jury_points_required
          )
          or (
            not exists (
              select 1
              from public.jury_ballot_submissions any_submission
              where any_submission.show_id = p_show_id
                and (
                  (expected.voter_id is not null and any_submission.voter_id = expected.voter_id)
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is not null
                    and any_submission.voter_entity_id = expected.contest_entity_id
                  )
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is null
                    and expected.country_id is not null
                    and any_submission.voter_country_id = expected.country_id
                  )
                )
            )
            and (
              select count(*)
              from public.jury_votes manual_vote
              where manual_vote.show_id = p_show_id
                and manual_vote.ballot_submission_id is null
                and (
                  (expected.voter_id is not null and manual_vote.voter_id = expected.voter_id)
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is not null
                    and manual_vote.voter_entity_id = expected.contest_entity_id
                  )
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is null
                    and expected.country_id is not null
                    and manual_vote.voter_country_id = expected.country_id
                  )
                )
            ) >= v_jury_points_required
          )
        )
      )
    into v_jury_conflicts, v_jury_incomplete
    from expected;
  end if;

  v_projection := private.studio2_result_preconditions(p_show_id);

  if (v_projection ->> 'juryEnabled')::boolean is distinct from v_jury_enabled then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_enabled_mismatch',
      'expected', v_jury_enabled,
      'actual', v_projection -> 'juryEnabled'
    ));
  end if;
  if (v_projection ->> 'juryRequiredPoints')::integer is distinct from v_jury_points_required then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_required_points_mismatch',
      'expected', v_jury_points_required,
      'actual', v_projection -> 'juryRequiredPoints'
    ));
  end if;
  if (v_projection ->> 'juryVoterCount')::integer is distinct from v_expected_voters then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_voter_count_mismatch',
      'expected', v_expected_voters,
      'actual', v_projection -> 'juryVoterCount'
    ));
  end if;
  if (v_projection ->> 'juryVoteRows')::integer is distinct from v_vote_rows then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_vote_row_count_mismatch',
      'expected', v_vote_rows,
      'actual', v_projection -> 'juryVoteRows'
    ));
  end if;
  if (v_projection ->> 'juryDnvCount')::integer is distinct from v_dnv then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_dnv_count_mismatch',
      'expected', v_dnv,
      'actual', v_projection -> 'juryDnvCount'
    ));
  end if;
  if (v_projection ->> 'juryPendingReviewCount')::integer is distinct from v_pending_review then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_pending_review_count_mismatch',
      'expected', v_pending_review,
      'actual', v_projection -> 'juryPendingReviewCount'
    ));
  end if;
  if (v_projection ->> 'juryInvalidatedCount')::integer is distinct from v_invalidated then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_invalidated_count_mismatch',
      'expected', v_invalidated,
      'actual', v_projection -> 'juryInvalidatedCount'
    ));
  end if;
  if (v_projection ->> 'juryConflictCount')::integer is distinct from v_jury_conflicts then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_conflict_count_mismatch',
      'expected', v_jury_conflicts,
      'actual', v_projection -> 'juryConflictCount'
    ));
  end if;
  if (v_projection ->> 'juryIncompleteCount')::integer is distinct from v_jury_incomplete then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_incomplete_count_mismatch',
      'expected', v_jury_incomplete,
      'actual', v_projection -> 'juryIncompleteCount'
    ));
  end if;

  v_expected_ready :=
    not v_jury_enabled
    or (
      v_expected_voters > 0
      and v_jury_conflicts = 0
      and v_jury_incomplete = 0
    );
  if (v_projection ->> 'juryReady')::boolean is distinct from v_expected_ready then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_readiness_mismatch',
      'expected', v_expected_ready,
      'actual', v_projection -> 'juryReady'
    ));
  end if;

  return jsonb_build_object(
    'state', case when jsonb_array_length(v_issues) = 0 then 'consistent' else 'drift' end,
    'reason', case when jsonb_array_length(v_issues) = 0 then 'verified' else 'canonical_read_mismatch' end,
    'showId', p_show_id,
    'voterLimit', p_voter_limit,
    'evidenceLimit', p_evidence_limit,
    'expectedVoters', v_expected_voters,
    'allVoteRows', v_all_vote_rows,
    'validVoteRows', v_vote_rows,
    'submissionRows', v_submission_rows,
    'statusRows', v_status_rows,
    'juryConflictCount', v_jury_conflicts,
    'juryIncompleteCount', v_jury_incomplete,
    'issueCount', jsonb_array_length(v_issues),
    'issues', v_issues,
    'projection', v_projection,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)
  to service_role;

comment on function public.studio2_verify_jury_operational_projection(uuid, integer, integer) is
  'S6 bounded independent Jury readiness verifier. Bounds all raw evidence before projection recomputation and independently derives readiness conflicts/incomplete state.';

notify pgrst, 'reload schema';

commit;
