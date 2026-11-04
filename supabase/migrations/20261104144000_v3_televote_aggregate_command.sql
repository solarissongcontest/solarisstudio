begin;

-- V3 System / #585
-- Official aggregate Televote totals are consequential contest state. Keep the
-- existing public.televote_votes rows for compatibility, but move authority to
-- one capability-checked, atomic, versioned and idempotent command. During the
-- browser cutover a state fingerprint also detects legacy writes that bypass
-- the command version counter.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.system.televote-aggregate-command',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive governed Televote aggregate snapshot, CAS authority, S2 receipt and S4 event command.'
);
select set_config('request.jwt.claim.role', '', true);

create table if not exists private.studio2_televote_aggregate_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

revoke all on table private.studio2_televote_aggregate_versions
  from public, anon, authenticated;

create or replace function private.studio2_televote_aggregate_totals(
  p_show_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $totals$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'participantId', participant.id,
        'countryId', participant.country_id,
        'contestEntityId', participant.contest_entity_id,
        'points', coalesce(vote.points, 0)
      )
      order by participant.id
    ),
    '[]'::jsonb
  )
  from public.participants participant
  left join lateral (
    select televote.points
    from public.televote_votes televote
    where televote.show_id = p_show_id
      and (
        (
          participant.contest_entity_id is not null
          and televote.contest_entity_id = participant.contest_entity_id
        )
        or (
          participant.country_id is not null
          and televote.contest_entity_id is null
          and televote.country_id = participant.country_id
        )
      )
    order by
      (
        participant.contest_entity_id is not null
        and televote.contest_entity_id = participant.contest_entity_id
      ) desc,
      televote.id
    limit 1
  ) vote on true
  where participant.show_id = p_show_id
$totals$;

revoke all on function private.studio2_televote_aggregate_totals(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_televote_aggregate_state_hash(
  p_show_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $state_hash$
  select private.studio2_request_fingerprint(
    'televote.aggregate.state',
    'R0',
    jsonb_build_object('showId', p_show_id),
    jsonb_build_object(
      'totals', private.studio2_televote_aggregate_totals(p_show_id),
      'rawRows', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', vote.id,
              'countryId', vote.country_id,
              'contestEntityId', vote.contest_entity_id,
              'points', vote.points
            )
            order by vote.id
          )
          from public.televote_votes vote
          where vote.show_id = p_show_id
        ),
        '[]'::jsonb
      )
    )
  )
$state_hash$;

revoke all on function private.studio2_televote_aggregate_state_hash(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_televote_results_are_protected(
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
              show_row.publication_config -> 'results' = 'true'::jsonb
              or show_row.publication_config -> 'televote_results' = 'true'::jsonb
              or show_row.publication_config -> 'detailed_voting' = 'true'::jsonb
            )
          end
        )
      )
    from public.shows show_row
    where show_row.id = p_show_id
  ), false)
$protected$;

revoke all on function private.studio2_televote_results_are_protected(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_televote_aggregate_snapshot(
  p_show_id uuid,
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_actor uuid := auth.uid();
  v_show public.shows%rowtype;
  v_version bigint := 0;
  v_hash text;
  v_totals jsonb;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION' using errcode = '42501';
  end if;
  if p_show_id is null or p_edition_id is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select aggregate_version.version
  into v_version
  from private.studio2_televote_aggregate_versions aggregate_version
  where aggregate_version.show_id = p_show_id;

  v_version := coalesce(v_version, 0);
  v_totals := private.studio2_televote_aggregate_totals(p_show_id);
  v_hash := private.studio2_televote_aggregate_state_hash(p_show_id);

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'version', v_version,
    'stateHash', v_hash,
    'stateVersion', v_version::text || ':' || v_hash,
    'totals', v_totals,
    'resultsProtected', private.studio2_televote_results_are_protected(p_show_id),
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function public.studio2_televote_aggregate_snapshot(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_televote_aggregate_snapshot(uuid, uuid)
  to authenticated;

create or replace function public.studio2_update_televote_aggregate_totals(
  p_show_id uuid,
  p_edition_id uuid,
  p_expected_version bigint,
  p_expected_state_hash text,
  p_changes jsonb,
  p_mode text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $command$
declare
  v_actor uuid := auth.uid();
  v_show public.shows%rowtype;
  v_mode text := lower(btrim(coalesce(p_mode, 'patch')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_scope jsonb;
  v_semantic_request jsonb;
  v_item jsonb;
  v_participant_id uuid;
  v_points_bigint bigint;
  v_points integer;
  v_seen jsonb := '{}'::jsonb;
  v_canonical_changes jsonb := '[]'::jsonb;
  v_current_version bigint;
  v_next_version bigint;
  v_current_hash text;
  v_after_hash text;
  v_applied integer := 0;
  v_participant public.participants%rowtype;
  v_participant_count integer;
  v_before_totals jsonb;
  v_after_totals jsonb;
  v_affected_ids jsonb;
  v_result jsonb;
  v_event_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION' using errcode = '42501';
  end if;
  if p_show_id is null
     or p_edition_id is null
     or p_expected_version is null
     or p_expected_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_hash, '')), '') is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if v_mode not in ('patch', 'replace') then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) = 0
     or jsonb_array_length(p_changes) > 500 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  -- Canonicalize before claiming idempotency so equivalent client array order
  -- produces the same semantic request fingerprint.
  for v_item in
    select value from jsonb_array_elements(p_changes)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ? 'participantId')
       or not (v_item ? 'points')
       or jsonb_typeof(v_item -> 'participantId') <> 'string'
       or jsonb_typeof(v_item -> 'points') <> 'number' then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;

    begin
      v_participant_id := (v_item ->> 'participantId')::uuid;
      v_points_bigint := (v_item ->> 'points')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'VALIDATION' using errcode = '22023';
    end;

    if v_points_bigint < -2147483648 or v_points_bigint > 2147483647 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_points := v_points_bigint::integer;

    if v_seen ? v_participant_id::text then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_seen := v_seen || jsonb_build_object(v_participant_id::text, true);
    v_canonical_changes := v_canonical_changes || jsonb_build_array(
      jsonb_build_object(
        'participantId', v_participant_id,
        'points', v_points
      )
    );
  end loop;

  select coalesce(jsonb_agg(value order by value ->> 'participantId'), '[]'::jsonb)
  into v_canonical_changes
  from jsonb_array_elements(v_canonical_changes);

  if exists (
    select 1
    from jsonb_array_elements(v_canonical_changes) change
    left join public.participants participant
      on participant.id = (change ->> 'participantId')::uuid
     and participant.show_id = p_show_id
     and participant.edition_id = p_edition_id
    where participant.id is null
       or (participant.country_id is null and participant.contest_entity_id is null)
  ) then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select
        case
          when participant.contest_entity_id is not null
            then 'entity:' || participant.contest_entity_id::text
          when participant.country_id is not null
            then 'country:' || participant.country_id::text
          else null
        end as identity_key,
        count(*) as identity_count
      from public.participants participant
      where participant.show_id = p_show_id
        and participant.edition_id = p_edition_id
      group by 1
    ) identities
    where identities.identity_key is null or identities.identity_count > 1
  ) then
    raise exception 'STATE_CHANGED' using
      errcode = 'P0001',
      hint = 'Show participant identities are incomplete or ambiguous.';
  end if;

  select count(*)
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and participant.edition_id = p_edition_id;

  if v_mode = 'replace'
     and jsonb_array_length(v_canonical_changes) <> v_participant_count then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id
  );
  v_semantic_request := jsonb_build_object(
    'expectedVersion', p_expected_version,
    'expectedStateHash', p_expected_state_hash,
    'mode', v_mode,
    'reason', v_reason,
    'changes', v_canonical_changes
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.aggregate.update',
    'R2',
    v_scope,
    v_semantic_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return public.studio2_reconcile_operation((v_claim ->> 'operationId')::uuid);
  end if;

  -- Results operations already serialize on this per-show namespace. Sharing
  -- it prevents a totals write from racing a lock/publication transition.
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || p_show_id::text, 0)
  );

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for share;

  if v_show.id is null then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  insert into private.studio2_televote_aggregate_versions (
    show_id,
    edition_id,
    version,
    updated_by
  )
  values (
    p_show_id,
    p_edition_id,
    0,
    v_actor
  )
  on conflict (show_id) do nothing;

  select aggregate_version.version
  into v_current_version
  from private.studio2_televote_aggregate_versions aggregate_version
  where aggregate_version.show_id = p_show_id
    and aggregate_version.edition_id = p_edition_id
  for update;

  if v_current_version is null then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  v_current_hash := private.studio2_televote_aggregate_state_hash(p_show_id);
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

  if private.studio2_televote_results_are_protected(p_show_id) then
    raise exception 'STATE_CHANGED' using
      errcode = 'P0001',
      hint = 'Locked, reveal-ready, scheduled or public result totals must be corrected through the Results lifecycle.';
  end if;

  select count(*)
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and participant.edition_id = p_edition_id;

  if v_mode = 'replace'
     and jsonb_array_length(v_canonical_changes) <> v_participant_count then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  v_before_totals := private.studio2_televote_aggregate_totals(p_show_id);

  -- Replace mode owns the full show aggregate. Remove legacy/orphan rows that
  -- no longer resolve to a current participant before applying the new set.
  if v_mode = 'replace' then
    delete from public.televote_votes vote
    where vote.show_id = p_show_id
      and not exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and participant.edition_id = p_edition_id
          and (
            (
              participant.contest_entity_id is not null
              and vote.contest_entity_id = participant.contest_entity_id
            )
            or (
              participant.contest_entity_id is null
              and participant.country_id is not null
              and vote.contest_entity_id is null
              and vote.country_id = participant.country_id
            )
          )
      );
  end if;

  for v_item in
    select value from jsonb_array_elements(v_canonical_changes)
  loop
    v_participant_id := (v_item ->> 'participantId')::uuid;
    v_points := (v_item ->> 'points')::integer;

    select participant.*
    into v_participant
    from public.participants participant
    where participant.id = v_participant_id
      and participant.show_id = p_show_id
      and participant.edition_id = p_edition_id
    for key share;

    if v_participant.id is null
       or (v_participant.country_id is null and v_participant.contest_entity_id is null) then
      raise exception 'STATE_CHANGED' using errcode = 'P0001';
    end if;

    if v_participant.contest_entity_id is not null then
      -- Collapse a possible legacy country-only row before moving authority to
      -- canonical contest-entity identity. This avoids double-counting readers.
      if v_participant.country_id is not null then
        delete from public.televote_votes vote
        where vote.show_id = p_show_id
          and vote.contest_entity_id is null
          and vote.country_id = v_participant.country_id;
      end if;

      insert into public.televote_votes (
        edition_id,
        country_id,
        points,
        show_id,
        contest_entity_id
      )
      values (
        p_edition_id,
        v_participant.country_id,
        v_points,
        p_show_id,
        v_participant.contest_entity_id
      )
      on conflict (show_id, contest_entity_id)
        where show_id is not null and contest_entity_id is not null
      do update set
        edition_id = excluded.edition_id,
        country_id = excluded.country_id,
        points = excluded.points;
    else
      insert into public.televote_votes (
        edition_id,
        country_id,
        points,
        show_id,
        contest_entity_id
      )
      values (
        p_edition_id,
        v_participant.country_id,
        v_points,
        p_show_id,
        null
      )
      on conflict (show_id, country_id)
        where show_id is not null and country_id is not null
      do update set
        edition_id = excluded.edition_id,
        points = excluded.points,
        contest_entity_id = null;
    end if;

    v_applied := v_applied + 1;
  end loop;

  v_next_version := v_current_version + 1;
  update private.studio2_televote_aggregate_versions
  set
    version = v_next_version,
    updated_at = now(),
    updated_by = v_actor
  where show_id = p_show_id
    and edition_id = p_edition_id;

  v_after_totals := private.studio2_televote_aggregate_totals(p_show_id);
  v_after_hash := private.studio2_televote_aggregate_state_hash(p_show_id);

  select coalesce(
    jsonb_agg(value ->> 'participantId' order by value ->> 'participantId'),
    '[]'::jsonb
  )
  into v_affected_ids
  from jsonb_array_elements(v_canonical_changes);

  -- Canonical S4 event signature derives correlation + actor from the S2
  -- receipt. Do not duplicate those authoritative values in browser input.
  v_event_id := private.v3_emit_domain_event(
    'televote.aggregate_updated',
    'show',
    p_show_id::text,
    v_next_version,
    p_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'beforeVersion', v_current_version,
      'afterVersion', v_next_version,
      'beforeStateHash', v_current_hash,
      'stateHash', v_after_hash,
      'mode', v_mode,
      'appliedCount', v_applied,
      'affectedParticipantIds', v_affected_ids,
      'reason', v_reason,
      'resultsRecalculationRequired', true
    ),
    1,
    array[]::text[]
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
    'televote.aggregate.update',
    'televote_votes',
    p_show_id::text,
    p_edition_id,
    jsonb_build_object(
      'version', v_current_version,
      'stateHash', v_current_hash,
      'totals', v_before_totals,
      'operationId', p_operation_id,
      'reason', v_reason
    ),
    jsonb_build_object(
      'version', v_next_version,
      'stateHash', v_after_hash,
      'totals', v_after_totals,
      'operationId', p_operation_id,
      'eventId', v_event_id,
      'reason', v_reason
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'command', 'televote.aggregate.update',
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'correlationId', coalesce(p_correlation_id, p_operation_id),
    'editionId', p_edition_id,
    'showId', p_show_id,
    'version', v_next_version,
    'stateHash', v_after_hash,
    'stateVersion', v_next_version::text || ':' || v_after_hash,
    'appliedCount', v_applied,
    'totals', v_after_totals,
    'eventId', v_event_id,
    'resultsRecalculationRequired', true,
    'serverTime', now(),
    'replayed', false
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

revoke all on function public.studio2_update_televote_aggregate_totals(
  uuid, uuid, bigint, text, jsonb, text, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_update_televote_aggregate_totals(
  uuid, uuid, bigint, text, jsonb, text, text, uuid, text, uuid
) to authenticated;

comment on function public.studio2_televote_aggregate_snapshot(uuid, uuid) is
  'V3 Organizer Televote aggregate read model with canonical version and compatibility state fingerprint.';

comment on function public.studio2_update_televote_aggregate_totals(
  uuid, uuid, bigint, text, jsonb, text, text, uuid, text, uuid
) is
  'V3 server-authoritative atomic Televote aggregate update. Requires voting.manage, CAS version+state hash, reason, idempotency and an unprotected Results lifecycle.';

notify pgrst, 'reload schema';

commit;