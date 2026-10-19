begin;

-- V3 O6 / #598 second vertical slice: membership changes are authoritative
-- operations rather than direct browser INSERT/DELETE. The show row is the
-- serialization root for the whole line-up, so this composes with the stage,
-- allocation and running-order commands introduced immediately before it.
select public.v3_register_migration_contract(
  'v3.o6.show-lineup-member-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive governed show line-up member add/remove commands with dependency preflight, exact show scope, CAS, idempotency, receipts and domain events.'
);

create or replace function private.v3_show_lineup_member_dependencies(
  p_show_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $dependencies$
declare
  v_entity_id uuid;
  v_country_id uuid;
  v_result_count integer := 0;
  v_jury_received_count integer := 0;
  v_jury_voter_count integer := 0;
  v_jury_status_count integer := 0;
  v_jury_submission_count integer := 0;
  v_televote_count integer := 0;
  v_voter_count integer := 0;
  v_total integer := 0;
begin
  select p.contest_entity_id, p.country_id
  into v_entity_id, v_country_id
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  select count(*)::integer
  into v_result_count
  from public.results r
  where r.show_id = p_show_id
    and (
      (v_entity_id is not null and r.contest_entity_id = v_entity_id)
      or (v_country_id is not null and r.country_id = v_country_id)
    );

  select count(*)::integer
  into v_jury_received_count
  from public.jury_votes j
  where j.show_id = p_show_id
    and (
      (v_entity_id is not null and j.receiving_entity_id = v_entity_id)
      or (v_country_id is not null and j.receiving_country_id = v_country_id)
    );

  select count(*)::integer
  into v_jury_voter_count
  from public.jury_votes j
  where j.show_id = p_show_id
    and (
      (v_entity_id is not null and j.voter_entity_id = v_entity_id)
      or (v_country_id is not null and j.voter_country_id = v_country_id)
    );

  select count(*)::integer
  into v_jury_status_count
  from public.jury_ballot_statuses s
  where s.show_id = p_show_id
    and (
      (v_entity_id is not null and s.voter_entity_id = v_entity_id)
      or (v_country_id is not null and s.voter_country_id = v_country_id)
    );

  select count(*)::integer
  into v_jury_submission_count
  from public.jury_ballot_submissions s
  where s.show_id = p_show_id
    and (
      (v_entity_id is not null and s.voter_entity_id = v_entity_id)
      or (v_country_id is not null and s.voter_country_id = v_country_id)
    );

  select count(*)::integer
  into v_televote_count
  from public.televote_votes t
  where t.show_id = p_show_id
    and (
      (v_entity_id is not null and t.contest_entity_id = v_entity_id)
      or (v_country_id is not null and t.country_id = v_country_id)
    );

  select count(*)::integer
  into v_voter_count
  from public.voters v
  where v.show_id = p_show_id
    and (
      (v_entity_id is not null and v.contest_entity_id = v_entity_id)
      or (v_country_id is not null and v.country_id = v_country_id)
    );

  v_total :=
    v_result_count
    + v_jury_received_count
    + v_jury_voter_count
    + v_jury_status_count
    + v_jury_submission_count
    + v_televote_count
    + v_voter_count;

  return jsonb_build_object(
    'participantId', p_participant_id,
    'showId', p_show_id,
    'contestEntityId', v_entity_id,
    'countryId', v_country_id,
    'results', v_result_count,
    'juryReceivedVotes', v_jury_received_count,
    'juryVoterVotes', v_jury_voter_count,
    'juryBallotStatuses', v_jury_status_count,
    'juryBallotSubmissions', v_jury_submission_count,
    'televoteVotes', v_televote_count,
    'voterRecords', v_voter_count,
    'total', v_total,
    'canRemove', v_total = 0
  );
end
$dependencies$;

revoke all on function private.v3_show_lineup_member_dependencies(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_show_lineup_member_preflight(
  p_show_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_dependencies jsonb;
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  v_snapshot := private.v3_show_lineup_snapshot(p_show_id);
  if v_snapshot is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_snapshot ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_dependencies := private.v3_show_lineup_member_dependencies(
    p_show_id,
    p_participant_id
  );

  return jsonb_build_object(
    'editionId', v_edition_id,
    'showId', p_show_id,
    'participantId', p_participant_id,
    'stage', v_snapshot ->> 'stage',
    'stateVersion', v_snapshot ->> 'stateVersion',
    'dependencies', v_dependencies,
    'canRemove', coalesce((v_dependencies ->> 'canRemove')::boolean, false)
  );
end
$preflight$;

revoke all on function public.studio2_show_lineup_member_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_show_lineup_member_preflight(uuid, uuid)
  to authenticated, service_role;

comment on function public.studio2_show_lineup_member_preflight(uuid, uuid) is
  'O6 destructive member-removal preflight. Official result/vote/ballot/voter dependencies block deletion even though they are not participant FKs.';

create or replace function public.studio2_add_show_lineup_member(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_state_version text,
  p_contest_entity_id uuid,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $add_member$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_country_id uuid;
  v_show_kind text;
  v_artist text;
  v_song text;
  v_participant_id uuid;
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_contest_entity_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.member.add',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'contest_entity',
      'subjectId', p_contest_entity_id
    ),
    jsonb_build_object(
      'expectedStateVersion', p_expected_state_version,
      'contestEntityId', p_contest_entity_id
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );

  select e.country_id
  into v_country_id
  from public.contest_entities e
  where e.id = p_contest_entity_id
    and e.edition_id = v_edition_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if exists (
    select 1
    from public.participants p
    where p.show_id = p_show_id
      and (
        p.contest_entity_id = p_contest_entity_id
        or (v_country_id is not null and p.country_id = v_country_id)
      )
  ) then
    raise exception using errcode = '23505', message = 'STATE_CHANGED';
  end if;

  select s.kind
  into v_show_kind
  from public.shows s
  where s.id = p_show_id
    and s.edition_id = v_edition_id;

  select p.artist, p.song
  into v_artist, v_song
  from public.participants p
  where p.edition_id = v_edition_id
    and p.show_id is distinct from p_show_id
    and (
      p.contest_entity_id = p_contest_entity_id
      or (v_country_id is not null and p.country_id = v_country_id)
    )
    and (p.artist is not null or p.song is not null)
  order by p.updated_at desc, p.id desc
  limit 1;

  insert into public.participants (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    running_order,
    running_order_allocation,
    semi_final,
    artist,
    song
  ) values (
    v_edition_id,
    p_show_id,
    v_country_id,
    p_contest_entity_id,
    null,
    null,
    coalesce(v_show_kind, 'final'),
    v_artist,
    v_song
  )
  returning id into v_participant_id;

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.lineup_member_added',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'participantId', v_participant_id,
      'contestEntityId', p_contest_entity_id,
      'countryId', v_country_id,
      'stage', v_after ->> 'stage'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'participantId', v_participant_id,
    'contestEntityId', p_contest_entity_id,
    'countryId', v_country_id,
    'stage', v_after ->> 'stage',
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$add_member$;

revoke all on function public.studio2_add_show_lineup_member(
  uuid, text, uuid, text, uuid, uuid
) from public, anon;
grant execute on function public.studio2_add_show_lineup_member(
  uuid, text, uuid, text, uuid, uuid
) to authenticated, service_role;

comment on function public.studio2_add_show_lineup_member(
  uuid, text, uuid, text, uuid, uuid
) is
  'Canonical O6 member-add command. Exact-edition entity validation, show serialization and CAS prevent duplicate or stale line-up membership.';

create or replace function public.studio2_remove_show_lineup_member(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_participant_id uuid,
  p_expected_state_version text,
  p_reason text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $remove_member$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_dependencies jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_entity_id uuid;
  v_country_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_participant_id is null or v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.member.remove',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'participant',
      'subjectId', p_participant_id
    ),
    jsonb_build_object(
      'participantId', p_participant_id,
      'expectedStateVersion', p_expected_state_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );

  select p.contest_entity_id, p.country_id
  into v_entity_id, v_country_id
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = v_edition_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  v_dependencies := private.v3_show_lineup_member_dependencies(
    p_show_id,
    p_participant_id
  );
  if not coalesce((v_dependencies ->> 'canRemove')::boolean, false) then
    raise exception using
      errcode = '23503',
      message = 'DEPENDENCY_FAILURE',
      detail = v_dependencies::text;
  end if;

  delete from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = v_edition_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.lineup_member_removed',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'participantId', p_participant_id,
      'contestEntityId', v_entity_id,
      'countryId', v_country_id,
      'reason', v_reason,
      'dependencies', v_dependencies,
      'stage', v_after ->> 'stage'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'participantId', p_participant_id,
    'removed', true,
    'reason', v_reason,
    'stage', v_after ->> 'stage',
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$remove_member$;

revoke all on function public.studio2_remove_show_lineup_member(
  uuid, text, uuid, uuid, text, text, uuid
) from public, anon;
grant execute on function public.studio2_remove_show_lineup_member(
  uuid, text, uuid, uuid, text, text, uuid
) to authenticated, service_role;

comment on function public.studio2_remove_show_lineup_member(
  uuid, text, uuid, uuid, text, text, uuid
) is
  'Canonical O6 member-removal command. Fails closed when results, jury, televote, ballot or voter facts still bind the show identity; running order compaction remains delegated to the existing DB trigger.';

notify pgrst, 'reload schema';

commit;
