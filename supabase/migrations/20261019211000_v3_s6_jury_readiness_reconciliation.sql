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
  v_expected_voters integer := 0;
  v_vote_rows integer := 0;
  v_submission_rows integer := 0;
  v_pending_review integer := 0;
  v_invalidated integer := 0;
  v_status_rows integer := 0;
  v_dnv integer := 0;
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

  select count(*)::integer
  into v_vote_rows
  from (
    select 1
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
      )
    limit p_evidence_limit + 1
  ) bounded_valid_votes;

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

  if greatest(v_vote_rows, v_submission_rows, v_status_rows) > p_evidence_limit then
    return jsonb_build_object(
      'state', 'unknown',
      'reason', 'verification_evidence_bound_exceeded',
      'showId', p_show_id,
      'voterLimit', p_voter_limit,
      'evidenceLimit', p_evidence_limit,
      'issues', '[]'::jsonb
    );
  end if;

  v_projection := private.studio2_result_preconditions(p_show_id);

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

  v_expected_ready :=
    not coalesce((v_projection ->> 'juryEnabled')::boolean, true)
    or (
      v_expected_voters > 0
      and coalesce((v_projection ->> 'juryConflictCount')::integer, -1) = 0
      and coalesce((v_projection ->> 'juryIncompleteCount')::integer, -1) = 0
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
    'validVoteRows', v_vote_rows,
    'submissionRows', v_submission_rows,
    'statusRows', v_status_rows,
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
  'S6 bounded independent consistency check for the Jury operational-readiness projection; never mutates ballots or Results.';

notify pgrst, 'reload schema';

commit;
