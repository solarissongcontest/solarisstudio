begin;

-- Organisation OS V5 jury ballot lifecycle.
--
-- Submitted ballot bytes/votes remain immutable participant evidence. Organizer
-- review changes only the submission lifecycle around that evidence. Did-not-vote
-- remains a separate absence record because no ballot was submitted.

alter table public.jury_ballot_submissions
  drop constraint if exists jury_ballot_submissions_status_check;

update public.jury_ballot_submissions
set status = 'invalidated'
where status = 'excluded';

alter table public.jury_ballot_submissions
  add column if not exists review_version bigint not null default 1,
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.jury_ballot_submissions
  add constraint jury_ballot_submissions_status_check
  check (
    status in (
      'submitted',
      'valid',
      'needs_review',
      'invalidated',
      'superseded'
    )
  );

alter table public.jury_ballot_statuses
  add column if not exists version bigint not null default 1,
  add column if not exists changed_by uuid references auth.users(id) on delete set null,
  add column if not exists changed_at timestamptz not null default now();

create or replace function private.studio2_jury_ballot_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select (p_from || '->' || p_to) in (
    'submitted->valid',
    'submitted->needs_review',
    'submitted->invalidated',
    'submitted->superseded',
    'needs_review->valid',
    'needs_review->invalidated',
    'needs_review->superseded',
    'valid->needs_review',
    'valid->invalidated',
    'valid->superseded',
    'invalidated->needs_review',
    'invalidated->valid',
    'invalidated->superseded'
  );
$allowed$;

revoke all on function private.studio2_jury_ballot_transition_allowed(text, text)
  from public, anon, authenticated;

create or replace function public.studio2_jury_ballot_review_preview(
  p_ballot_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_ballot public.jury_ballot_submissions;
  v_target text := lower(btrim(coalesce(p_target_status, '')));
  v_vote_count integer;
begin
  select *
  into v_ballot
  from public.jury_ballot_submissions
  where id = p_ballot_id;

  if v_ballot.id is null then
    raise exception 'Jury ballot not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', v_ballot.edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  if v_target not in ('valid', 'needs_review', 'invalidated', 'superseded') then
    raise exception 'Unknown jury ballot review state' using errcode = '22023';
  end if;

  if v_ballot.status <> v_target
     and not private.studio2_jury_ballot_transition_allowed(v_ballot.status, v_target) then
    raise exception 'Invalid jury ballot transition: % -> %', v_ballot.status, v_target
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_vote_count
  from public.jury_votes vote
  where vote.ballot_submission_id = v_ballot.id;

  return jsonb_build_object(
    'ballotId', v_ballot.id,
    'editionId', v_ballot.edition_id,
    'showId', v_ballot.show_id,
    'voterCountryId', v_ballot.voter_country_id,
    'currentStatus', v_ballot.status,
    'targetStatus', v_target,
    'expectedVersion', v_ballot.review_version,
    'alreadyApplied', v_ballot.status = v_target,
    'riskClass', 'R2',
    'riskScore', v_ballot.risk_score,
    'voteRows', v_vote_count,
    'submittedAt', v_ballot.submitted_at
  );
end
$preview$;

revoke all on function public.studio2_jury_ballot_review_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_jury_ballot_review_preview(uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_jury_ballot_review(
  p_ballot_id uuid,
  p_target_status text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_ballot public.jury_ballot_submissions;
  v_target text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  select *
  into v_ballot
  from public.jury_ballot_submissions
  where id = p_ballot_id
  for update;

  if v_ballot.id is null then
    raise exception 'Jury ballot not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', v_ballot.edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  if v_ballot.review_version is distinct from p_expected_version then
    raise exception 'Jury ballot review changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  perform public.studio2_jury_ballot_review_preview(p_ballot_id, v_target);

  if v_target in ('needs_review', 'invalidated', 'superseded') and v_reason is null then
    raise exception 'A reason is required for this jury ballot transition'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.ballot.review.' || v_target,
    'R2',
    jsonb_build_object(
      'ballotId', p_ballot_id,
      'showId', v_ballot.show_id,
      'editionId', v_ballot.edition_id,
      'fromStatus', v_ballot.status,
      'toStatus', v_target,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  update public.jury_ballot_submissions
  set
    status = v_target,
    review_version = review_version + 1,
    review_reason = v_reason,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now()
  where id = p_ballot_id
  returning * into v_ballot;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'jury_ballot_review_transition',
    'jury_ballot_submissions',
    p_ballot_id::text,
    jsonb_build_object(
      'status', (v_claim -> 'scope' ->> 'fromStatus'),
      'version', p_expected_version
    ),
    jsonb_build_object(
      'status', v_ballot.status,
      'version', v_ballot.review_version,
      'reason', v_ballot.review_reason,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'ballotId', v_ballot.id,
    'status', v_ballot.status,
    'version', v_ballot.review_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_jury_ballot_review(
  uuid, text, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_ballot_review(
  uuid, text, text, uuid, text, bigint
) to authenticated, service_role;

create or replace function private.studio2_find_jury_dnv(
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns public.jury_ballot_statuses
language sql
stable
security definer
set search_path = pg_catalog, public
as $find$
  select status_row.*
  from public.jury_ballot_statuses status_row
  where status_row.show_id = p_show_id
    and status_row.status = 'did_not_vote'
    and (
      (p_voter_id is not null and status_row.voter_id = p_voter_id)
      or (
        p_voter_id is null
        and p_voter_entity_id is not null
        and status_row.voter_entity_id = p_voter_entity_id
      )
      or (
        p_voter_id is null
        and p_voter_entity_id is null
        and p_voter_country_id is not null
        and status_row.voter_country_id = p_voter_country_id
      )
    )
  limit 1;
$find$;

revoke all on function private.studio2_find_jury_dnv(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_jury_dnv_preview(
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_show public.shows;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_existing public.jury_ballot_statuses;
  v_saved_votes integer;
begin
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  if v_action not in ('set', 'clear') then
    raise exception 'Unknown DNV action' using errcode = '22023';
  end if;

  if p_voter_id is null and p_voter_country_id is null and p_voter_entity_id is null then
    raise exception 'Jury identity is required' using errcode = '22023';
  end if;

  v_existing := private.studio2_find_jury_dnv(
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id
  );

  select count(*)::integer
  into v_saved_votes
  from public.jury_votes vote
  where vote.show_id = p_show_id
    and (
      (p_voter_id is not null and vote.voter_id = p_voter_id)
      or (
        p_voter_id is null
        and p_voter_entity_id is not null
        and vote.voter_entity_id = p_voter_entity_id
      )
      or (
        p_voter_id is null
        and p_voter_entity_id is null
        and p_voter_country_id is not null
        and vote.voter_country_id = p_voter_country_id
      )
    );

  if v_action = 'set' and v_saved_votes > 0 then
    raise exception 'Clear saved jury scores before authorizing DNV'
      using errcode = '23514';
  end if;

  return jsonb_build_object(
    'showId', p_show_id,
    'editionId', v_show.edition_id,
    'action', v_action,
    'currentDnv', v_existing.id is not null,
    'expectedVersion', coalesce(v_existing.version, 0),
    'alreadyApplied',
      (v_action = 'set' and v_existing.id is not null)
      or (v_action = 'clear' and v_existing.id is null),
    'riskClass', 'R2',
    'savedVoteRows', v_saved_votes
  );
end
$preview$;

revoke all on function public.studio2_jury_dnv_preview(
  uuid, uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.studio2_jury_dnv_preview(
  uuid, uuid, uuid, uuid, text
) to authenticated, service_role;

create or replace function public.studio2_apply_jury_dnv(
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_action text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_show public.shows;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing public.jury_ballot_statuses;
  v_preview jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_status public.jury_ballot_statuses;
  v_result jsonb;
begin
  if v_reason is null then
    raise exception 'A reason is required for DNV changes' using errcode = '22023';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('jury.ballots.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode = '42501';
  end if;

  v_existing := private.studio2_find_jury_dnv(
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id
  );

  if coalesce(v_existing.version, 0) is distinct from p_expected_version then
    raise exception 'DNV state changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_preview := public.studio2_jury_dnv_preview(
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    v_action
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.dnv.' || v_action,
    'R2',
    jsonb_build_object(
      'showId', p_show_id,
      'editionId', v_show.edition_id,
      'voterId', p_voter_id,
      'voterCountryId', p_voter_country_id,
      'voterEntityId', p_voter_entity_id,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_action = 'set' then
    if v_existing.id is null then
      insert into public.jury_ballot_statuses (
        edition_id,
        show_id,
        voter_id,
        voter_country_id,
        voter_entity_id,
        status,
        note,
        version,
        changed_by,
        changed_at
      )
      values (
        v_show.edition_id,
        p_show_id,
        p_voter_id,
        p_voter_country_id,
        p_voter_entity_id,
        'did_not_vote',
        v_reason,
        1,
        auth.uid(),
        now()
      )
      returning * into v_status;
    else
      update public.jury_ballot_statuses
      set
        note = v_reason,
        version = version + 1,
        changed_by = auth.uid(),
        changed_at = now()
      where id = v_existing.id
      returning * into v_status;
    end if;
  elsif v_action = 'clear' then
    if v_existing.id is not null then
      delete from public.jury_ballot_statuses
      where id = v_existing.id
      returning v_existing.* into v_status;
    end if;
  else
    raise exception 'Unknown DNV action' using errcode = '22023';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'jury_dnv_' || v_action,
    'jury_ballot_statuses',
    coalesce(v_status.id, v_existing.id, gen_random_uuid())::text,
    case
      when v_existing.id is null then null
      else jsonb_build_object(
        'status', v_existing.status,
        'version', v_existing.version,
        'reason', v_existing.note
      )
    end,
    jsonb_build_object(
      'dnv', v_action = 'set',
      'reason', v_reason,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'showId', p_show_id,
    'dnv', v_action = 'set',
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_jury_dnv(
  uuid, uuid, uuid, uuid, text, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_dnv(
  uuid, uuid, uuid, uuid, text, text, uuid, text, bigint
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
