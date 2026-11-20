begin;

-- V3 / O7: current-main authority for Organizer corrections to official Jury
-- score rows. This consolidates the unmerged #1270 migration chain into one
-- semantic S13 migration rather than inserting stale October 19 history.
select public.v3_register_migration_contract(
  'v3.jury.vote-correction-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Organizer Jury score corrections with exact scope, replay-safe S2 operations, CAS, publication guards, Result invalidation and audit/event evidence.'
);

create table if not exists private.studio2_jury_correction_versions (
  show_id uuid not null references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  voter_key text not null check (char_length(voter_key) between 3 and 90),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (show_id, voter_key)
);

revoke all on table private.studio2_jury_correction_versions
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_voter_key(
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $key$
  select case
    when p_voter_id is not null then 'voter:' || p_voter_id::text
    when p_voter_entity_id is not null then 'entity:' || p_voter_entity_id::text
    when p_voter_country_id is not null then 'country:' || p_voter_country_id::text
    else null
  end
$key$;

revoke all on function private.studio2_jury_correction_voter_key(uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_vote_rows(
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $rows$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', vote.id,
        'points', vote.points,
        'receivingCountryId', vote.receiving_country_id,
        'receivingEntityId', vote.receiving_entity_id,
        'ballotSubmissionId', vote.ballot_submission_id
      ) order by vote.points desc, vote.id
    ),
    '[]'::jsonb
  )
  from public.jury_votes vote
  where vote.show_id = p_show_id
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
$rows$;

revoke all on function private.studio2_jury_correction_vote_rows(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_ballot_state(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $ballot$
  select coalesce((
    select jsonb_build_object(
      'id', submission.id,
      'status', submission.status,
      'reviewVersion', submission.review_version,
      'submittedAt', submission.submitted_at,
      'reviewedAt', submission.reviewed_at
    )
    from public.jury_ballot_submissions submission
    where submission.edition_id = p_edition_id
      and submission.show_id = p_show_id
      and (
        (p_voter_id is not null and submission.voter_id = p_voter_id)
        or (
          (p_voter_id is null or submission.voter_id is null)
          and p_voter_entity_id is not null
          and submission.voter_entity_id = p_voter_entity_id
        )
        or (
          (p_voter_id is null or submission.voter_id is null)
          and (p_voter_entity_id is null or submission.voter_entity_id is null)
          and p_voter_country_id is not null
          and submission.voter_country_id = p_voter_country_id
        )
      )
    order by submission.submitted_at desc, submission.id desc
    limit 1
  ), 'null'::jsonb)
$ballot$;

revoke all on function private.studio2_jury_correction_ballot_state(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_is_dnv(
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $dnv$
  select exists (
    select 1
    from public.jury_ballot_statuses status
    where status.show_id = p_show_id
      and status.status = 'did_not_vote'
      and (
        (p_voter_id is not null and status.voter_id = p_voter_id)
        or (
          p_voter_id is null
          and p_voter_entity_id is not null
          and status.voter_id is null
          and status.voter_entity_id = p_voter_entity_id
        )
        or (
          p_voter_id is null
          and p_voter_entity_id is null
          and p_voter_country_id is not null
          and status.voter_id is null
          and status.voter_entity_id is null
          and status.voter_country_id = p_voter_country_id
        )
      )
  )
$dnv$;

revoke all on function private.studio2_jury_correction_is_dnv(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_state_hash(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private
as $state_hash$
  select private.studio2_request_fingerprint(
    'jury.vote.correction.state',
    'R0',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'voterKey', private.studio2_jury_correction_voter_key(
        p_voter_id, p_voter_country_id, p_voter_entity_id
      )
    ),
    jsonb_build_object(
      'votes', private.studio2_jury_correction_vote_rows(
        p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
      ),
      'ballot', private.studio2_jury_correction_ballot_state(
        p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
      ),
      'didNotVote', private.studio2_jury_correction_is_dnv(
        p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
      )
    )
  )
$state_hash$;

revoke all on function private.studio2_jury_correction_state_hash(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_results_protected(
  p_show_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $protected$
  select coalesce((
    select
      exists (
        select 1
        from public.studio2_result_operations operation
        where operation.show_id = show_row.id
          and (
            operation.locked_version is not null
            or operation.reveal_ready_version is not null
          )
      )
      or exists (
        select 1
        from public.studio2_show_publication_controls control
        where control.show_id = show_row.id
          and control.state in ('scheduled', 'public')
          and private.studio2_publication_has_outcomes(control.frozen_config)
      )
      or (
        coalesce(show_row.published, false)
        and (
          case
            when show_row.publication_config is null
              or jsonb_typeof(show_row.publication_config) <> 'object'
              or not (
                show_row.publication_config ? 'participants'
                or show_row.publication_config ? 'artists'
                or show_row.publication_config ? 'songs'
                or show_row.publication_config ? 'semi_split'
                or show_row.publication_config ? 'running_order'
                or show_row.publication_config ? 'qualifiers'
                or show_row.publication_config ? 'results'
                or show_row.publication_config ? 'jury_results'
                or show_row.publication_config ? 'televote_results'
                or show_row.publication_config ? 'detailed_voting'
              )
            then true
            else (
              show_row.publication_config -> 'qualifiers' = 'true'::jsonb
              or show_row.publication_config -> 'results' = 'true'::jsonb
              or show_row.publication_config -> 'jury_results' = 'true'::jsonb
              or show_row.publication_config -> 'detailed_voting' = 'true'::jsonb
            )
          end
        )
      )
    from public.shows show_row
    where show_row.id = p_show_id
  ), false)
$protected$;

revoke all on function private.studio2_jury_correction_results_protected(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_target_valid(
  p_edition_id uuid,
  p_show_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $target$
  select exists (
    select 1
    from public.participants participant
    where participant.edition_id = p_edition_id
      and participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
      and (
        (p_receiving_entity_id is not null and participant.contest_entity_id = p_receiving_entity_id)
        or (
          p_receiving_entity_id is null
          and p_receiving_country_id is not null
          and participant.country_id = p_receiving_country_id
        )
      )
  )
$target$;

revoke all on function private.studio2_jury_correction_target_valid(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_points_valid(
  p_show_id uuid,
  p_points integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $points$
  select coalesce((
    select case
      when jsonb_typeof(show_row.voting_config -> 'juryPoints') = 'array'
           and jsonb_array_length(show_row.voting_config -> 'juryPoints') > 0
      then exists (
        select 1
        from jsonb_array_elements_text(show_row.voting_config -> 'juryPoints') configured(value)
        where configured.value ~ '^-?[0-9]+$'
          and configured.value::integer = p_points
      )
      else p_points = any(array[12,10,8,7,6,5,4,3,2,1])
    end
    from public.shows show_row
    where show_row.id = p_show_id
  ), false)
$points$;

revoke all on function private.studio2_jury_correction_points_valid(uuid,integer)
  from public, anon, authenticated;

create or replace function private.studio2_jury_correction_assert_available(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $assert$
declare
  v_ballot jsonb;
begin
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

  if p_action not in ('assign', 'clear') then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  if private.studio2_jury_correction_is_dnv(
    p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  ) then
    raise exception 'STATE_CHANGED' using
      errcode = 'P0001',
      hint = 'Restore this did-not-vote Jury requirement before correcting score rows.';
  end if;

  v_ballot := private.studio2_jury_correction_ballot_state(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  if jsonb_typeof(v_ballot) = 'object'
     and v_ballot ->> 'status' in ('invalidated', 'superseded') then
    raise exception 'STATE_CHANGED' using
      errcode = 'P0001',
      hint = 'Restore or replace the canonical Jury ballot submission before correcting its score rows.';
  end if;

  if p_action = 'assign' then
    if p_points is null
       or (p_receiving_country_id is null and p_receiving_entity_id is null) then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    if not private.studio2_jury_correction_target_valid(
      p_edition_id, p_show_id, p_receiving_country_id, p_receiving_entity_id
    ) then
      raise exception 'STATE_CHANGED' using
        errcode = 'P0001',
        hint = 'Jury correction target is not a confirmed participant in this show.';
    end if;
    if not private.studio2_jury_correction_points_valid(p_show_id, p_points) then
      raise exception 'VALIDATION' using
        errcode = '22023',
        hint = 'Point value is not configured for this show Jury.';
    end if;
    if (
      p_voter_entity_id is not null
      and p_receiving_entity_id is not null
      and p_voter_entity_id = p_receiving_entity_id
    ) or (
      p_voter_entity_id is null
      and p_receiving_entity_id is null
      and p_voter_country_id is not null
      and p_voter_country_id = p_receiving_country_id
    ) then
      raise exception 'VALIDATION' using
        errcode = '22023',
        hint = 'A Jury cannot assign points to its own entry.';
    end if;
  elsif p_points is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
end
$assert$;

revoke all on function private.studio2_jury_correction_assert_available(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer)
  from public, anon, authenticated;

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

create or replace function public.studio2_apply_jury_vote_correction(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer,
  p_reason text,
  p_expected_version bigint,
  p_expected_state_hash text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_voter_key text;
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_current_version bigint;
  v_next_version bigint;
  v_current_hash text;
  v_after_hash text;
  v_before_votes jsonb;
  v_after_votes jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_vote_id uuid;
  v_deleted integer := 0;
  v_result_rows_invalidated integer := 0;
  v_results_operation public.studio2_result_operations%rowtype;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION' using errcode = '42501';
  end if;
  if p_edition_id is null
     or p_show_id is null
     or p_action not in ('assign', 'clear')
     or p_points is null
     or (p_action = 'assign' and p_receiving_country_id is null and p_receiving_entity_id is null)
     or p_expected_version is null
     or p_expected_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_state_hash !~ '^[0-9a-f]{64}$'
     or v_reason is null
     or char_length(v_reason) < 5
     or char_length(v_reason) > 1000 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_voter_key := private.studio2_jury_correction_voter_key(
    p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  if v_voter_key is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'voterKey', v_voter_key
  );
  v_request := jsonb_strip_nulls(jsonb_build_object(
    'action', p_action,
    'voterId', p_voter_id,
    'voterCountryId', p_voter_country_id,
    'voterEntityId', p_voter_entity_id,
    'receivingCountryId', p_receiving_country_id,
    'receivingEntityId', p_receiving_entity_id,
    'points', p_points,
    'reason', v_reason,
    'expectedVersion', p_expected_version,
    'expectedStateHash', p_expected_state_hash
  ));

  -- Claim before mutable-state validation. Exact retries must replay a durable
  -- success even if ballot status, participation, DNV or publication state has
  -- changed since the original transaction committed.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    case when p_action = 'assign' then 'jury.vote.correct' else 'jury.vote.clear' end,
    'R2',
    v_scope,
    v_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return public.studio2_reconcile_operation((v_claim ->> 'operationId')::uuid);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || p_show_id::text, 0)
  );

  -- New operations revalidate every authorization and workflow invariant after
  -- acquiring the canonical Results serialization lock.
  perform private.studio2_jury_correction_assert_available(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id,
    p_action, p_receiving_country_id, p_receiving_entity_id, p_points
  );

  if not exists (
    select 1 from public.shows show_row
    where show_row.id = p_show_id and show_row.edition_id = p_edition_id
    for share
  ) then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  if private.studio2_jury_correction_results_protected(p_show_id) then
    raise exception 'STATE_CHANGED' using
      errcode = 'P0001',
      hint = 'Locked, reveal-ready, scheduled or public Results must be corrected through the Results correction lifecycle.';
  end if;

  insert into private.studio2_jury_correction_versions (
    show_id, edition_id, voter_key, version, updated_by
  ) values (
    p_show_id, p_edition_id, v_voter_key, 0, v_actor
  )
  on conflict (show_id, voter_key) do nothing;

  select correction.version
  into v_current_version
  from private.studio2_jury_correction_versions correction
  where correction.show_id = p_show_id
    and correction.edition_id = p_edition_id
    and correction.voter_key = v_voter_key
  for update;

  if v_current_version is null then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  v_current_hash := private.studio2_jury_correction_state_hash(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  if v_current_version is distinct from p_expected_version
     or v_current_hash is distinct from p_expected_state_hash then
    raise exception 'VERSION_CONFLICT' using
      errcode = 'P0001',
      detail = jsonb_build_object(
        'expectedVersion', p_expected_version,
        'currentVersion', v_current_version,
        'expectedStateHash', p_expected_state_hash,
        'currentStateHash', v_current_hash
      )::text;
  end if;

  select operation.*
  into v_results_operation
  from public.studio2_result_operations operation
  where operation.show_id = p_show_id
  for update;

  v_before_votes := private.studio2_jury_correction_vote_rows(
    p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );

  if p_action = 'assign' then
    v_vote_id := public.assign_jury_vote(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_receiving_country_id,
      p_receiving_entity_id,
      p_points
    );
  else
    v_deleted := public.clear_jury_point(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_points
    );
  end if;

  -- Only the mutable current Result materialization is invalidated. Immutable
  -- result-version snapshots remain historical truth and are never rewritten.
  if coalesce(v_results_operation.calculation_version, 0) > 0 then
    delete from public.results result
    where result.show_id = p_show_id
      and result.edition_id = p_edition_id;
    get diagnostics v_result_rows_invalidated = row_count;

    update public.studio2_result_operations
    set reviewed_version = null,
        reviewed_at = null,
        reviewed_by = null,
        locked_version = null,
        locked_at = null,
        locked_by = null,
        reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id;
  end if;

  v_next_version := v_current_version + 1;
  update private.studio2_jury_correction_versions
  set version = v_next_version,
      updated_at = now(),
      updated_by = v_actor
  where show_id = p_show_id
    and edition_id = p_edition_id
    and voter_key = v_voter_key;

  v_after_votes := private.studio2_jury_correction_vote_rows(
    p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_after_hash := private.studio2_jury_correction_state_hash(
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id
  );

  v_event_id := private.v3_emit_domain_event(
    'jury.ballot_changed',
    'jury_ballot',
    p_show_id::text || ':' || v_voter_key,
    v_next_version,
    p_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'showId', p_show_id,
      'voterKey', v_voter_key,
      'changeKind', case when p_action = 'assign' then 'score_corrected' else 'score_cleared' end,
      'points', p_points,
      'receivingCountryId', p_receiving_country_id,
      'receivingEntityId', p_receiving_entity_id,
      'beforeVersion', v_current_version,
      'version', v_next_version,
      'resultsRecalculationRequired', coalesce(v_results_operation.calculation_version, 0) > 0,
      'invalidatedResultRows', v_result_rows_invalidated
    )),
    1,
    array['jury.tasks']::text[]
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    v_actor,
    case when p_action = 'assign' then 'jury.vote.correct' else 'jury.vote.clear' end,
    'jury_votes',
    p_show_id::text || ':' || v_voter_key,
    p_edition_id,
    jsonb_build_object(
      'version', v_current_version,
      'stateHash', v_current_hash,
      'votes', v_before_votes,
      'operationId', p_operation_id,
      'reason', v_reason
    ),
    jsonb_build_object(
      'version', v_next_version,
      'stateHash', v_after_hash,
      'votes', v_after_votes,
      'operationId', p_operation_id,
      'eventId', v_event_id,
      'reason', v_reason,
      'resultsRecalculationRequired', coalesce(v_results_operation.calculation_version, 0) > 0,
      'invalidatedResultRows', v_result_rows_invalidated
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'command', case when p_action = 'assign' then 'jury.vote.correct' else 'jury.vote.clear' end,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'correlationId', coalesce(p_correlation_id, p_operation_id),
    'editionId', p_edition_id,
    'showId', p_show_id,
    'voterKey', v_voter_key,
    'version', v_next_version,
    'stateHash', v_after_hash,
    'stateVersion', v_next_version::text || ':' || v_after_hash,
    'voteId', v_vote_id,
    'deletedRows', v_deleted,
    'votes', v_after_votes,
    'eventId', v_event_id,
    'resultsRecalculationRequired', coalesce(v_results_operation.calculation_version, 0) > 0,
    'invalidatedResultRows', v_result_rows_invalidated,
    'serverTime', now(),
    'replayed', false
  );

  return private.studio2_complete_operation(p_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_jury_vote_correction(
  uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer,text,bigint,text,uuid,text,uuid
) from public, anon;
grant execute on function public.studio2_apply_jury_vote_correction(
  uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer,text,bigint,text,uuid,text,uuid
) to authenticated;

comment on function public.studio2_jury_vote_correction_preview(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer) is
  'V3 Organizer Jury correction preflight: exact scope, current assignment, structured blockers, CAS version/hash and Result consequence preview.';
comment on function public.studio2_apply_jury_vote_correction(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer,text,bigint,text,uuid,text,uuid) is
  'V3 authoritative Organizer Jury score correction: replay-first S2 claim, jury.ballots.manage, R2 idempotency, optimistic concurrency, atomic vote mutation, mutable Result invalidation, audit and canonical Jury event.';

notify pgrst, 'reload schema';

commit;
