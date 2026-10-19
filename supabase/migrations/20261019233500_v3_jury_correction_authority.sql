begin;

-- V3 System / Organizer Voting: authoritative manual Jury score correction.
--
-- The legacy assign_jury_vote / clear_jury_point RPCs already protect object
-- scope and jury.ballots.manage, but they are not a complete V3 command: there
-- is no preflight, caller-owned idempotency, optimistic state version, durable
-- receipt, fresh-auth review boundary, or deterministic relationship with the
-- versioned Results lifecycle.
--
-- This migration preserves those proven low-level writers and wraps them in one
-- governed correction authority. Legacy writers also advance the new ballot
-- revision, so a V3 preview cannot silently become stale while compatibility
-- callers still exist.

create table if not exists public.studio2_jury_ballot_revisions (
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null,
  voter_scope_key text not null check (length(voter_scope_key) between 3 and 96),
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (edition_id, show_id, voter_scope_key),
  constraint studio2_jury_ballot_revisions_show_scope_fk
    foreign key (show_id, edition_id)
    references public.shows(id, edition_id)
    on delete cascade
);

alter table public.studio2_jury_ballot_revisions enable row level security;
revoke all on table public.studio2_jury_ballot_revisions from public, anon, authenticated;
grant all on table public.studio2_jury_ballot_revisions to service_role;

create or replace function private.v3_jury_voter_scope_key(
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $body$
  select case
    when p_voter_id is not null then 'voter:' || p_voter_id::text
    when p_voter_entity_id is not null then 'entity:' || p_voter_entity_id::text
    when p_voter_country_id is not null then 'country:' || p_voter_country_id::text
    else null
  end
$body$;

revoke all on function private.v3_jury_voter_scope_key(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.v3_bump_jury_ballot_revision(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_key text := private.v3_jury_voter_scope_key(
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id
  );
  v_version bigint;
begin
  if p_edition_id is null or p_show_id is null or v_key is null then
    return 0;
  end if;

  insert into public.studio2_jury_ballot_revisions (
    edition_id, show_id, voter_scope_key, version, updated_at
  ) values (
    p_edition_id, p_show_id, v_key, 1, now()
  )
  on conflict (edition_id, show_id, voter_scope_key)
  do update set
    version = public.studio2_jury_ballot_revisions.version + 1,
    updated_at = now()
  returning version into v_version;

  return v_version;
end
$body$;

revoke all on function private.v3_bump_jury_ballot_revision(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Seed one starting revision for every existing show-scoped Jury voter identity.
insert into public.studio2_jury_ballot_revisions (
  edition_id, show_id, voter_scope_key, version
)
select distinct source.edition_id, source.show_id, source.voter_scope_key, 1
from (
  select
    vote.edition_id,
    vote.show_id,
    private.v3_jury_voter_scope_key(
      vote.voter_id,
      vote.voter_country_id,
      vote.voter_entity_id
    ) as voter_scope_key
  from public.jury_votes vote
  where vote.show_id is not null
  union
  select
    status.edition_id,
    status.show_id,
    private.v3_jury_voter_scope_key(
      status.voter_id,
      status.voter_country_id,
      status.voter_entity_id
    ) as voter_scope_key
  from public.jury_ballot_statuses status
  where status.show_id is not null
) source
where source.voter_scope_key is not null
on conflict (edition_id, show_id, voter_scope_key) do nothing;

create or replace function private.v3_track_jury_vote_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op <> 'INSERT' then
    v_old_key := private.v3_jury_voter_scope_key(
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_key := private.v3_jury_voter_scope_key(
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
    if tg_op = 'INSERT'
       or new.edition_id is distinct from old.edition_id
       or new.show_id is distinct from old.show_id
       or v_new_key is distinct from v_old_key then
      perform private.v3_bump_jury_ballot_revision(
        new.edition_id, new.show_id,
        new.voter_id, new.voter_country_id, new.voter_entity_id
      );
    elsif tg_op = 'UPDATE' then
      -- Same ballot aggregate, content changed.
      perform private.v3_bump_jury_ballot_revision(
        new.edition_id, new.show_id,
        new.voter_id, new.voter_country_id, new.voter_entity_id
      );
    end if;
  end if;

  return coalesce(new, old);
end
$body$;

revoke all on function private.v3_track_jury_vote_revision()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_track_jury_vote_revision on public.jury_votes;
create trigger v3_track_jury_vote_revision
after insert or update or delete on public.jury_votes
for each row execute function private.v3_track_jury_vote_revision();

create or replace function private.v3_track_jury_dnv_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op <> 'INSERT' then
    v_old_key := private.v3_jury_voter_scope_key(
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_key := private.v3_jury_voter_scope_key(
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
    if tg_op = 'INSERT'
       or new.edition_id is distinct from old.edition_id
       or new.show_id is distinct from old.show_id
       or v_new_key is distinct from v_old_key then
      perform private.v3_bump_jury_ballot_revision(
        new.edition_id, new.show_id,
        new.voter_id, new.voter_country_id, new.voter_entity_id
      );
    elsif tg_op = 'UPDATE' then
      perform private.v3_bump_jury_ballot_revision(
        new.edition_id, new.show_id,
        new.voter_id, new.voter_country_id, new.voter_entity_id
      );
    end if;
  end if;

  return coalesce(new, old);
end
$body$;

revoke all on function private.v3_track_jury_dnv_revision()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_track_jury_dnv_revision on public.jury_ballot_statuses;
create trigger v3_track_jury_dnv_revision
after insert or update or delete on public.jury_ballot_statuses
for each row execute function private.v3_track_jury_dnv_revision();

create or replace function private.v3_jury_correction_identity_matches(
  p_row_voter_id uuid,
  p_row_country_id uuid,
  p_row_entity_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $body$
  select case
    when p_voter_id is not null then p_row_voter_id = p_voter_id
    when p_voter_entity_id is not null then
      p_row_voter_id is null and p_row_entity_id = p_voter_entity_id
    when p_voter_country_id is not null then
      p_row_voter_id is null
      and p_row_entity_id is null
      and p_row_country_id = p_voter_country_id
    else false
  end
$body$;

revoke all on function private.v3_jury_correction_identity_matches(uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_jury_correction_preview(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_points integer,
  p_receiving_country_id uuid default null,
  p_receiving_entity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $body$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_show public.shows%rowtype;
  v_scope_key text := private.v3_jury_voter_scope_key(
    p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_revision bigint := 0;
  v_points jsonb;
  v_required_count integer;
  v_allow_self boolean;
  v_votes jsonb := '[]'::jsonb;
  v_vote_count integer := 0;
  v_replace_count integer := 0;
  v_projected_vote_count integer := 0;
  v_dnv jsonb;
  v_submission jsonb;
  v_result public.studio2_result_operations%rowtype;
  v_result_rows integer := 0;
  v_publication public.studio2_show_publication_controls%rowtype;
  v_legacy_results_public boolean := false;
  v_public_results boolean := false;
  v_scheduled_results boolean := false;
  v_can_recalculate boolean := false;
  v_blockers text[] := array[]::text[];
  v_can_apply boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or v_scope_key is null
     or v_action not in ('assign', 'clear') or p_points is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select show_row.* into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;
  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    case when v_action = 'assign' then p_receiving_country_id else null end,
    case when v_action = 'assign' then p_receiving_entity_id else null end,
    null
  );

  -- Explicit roster voters are already proven by the object-scope guard. For
  -- an implicit legacy voter, require the voter identity to be a confirmed
  -- participant in this exact show rather than accepting any edition country.
  if p_voter_id is null and not exists (
    select 1
    from public.participants participant
    where participant.edition_id = p_edition_id
      and participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
      and (
        (p_voter_entity_id is not null and participant.contest_entity_id = p_voter_entity_id)
        or (
          p_voter_entity_id is null
          and p_voter_country_id is not null
          and participant.country_id = p_voter_country_id
        )
      )
  ) then
    v_blockers := array_append(v_blockers, 'VOTER_NOT_IN_SHOW');
  end if;

  v_points := coalesce(
    v_show.voting_config -> 'juryPoints',
    '[12,10,8,7,6,5,4,3,2,1]'::jsonb
  );
  if jsonb_typeof(v_points) <> 'array' or jsonb_array_length(v_points) < 1 then
    raise exception using errcode = '23514', message = 'JURY_POINT_SCALE_INVALID';
  end if;
  v_required_count := jsonb_array_length(v_points);
  v_allow_self := coalesce((v_show.voting_config ->> 'allowSelfVote')::boolean, false);

  if coalesce((v_show.voting_config ->> 'juryEnabled')::boolean, true) is not true then
    v_blockers := array_append(v_blockers, 'JURY_DISABLED');
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(v_points) point
    where point.value::integer = p_points
  ) then
    v_blockers := array_append(v_blockers, 'POINT_NOT_IN_SCALE');
  end if;

  if v_action = 'assign' then
    if p_receiving_country_id is null and p_receiving_entity_id is null then
      v_blockers := array_append(v_blockers, 'RECIPIENT_REQUIRED');
    elsif not exists (
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
    ) then
      v_blockers := array_append(v_blockers, 'RECIPIENT_NOT_IN_SHOW');
    end if;

    if not v_allow_self and (
      (p_voter_entity_id is not null and p_receiving_entity_id = p_voter_entity_id)
      or (
        p_voter_country_id is not null
        and p_receiving_country_id = p_voter_country_id
      )
    ) then
      v_blockers := array_append(v_blockers, 'SELF_VOTE_NOT_ALLOWED');
    end if;
  end if;

  select coalesce(revision.version, 0)
  into v_revision
  from public.studio2_jury_ballot_revisions revision
  where revision.edition_id = p_edition_id
    and revision.show_id = p_show_id
    and revision.voter_scope_key = v_scope_key;
  v_revision := coalesce(v_revision, 0);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', vote.id,
      'points', vote.points,
      'receivingCountryId', vote.receiving_country_id,
      'receivingEntityId', vote.receiving_entity_id,
      'ballotSubmissionId', vote.ballot_submission_id,
      'createdAt', vote.created_at
    ) order by vote.points desc, vote.id
  ), '[]'::jsonb), count(*)::integer
  into v_votes, v_vote_count
  from public.jury_votes vote
  where vote.edition_id = p_edition_id
    and vote.show_id = p_show_id
    and private.v3_jury_correction_identity_matches(
      vote.voter_id,
      vote.voter_country_id,
      vote.voter_entity_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id
    );

  if v_action = 'assign' then
    select count(*)::integer into v_replace_count
    from public.jury_votes vote
    where vote.edition_id = p_edition_id
      and vote.show_id = p_show_id
      and private.v3_jury_correction_identity_matches(
        vote.voter_id,
        vote.voter_country_id,
        vote.voter_entity_id,
        p_voter_id,
        p_voter_country_id,
        p_voter_entity_id
      )
      and (
        vote.points = p_points
        or (
          p_receiving_entity_id is not null
          and vote.receiving_entity_id = p_receiving_entity_id
        )
        or (
          p_receiving_entity_id is null
          and p_receiving_country_id is not null
          and vote.receiving_entity_id is null
          and vote.receiving_country_id = p_receiving_country_id
        )
      );
    v_projected_vote_count := v_vote_count - v_replace_count + 1;
  else
    select count(*)::integer into v_replace_count
    from public.jury_votes vote
    where vote.edition_id = p_edition_id
      and vote.show_id = p_show_id
      and vote.points = p_points
      and private.v3_jury_correction_identity_matches(
        vote.voter_id,
        vote.voter_country_id,
        vote.voter_entity_id,
        p_voter_id,
        p_voter_country_id,
        p_voter_entity_id
      );
    v_projected_vote_count := v_vote_count - v_replace_count;
    if v_replace_count = 0 then
      v_blockers := array_append(v_blockers, 'POINT_NOT_ASSIGNED');
    end if;
  end if;

  select jsonb_build_object(
    'id', status.id,
    'status', status.status,
    'note', status.note,
    'version', status.version,
    'updatedAt', status.updated_at
  ) into v_dnv
  from public.jury_ballot_statuses status
  where status.edition_id = p_edition_id
    and status.show_id = p_show_id
    and status.status = 'did_not_vote'
    and private.v3_jury_correction_identity_matches(
      status.voter_id,
      status.voter_country_id,
      status.voter_entity_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id
    )
  order by status.updated_at desc
  limit 1;

  if v_dnv is not null then
    v_blockers := array_append(v_blockers, 'BALLOT_MARKED_DID_NOT_VOTE');
  end if;

  select jsonb_build_object(
    'id', ballot.id,
    'status', ballot.status,
    'reviewVersion', ballot.review_version,
    'submittedAt', ballot.submitted_at,
    'updatedAt', ballot.updated_at
  ) into v_submission
  from public.jury_ballot_submissions ballot
  where ballot.edition_id = p_edition_id
    and ballot.show_id = p_show_id
    and private.v3_jury_correction_identity_matches(
      ballot.voter_id,
      ballot.voter_country_id,
      ballot.voter_entity_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id
    )
  order by ballot.submitted_at desc, ballot.id desc
  limit 1;

  select result_state.* into v_result
  from public.studio2_result_operations result_state
  where result_state.show_id = p_show_id
    and result_state.edition_id = p_edition_id;

  select count(*)::integer into v_result_rows
  from public.results result_row
  where result_row.edition_id = p_edition_id
    and result_row.show_id = p_show_id;

  select control.* into v_publication
  from public.studio2_show_publication_controls control
  where control.show_id = p_show_id
    and control.edition_id = p_edition_id;

  v_legacy_results_public := coalesce(v_show.published, false)
    and coalesce((v_show.publication_config ->> 'results')::boolean, false);
  v_public_results := v_legacy_results_public
    or (
      coalesce(v_publication.state, 'hidden') = 'public'
      and coalesce((v_publication.frozen_config ->> 'results')::boolean, false)
    );
  v_scheduled_results := coalesce(v_publication.state, 'hidden') = 'scheduled'
    and coalesce((v_publication.frozen_config ->> 'results')::boolean, false);

  if v_public_results then
    v_blockers := array_append(v_blockers, 'RESULTS_ALREADY_PUBLIC');
  end if;
  if v_scheduled_results then
    v_blockers := array_append(v_blockers, 'RESULTS_PUBLICATION_SCHEDULED');
  end if;
  if coalesce(v_result.locked_version, 0) > 0 then
    v_blockers := array_append(v_blockers, 'RESULTS_LOCKED');
  end if;
  if coalesce(v_result.reveal_ready_version, 0) > 0 then
    v_blockers := array_append(v_blockers, 'RESULTS_REVEAL_READY');
  end if;

  -- A clear intentionally makes the canonical ballot incomplete. Once result
  -- evidence exists, that would create a stale official result with no valid
  -- immediate recalculation. A replacement/assign remains safe only when the
  -- projected ballot is complete enough for the existing result calculator.
  if (coalesce(v_result.calculation_version, 0) > 0 or v_result_rows > 0)
     and v_action = 'clear' then
    v_blockers := array_append(v_blockers, 'CALCULATED_RESULTS_REQUIRE_COMPLETE_BALLOT');
  end if;
  if (coalesce(v_result.calculation_version, 0) > 0 or v_result_rows > 0)
     and v_action = 'assign'
     and v_projected_vote_count < v_required_count then
    v_blockers := array_append(v_blockers, 'CORRECTION_WOULD_LEAVE_BALLOT_INCOMPLETE');
  end if;

  v_can_recalculate := private.studio2_can_verify_results(v_actor, p_edition_id);
  if (coalesce(v_result.calculation_version, 0) > 0 or v_result_rows > 0)
     and v_action = 'assign'
     and not v_can_recalculate then
    v_blockers := array_append(v_blockers, 'RESULT_RECALCULATION_NOT_AUTHORIZED');
  end if;

  v_can_apply := coalesce(array_length(v_blockers, 1), 0) = 0;

  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'voterScopeKey', v_scope_key,
    'action', v_action,
    'points', p_points,
    'receivingCountryId', p_receiving_country_id,
    'receivingEntityId', p_receiving_entity_id,
    'stateVersion', v_revision,
    'votes', v_votes,
    'voteCount', v_vote_count,
    'requiredVoteCount', v_required_count,
    'projectedVoteCount', v_projected_vote_count,
    'didNotVote', v_dnv,
    'submission', v_submission,
    'results', jsonb_build_object(
      'rowCount', v_result_rows,
      'calculationVersion', coalesce(v_result.calculation_version, 0),
      'reviewedVersion', v_result.reviewed_version,
      'lockedVersion', v_result.locked_version,
      'revealReadyVersion', v_result.reveal_ready_version,
      'publicationState', coalesce(v_publication.state, 'hidden'),
      'publicationVersion', coalesce(v_publication.version, 0),
      'public', v_public_results,
      'scheduled', v_scheduled_results,
      'willRecalculate',
        v_action = 'assign'
        and (coalesce(v_result.calculation_version, 0) > 0 or v_result_rows > 0)
        and v_can_apply
    ),
    'blockers', to_jsonb(v_blockers),
    'canApply', v_can_apply,
    'serverTime', now()
  );
end
$body$;

revoke all on function public.studio2_jury_correction_preview(
  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid
) from public, anon;
grant execute on function public.studio2_jury_correction_preview(
  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid
) to authenticated, service_role;

create or replace function public.studio2_apply_jury_correction(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_points integer,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $body$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_scope_key text := private.v3_jury_voter_scope_key(
    p_voter_id, p_voter_country_id, p_voter_entity_id
  );
  v_command text;
  v_claim jsonb;
  v_preview jsonb;
  v_before jsonb;
  v_after jsonb;
  v_vote_id uuid;
  v_cleared integer := 0;
  v_result_version bigint := 0;
  v_result_rows integer := 0;
  v_result_execution_id uuid;
  v_result_receipt jsonb;
  v_recalculated boolean := false;
  v_new_version bigint;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or v_scope_key is null
     or v_action not in ('assign', 'clear') or p_points is null
     or p_expected_version is null or p_expected_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  perform private.studio2_require_fresh_auth(300);
  v_command := case
    when v_action = 'assign' then 'jury.correction.assign'
    else 'jury.correction.clear'
  end;

  -- Claim before validating mutable state so exact retries after a committed
  -- response loss return the same receipt rather than failing STATE_CHANGED.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    'R3',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'voterScopeKey', v_scope_key,
      'voterId', p_voter_id,
      'voterCountryId', p_voter_country_id,
      'voterEntityId', p_voter_entity_id
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'action', v_action,
      'points', p_points,
      'receivingCountryId', p_receiving_country_id,
      'receivingEntityId', p_receiving_entity_id,
      'expectedVersion', p_expected_version,
      'reason', v_reason
    ))
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return v_claim;
  end if;

  -- Serialize both V3 corrections and legacy vote RPCs that hit the same rows.
  -- Legacy writes advance studio2_jury_ballot_revisions through triggers, so
  -- the version check below catches any compatibility mutation that won first.
  perform pg_advisory_xact_lock(hashtextextended(
    'v3-jury-correction:' || p_edition_id::text || ':' || p_show_id::text || ':' || v_scope_key,
    0
  ));

  v_preview := public.studio2_jury_correction_preview(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    v_action,
    p_points,
    p_receiving_country_id,
    p_receiving_entity_id
  );

  if coalesce((v_preview ->> 'stateVersion')::bigint, 0) is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = jsonb_build_object(
        'expectedVersion', p_expected_version,
        'currentVersion', coalesce((v_preview ->> 'stateVersion')::bigint, 0)
      )::text;
  end if;
  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception using
      errcode = '55000',
      message = 'DEPENDENCY_BLOCKED',
      detail = jsonb_build_object('blockers', coalesce(v_preview -> 'blockers', '[]'::jsonb))::text;
  end if;

  v_before := v_preview;
  v_result_version := coalesce((v_preview -> 'results' ->> 'calculationVersion')::bigint, 0);
  v_result_rows := coalesce((v_preview -> 'results' ->> 'rowCount')::integer, 0);

  if v_action = 'assign' then
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
    v_cleared := public.clear_jury_point(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_points
    );
    if v_cleared < 1 then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
  end if;

  -- If official result evidence already exists, an assign/move must update it
  -- atomically. The existing versioned Results authority owns calculation and
  -- automatically clears old review/lock/reveal evidence. Any calculation
  -- failure rolls this entire correction transaction back.
  if v_action = 'assign' and (v_result_version > 0 or v_result_rows > 0) then
    v_result_execution_id := gen_random_uuid();
    v_result_receipt := public.studio2_execute_result_operation(
      p_show_id,
      'calculate',
      v_reason,
      v_result_execution_id,
      v_result_version
    );
    v_recalculated := true;
  end if;

  select coalesce(revision.version, 0)
  into v_new_version
  from public.studio2_jury_ballot_revisions revision
  where revision.edition_id = p_edition_id
    and revision.show_id = p_show_id
    and revision.voter_scope_key = v_scope_key;
  v_new_version := coalesce(v_new_version, 0);

  v_after := public.studio2_jury_correction_preview(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    v_action,
    p_points,
    p_receiving_country_id,
    p_receiving_entity_id
  );

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'command', v_command,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'voterScopeKey', v_scope_key,
    'action', v_action,
    'points', p_points,
    'receivingCountryId', p_receiving_country_id,
    'receivingEntityId', p_receiving_entity_id,
    'voteId', v_vote_id,
    'clearedRows', case when v_action = 'clear' then v_cleared else null end,
    'previousVersion', p_expected_version,
    'version', v_new_version,
    'stateVersion', v_new_version,
    'resultRecalculated', v_recalculated,
    'resultExecutionId', v_result_execution_id,
    'resultCalculationVersion', case
      when v_recalculated then v_result_receipt -> 'calculationVersion'
      else null
    end,
    'reason', v_reason,
    'before', v_before,
    'after', v_after,
    'serverTime', now()
  ));

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$body$;

revoke all on function public.studio2_apply_jury_correction(
  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid,
  bigint, text, uuid, text
) from public, anon;
grant execute on function public.studio2_apply_jury_correction(
  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid,
  bigint, text, uuid, text
) to authenticated, service_role;

-- Reuse the existing event-backed jury.ballot_changed consequence instead of
-- inventing a second correction-only projection/task truth.
create or replace function private.v3_emit_jury_correction_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_edition_id uuid;
  v_show_id uuid;
  v_version bigint;
  v_scope_key text;
  v_action text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('jury.correction.assign', 'jury.correction.clear') then
    return new;
  end if;

  begin
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Jury correction has invalid event provenance'
      using errcode = '23514';
  end;
  v_scope_key := nullif(new.result ->> 'voterScopeKey', '');
  v_action := nullif(new.result ->> 'action', '');

  if v_edition_id is null or v_show_id is null or v_version is null
     or v_scope_key is null or v_action is null then
    raise exception 'Completed Jury correction lacks event provenance'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = v_show_id
      and show_row.edition_id = v_edition_id
  ) then
    raise exception 'Completed Jury correction is outside canonical show scope'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'jury.ballot_changed',
    'jury_ballot',
    v_show_id::text || ':' || v_scope_key,
    v_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'showId', v_show_id,
      'voterScopeKey', v_scope_key,
      'changeKind', case
        when v_action = 'assign' then 'score_assigned'
        else 'score_cleared'
      end,
      'points', new.result -> 'points',
      'receivingCountryId', new.result -> 'receivingCountryId',
      'receivingEntityId', new.result -> 'receivingEntityId',
      'version', v_version,
      'resultRecalculated', new.result -> 'resultRecalculated',
      'resultExecutionId', new.result -> 'resultExecutionId'
    )),
    1,
    array['jury.tasks']::text[]
  );

  return new;
end
$body$;

revoke all on function private.v3_emit_jury_correction_operation_event()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_emit_jury_correction_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_jury_correction_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_jury_correction_operation_event();

notify pgrst, 'reload schema';

commit;
