begin;

-- System V3 / S6: bounded Jury operational-readiness reconciliation.
--
-- Jury ballots, DNV evidence, voter/participant rosters and the Jury window are
-- canonical state. The operational-readiness projection is derived state. Its
-- rebuild therefore means recomputing that read model from canonical truth, not
-- rewriting ballots or Results rows. The independent verifier below re-counts
-- bounded canonical evidence and checks the canonical readiness calculation.
--
-- S13 contract: forward-only, read-only recovery surface. No backfill, no
-- destructive phase and no automatic production invocation.
select public.v3_register_migration_contract(
  'v3.s6.jury-readiness-reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'Bounded read-only recomputation and verification of Jury operational readiness from canonical Jury evidence.'
);

create or replace function public.studio2_rebuild_jury_operational_projection(
  p_show_id uuid,
  p_voter_limit integer default 200,
  p_evidence_limit integer default 5000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $rebuild$
declare
  v_expected_voters integer := 0;
  v_vote_rows integer := 0;
  v_submission_rows integer := 0;
  v_status_rows integer := 0;
  v_projection jsonb;
begin
  if p_show_id is null
     or not exists (select 1 from public.shows show_row where show_row.id = p_show_id) then
    raise exception 'Jury reconciliation show not found' using errcode = 'P0002';
  end if;
  if p_voter_limit is null or p_voter_limit < 1 or p_voter_limit > 500 then
    raise exception 'Jury voter limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_evidence_limit is null or p_evidence_limit < 10 or p_evidence_limit > 10000 then
    raise exception 'Jury evidence limit must be between 10 and 10000' using errcode = '22023';
  end if;

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
      'reason', 'voter_bound_exceeded',
      'showId', p_show_id,
      'voterLimit', p_voter_limit,
      'evidenceLimit', p_evidence_limit,
      'observedVotersAtLeast', v_expected_voters,
      'projection', null
    );
  end if;

  select count(*)::integer
  into v_vote_rows
  from (
    select 1
    from public.jury_votes vote
    where vote.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_votes;

  select count(*)::integer
  into v_submission_rows
  from (
    select 1
    from public.jury_ballot_submissions submission
    where submission.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_submissions;

  select count(*)::integer
  into v_status_rows
  from (
    select 1
    from public.jury_ballot_statuses status_row
    where status_row.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_statuses;

  if greatest(v_vote_rows, v_submission_rows, v_status_rows) > p_evidence_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'evidence_bound_exceeded',
      'showId', p_show_id,
      'voterLimit', p_voter_limit,
      'evidenceLimit', p_evidence_limit,
      'voteRowsAtLeast', v_vote_rows,
      'submissionRowsAtLeast', v_submission_rows,
      'statusRowsAtLeast', v_status_rows,
      'projection', null
    );
  end if;

  -- Existing canonical read authority. No Jury or Results mutation occurs here.
  v_projection := private.studio2_result_preconditions(p_show_id);

  return jsonb_build_object(
    'state', 'recomputed',
    'reason', 'canonical_read_recompute',
    'showId', p_show_id,
    'voterLimit', p_voter_limit,
    'evidenceLimit', p_evidence_limit,
    'expectedVoters', v_expected_voters,
    'voteRows', v_vote_rows,
    'submissionRows', v_submission_rows,
    'statusRows', v_status_rows,
    'projection', v_projection,
    'generatedAt', now()
  );
end
$rebuild$;

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
  v_valid_vote_rows integer := 0;
  v_submission_rows integer := 0;
  v_pending_review integer := 0;
  v_invalidated integer := 0;
  v_status_rows integer := 0;
  v_dnv integer := 0;
  v_conflicts integer := 0;
  v_incomplete integer := 0;
  v_projection jsonb;
  v_expected_ready boolean;
  v_issues jsonb := '[]'::jsonb;
begin
  if p_show_id is null
     or not exists (select 1 from public.shows show_row where show_row.id = p_show_id) then
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

  -- Bound the complete vote relation BEFORE filtering invalid/superseded review
  -- evidence. Otherwise a show can hide arbitrarily many excluded rows behind a
  -- small valid subset and the verifier can still call the unbounded canonical
  -- preconditions function.
  select count(*)::integer
  into v_all_vote_rows
  from (
    select 1
    from public.jury_votes vote
    where vote.show_id = p_show_id
    limit p_evidence_limit + 1
  ) bounded_all_votes;

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
      'allVoteRowsAtLeast', v_all_vote_rows,
      'submissionRowsAtLeast', v_submission_rows,
      'statusRowsAtLeast', v_status_rows,
      'issues', '[]'::jsonb
    );
  end if;

  -- The total relation is now proven bounded, so calculate the valid-vote count
  -- used by the canonical Results-read projection without weakening the resource
  -- ceiling.
  select count(*)::integer
  into v_valid_vote_rows
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

  -- Independently reproduce the two readiness inputs from bounded canonical
  -- evidence. Do not derive expected readiness from the projection fields being
  -- verified; that would let a self-consistent but wrong projection pass.
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
    into v_conflicts, v_incomplete
    from expected;
  end if;

  -- Only after every canonical evidence relation used by preconditions is proven
  -- inside the diagnostic resource ceiling may the canonical projection run.
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
  if (v_projection ->> 'juryVoteRows')::integer is distinct from v_valid_vote_rows then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_vote_row_count_mismatch',
      'expected', v_valid_vote_rows,
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
  if (v_projection ->> 'juryConflictCount')::integer is distinct from v_conflicts then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_conflict_count_mismatch',
      'expected', v_conflicts,
      'actual', v_projection -> 'juryConflictCount'
    ));
  end if;
  if (v_projection ->> 'juryIncompleteCount')::integer is distinct from v_incomplete then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'jury_incomplete_count_mismatch',
      'expected', v_incomplete,
      'actual', v_projection -> 'juryIncompleteCount'
    ));
  end if;

  v_expected_ready :=
    not v_jury_enabled
    or (
      v_expected_voters > 0
      and v_conflicts = 0
      and v_incomplete = 0
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
    'validVoteRows', v_valid_vote_rows,
    'submissionRows', v_submission_rows,
    'statusRows', v_status_rows,
    'expectedConflictCount', v_conflicts,
    'expectedIncompleteCount', v_incomplete,
    'issueCount', jsonb_array_length(v_issues),
    'issues', v_issues,
    'projection', v_projection,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function public.studio2_rebuild_jury_operational_projection(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_rebuild_jury_operational_projection(uuid, integer, integer)
  to service_role;
grant execute on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)
  to service_role;

comment on function public.studio2_rebuild_jury_operational_projection(uuid, integer, integer) is
  'S6 bounded read-only recomputation of the Jury operational-readiness projection from canonical Jury evidence.';
comment on function public.studio2_verify_jury_operational_projection(uuid, integer, integer) is
  'S6 bounded independent consistency check for the Jury operational-readiness projection; bounds the complete evidence relations before canonical read-through and never mutates ballots or Results.';

notify pgrst, 'reload schema';

commit;
