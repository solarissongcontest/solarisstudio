begin;

select public.v3_register_migration_contract(
  '20261019223100_v3_jury_correction_preflight_blockers',
  1,
  'forward_fix_only',
  false,
  null,
  'Expose structured Organizer Jury correction blockers and exact current score assignment before commit'
);

create or replace function public.studio2_jury_vote_correction_preview(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_receiving_country_id uuid default null,
  p_receiving_entity_id uuid default null,
  p_points integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_actor uuid := auth.uid();
  v_voter_key text;
  v_version bigint := 0;
  v_hash text;
  v_ballot jsonb;
  v_results public.studio2_result_operations%rowtype;
  v_results_protected boolean;
  v_blockers jsonb := '[]'::jsonb;
  v_current_assignment jsonb := 'null'::jsonb;
  v_is_dnv boolean;
  v_self_vote boolean := false;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION' using errcode = '42501';
  end if;
  if p_edition_id is null or p_show_id is null or p_action not in ('assign', 'clear') then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_points is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_action = 'assign'
     and p_receiving_country_id is null
     and p_receiving_entity_id is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_voter_key := private.studio2_jury_correction_voter_key(
    p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  if v_voter_key is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- Identity and capability failures remain hard authorization/scope errors.
  -- Workflow/integrity conditions below are returned as explicit blockers so
  -- Organizer can explain the valid next action before a commit is attempted.
  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    case when p_action = 'assign' then p_receiving_country_id else null end,
    case when p_action = 'assign' then p_receiving_entity_id else null end,
    null
  );
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shows show_row
    where show_row.id = p_show_id and show_row.edition_id = p_edition_id
  ) then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  select correction.version
  into v_version
  from private.studio2_jury_correction_versions correction
  where correction.show_id = p_show_id
    and correction.edition_id = p_edition_id
    and correction.voter_key = v_voter_key;
  v_version := coalesce(v_version, 0);

  v_hash := private.studio2_jury_correction_state_hash(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_ballot := private.studio2_jury_correction_ballot_state(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_is_dnv := private.studio2_jury_correction_is_dnv(
    p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_results_protected := private.studio2_jury_correction_results_protected(p_show_id);

  select operation.* into v_results
  from public.studio2_result_operations operation
  where operation.show_id = p_show_id;

  select jsonb_build_object(
    'id', vote.id,
    'points', vote.points,
    'receivingCountryId', vote.receiving_country_id,
    'receivingEntityId', vote.receiving_entity_id,
    'ballotSubmissionId', vote.ballot_submission_id
  )
  into v_current_assignment
  from public.jury_votes vote
  where vote.show_id = p_show_id
    and vote.points = p_points
    and (
      (p_voter_id is not null and vote.voter_id = p_voter_id)
      or (
        p_voter_id is null
        and p_voter_entity_id is not null
        and vote.voter_id is null
        and vote.voter_entity_id = p_voter_entity_id
      )
      or (
        p_voter_id is null
        and p_voter_entity_id is null
        and p_voter_country_id is not null
        and vote.voter_id is null
        and vote.voter_entity_id is null
        and vote.voter_country_id = p_voter_country_id
      )
    )
  order by vote.id
  limit 1;
  v_current_assignment := coalesce(v_current_assignment, 'null'::jsonb);

  if v_is_dnv then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'JURY_DID_NOT_VOTE',
      'message', 'Restore this did-not-vote Jury requirement before correcting score rows.'
    ));
  end if;

  if jsonb_typeof(v_ballot) = 'object'
     and (v_ballot ->> 'status') in ('invalidated', 'superseded') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'BALLOT_NOT_ACTIVE',
      'message', 'Restore or replace the canonical Jury ballot submission before correcting score rows.',
      'status', v_ballot ->> 'status'
    ));
  end if;

  if p_action = 'assign' then
    if not private.studio2_jury_correction_target_valid(
      p_edition_id, p_show_id, p_receiving_country_id, p_receiving_entity_id
    ) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'TARGET_NOT_IN_SHOW',
        'message', 'The requested receiver is not a confirmed participant in this show.'
      ));
    end if;

    if not private.studio2_jury_correction_points_valid(p_show_id, p_points) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'POINT_VALUE_NOT_CONFIGURED',
        'message', 'The requested score is not configured for this show Jury.'
      ));
    end if;

    v_self_vote := (
      p_voter_entity_id is not null
      and p_receiving_entity_id is not null
      and p_voter_entity_id = p_receiving_entity_id
    ) or (
      p_voter_entity_id is null
      and p_receiving_entity_id is null
      and p_voter_country_id is not null
      and p_voter_country_id = p_receiving_country_id
    );
    if v_self_vote then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code', 'SELF_VOTE',
        'message', 'A Jury cannot assign points to its own entry.'
      ));
    end if;
  end if;

  if v_results_protected then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'RESULTS_PROTECTED',
      'message', 'Locked, reveal-ready, scheduled or public Results require the Results correction lifecycle.'
    ));
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'voter', jsonb_strip_nulls(jsonb_build_object(
      'key', v_voter_key,
      'voterId', p_voter_id,
      'countryId', p_voter_country_id,
      'contestEntityId', p_voter_entity_id
    )),
    'ballot', v_ballot,
    'version', v_version,
    'stateHash', v_hash,
    'stateVersion', v_version::text || ':' || v_hash,
    'action', p_action,
    'currentPointAssignment', v_current_assignment,
    'requested', jsonb_strip_nulls(jsonb_build_object(
      'points', p_points,
      'receivingCountryId', p_receiving_country_id,
      'receivingEntityId', p_receiving_entity_id
    )),
    'currentVotes', private.studio2_jury_correction_vote_rows(
      p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
    ),
    'didNotVote', v_is_dnv,
    'blockers', v_blockers,
    'canApply', jsonb_array_length(v_blockers) = 0,
    'results', jsonb_build_object(
      'calculationVersion', coalesce(v_results.calculation_version, 0),
      'reviewedVersion', v_results.reviewed_version,
      'lockedVersion', v_results.locked_version,
      'revealReadyVersion', v_results.reveal_ready_version,
      'protected', v_results_protected,
      'recalculationRequiredIfApplied', coalesce(v_results.calculation_version, 0) > 0
    ),
    'riskClass', 'R2',
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_jury_vote_correction_preview(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer)
  from public, anon;
grant execute on function public.studio2_jury_vote_correction_preview(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
