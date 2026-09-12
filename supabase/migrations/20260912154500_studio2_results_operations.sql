begin;

-- Phase 10 deliberately keeps public.results, jury_votes, televote_votes and the
-- existing recalculation/publication engines authoritative. These tables store
-- organizer operational decisions and immutable execution receipts only.
create table if not exists public.studio2_result_operations (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  calculation_version bigint not null default 0 check (calculation_version >= 0),
  last_calculated_at timestamptz,
  last_calculated_by uuid references auth.users(id) on delete set null,
  reviewed_version bigint,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  locked_version bigint,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  reveal_ready_version bigint,
  reveal_ready_at timestamptz,
  reveal_ready_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint studio2_result_operations_reviewed_version_check
    check (reviewed_version is null or (reviewed_version > 0 and reviewed_version <= calculation_version)),
  constraint studio2_result_operations_locked_version_check
    check (locked_version is null or (locked_version > 0 and locked_version <= calculation_version)),
  constraint studio2_result_operations_reveal_version_check
    check (reveal_ready_version is null or (reveal_ready_version > 0 and reveal_ready_version <= calculation_version))
);

create index if not exists studio2_result_operations_edition_idx
  on public.studio2_result_operations (edition_id, updated_at desc);
create index if not exists studio2_result_operations_last_calculated_by_idx
  on public.studio2_result_operations (last_calculated_by);
create index if not exists studio2_result_operations_reviewed_by_idx
  on public.studio2_result_operations (reviewed_by);
create index if not exists studio2_result_operations_locked_by_idx
  on public.studio2_result_operations (locked_by);
create index if not exists studio2_result_operations_reveal_ready_by_idx
  on public.studio2_result_operations (reveal_ready_by);

create table if not exists public.studio2_result_operation_executions (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  action text not null check (action in (
    'calculate', 'review', 'lock', 'unlock', 'mark_reveal_ready', 'clear_reveal_ready'
  )),
  calculation_version bigint not null check (calculation_version >= 0),
  reason text not null check (length(btrim(reason)) >= 5),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object')
);

create index if not exists studio2_result_operation_executions_edition_idx
  on public.studio2_result_operation_executions (edition_id, created_at desc);
create index if not exists studio2_result_operation_executions_show_idx
  on public.studio2_result_operation_executions (show_id, created_at desc);
create index if not exists studio2_result_operation_executions_actor_idx
  on public.studio2_result_operation_executions (actor_user_id);

alter table public.studio2_result_operations enable row level security;
alter table public.studio2_result_operation_executions enable row level security;
revoke all on table public.studio2_result_operations from public, anon, authenticated;
revoke all on table public.studio2_result_operation_executions from public, anon, authenticated;

create or replace function private.studio2_can_preview_results(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'results.preview', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'results.verify', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'results.publish', p_edition_id), false);
$$;

create or replace function private.studio2_can_verify_results(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'results.verify', p_edition_id), false);
$$;

revoke all on function private.studio2_can_preview_results(uuid, uuid) from public, anon, authenticated;
revoke all on function private.studio2_can_verify_results(uuid, uuid) from public, anon, authenticated;
grant execute on function private.studio2_can_preview_results(uuid, uuid) to service_role;
grant execute on function private.studio2_can_verify_results(uuid, uuid) to service_role;

-- One factual readiness contract is shared by the dashboard and every mutation.
-- React never re-implements ballot completeness or result reconciliation rules.
create or replace function private.studio2_result_preconditions(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_show public.shows%rowtype;
  v_config jsonb;
  v_jury_enabled boolean;
  v_televote_enabled boolean;
  v_jury_points_required integer;
  v_participant_count integer := 0;
  v_voter_count integer := 0;
  v_jury_vote_rows integer := 0;
  v_dnv_count integer := 0;
  v_jury_incomplete integer := 0;
  v_jury_conflicts integer := 0;
  v_televote_vote_rows integer := 0;
  v_result_rows integer := 0;
  v_reconcile_issues integer := 0;
  v_jury_ready boolean;
  v_televote_ready boolean;
  v_calculation_ready boolean;
  v_result_ready boolean;
  v_published_results boolean;
begin
  select * into v_show from public.shows where id = p_show_id;
  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  v_config := coalesce(v_show.voting_config, '{}'::jsonb);
  v_jury_enabled := coalesce((v_config ->> 'juryEnabled')::boolean, true);
  v_televote_enabled := coalesce((v_config ->> 'televoteEnabled')::boolean, true);
  v_jury_points_required := case
    when not v_jury_enabled then 0
    when jsonb_typeof(v_config -> 'juryPoints') = 'array'
      and jsonb_array_length(v_config -> 'juryPoints') > 0
      then jsonb_array_length(v_config -> 'juryPoints')
    else 10
  end;

  select count(*) into v_participant_count
  from public.participants p
  where p.show_id = p_show_id
    and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  select count(*) into v_voter_count
  from public.voters v
  where v.show_id = p_show_id;

  select count(*) into v_jury_vote_rows
  from public.jury_votes j
  where j.show_id = p_show_id;

  select count(*) into v_dnv_count
  from public.jury_ballot_statuses bs
  where bs.show_id = p_show_id
    and bs.status = 'did_not_vote';

  if v_jury_enabled then
    select count(*) into v_jury_conflicts
    from public.voters v
    where v.show_id = p_show_id
      and exists (
        select 1
        from public.jury_ballot_statuses bs
        where bs.show_id = p_show_id
          and bs.status = 'did_not_vote'
          and (
            bs.voter_id = v.id
            or (bs.voter_id is null and v.contest_entity_id is not null and bs.voter_entity_id = v.contest_entity_id)
            or (bs.voter_id is null and bs.voter_entity_id is null and v.country_id is not null and bs.voter_country_id = v.country_id)
          )
      )
      and exists (
        select 1
        from public.jury_votes j
        where j.show_id = p_show_id
          and (
            j.voter_id = v.id
            or (j.voter_id is null and v.contest_entity_id is not null and j.voter_entity_id = v.contest_entity_id)
            or (j.voter_id is null and j.voter_entity_id is null and v.country_id is not null and j.voter_country_id = v.country_id)
          )
      );

    select count(*) into v_jury_incomplete
    from public.voters v
    where v.show_id = p_show_id
      and not exists (
        select 1
        from public.jury_ballot_statuses bs
        where bs.show_id = p_show_id
          and bs.status = 'did_not_vote'
          and (
            bs.voter_id = v.id
            or (bs.voter_id is null and v.contest_entity_id is not null and bs.voter_entity_id = v.contest_entity_id)
            or (bs.voter_id is null and bs.voter_entity_id is null and v.country_id is not null and bs.voter_country_id = v.country_id)
          )
      )
      and (
        select count(*)
        from public.jury_votes j
        where j.show_id = p_show_id
          and (
            j.voter_id = v.id
            or (j.voter_id is null and v.contest_entity_id is not null and j.voter_entity_id = v.contest_entity_id)
            or (j.voter_id is null and j.voter_entity_id is null and v.country_id is not null and j.voter_country_id = v.country_id)
          )
      ) < v_jury_points_required;
  end if;

  select count(*) into v_televote_vote_rows
  from public.televote_votes t
  where t.show_id = p_show_id;

  select count(*) into v_result_rows
  from public.results r
  where r.show_id = p_show_id;

  select count(*) into v_reconcile_issues
  from public.results r
  where r.show_id = p_show_id
    and r.total_points is distinct from (
      case when coalesce((v_config ->> 'weightedScoring')::boolean, false)
        then round(
          r.jury_points * (coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50) / 50.0)
          + r.televote_points * (coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50) / 50.0)
        )::integer
        else (r.jury_points + r.televote_points)::integer
      end
    );

  v_jury_ready := not v_jury_enabled
    or (v_voter_count > 0 and v_jury_conflicts = 0 and v_jury_incomplete = 0);
  v_televote_ready := not v_televote_enabled or v_televote_vote_rows > 0;
  v_calculation_ready := v_participant_count > 0 and v_jury_ready and v_televote_ready;
  v_result_ready := v_result_rows > 0
    and v_result_rows = v_participant_count
    and v_reconcile_issues = 0;
  v_published_results := coalesce(v_show.published, false)
    and coalesce((v_show.publication_config ->> 'results')::boolean, false);

  return jsonb_build_object(
    'participantCount', v_participant_count,
    'juryEnabled', v_jury_enabled,
    'juryRequiredPoints', v_jury_points_required,
    'juryVoterCount', v_voter_count,
    'juryVoteRows', v_jury_vote_rows,
    'juryDnvCount', v_dnv_count,
    'juryIncompleteCount', v_jury_incomplete,
    'juryConflictCount', v_jury_conflicts,
    'juryReady', v_jury_ready,
    'televoteEnabled', v_televote_enabled,
    'televoteVoteRows', v_televote_vote_rows,
    'televoteReady', v_televote_ready,
    'calculationReady', v_calculation_ready,
    'resultRowCount', v_result_rows,
    'reconcileIssueCount', v_reconcile_issues,
    'resultReady', v_result_ready,
    'publishedResults', v_published_results
  );
end
$$;

revoke all on function private.studio2_result_preconditions(uuid) from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions(uuid) to service_role;

create or replace function public.studio2_results_operations_snapshot(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rows jsonb := '[]'::jsonb;
  v_pre jsonb;
  v_state text;
  r record;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.editions e where e.id = p_edition_id) then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;
  if not v_is_service and not private.studio2_can_preview_results(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: results.preview' using errcode = '42501';
  end if;

  for r in
    select
      s.id, s.name, s.kind, s.sort_order,
      coalesce(o.calculation_version, 0) as calculation_version,
      o.last_calculated_at, o.last_calculated_by,
      o.reviewed_version, o.reviewed_at, o.reviewed_by,
      o.locked_version, o.locked_at, o.locked_by,
      o.reveal_ready_version, o.reveal_ready_at, o.reveal_ready_by
    from public.shows s
    left join public.studio2_result_operations o on o.show_id = s.id
    where s.edition_id = p_edition_id
    order by s.sort_order, s.name
  loop
    v_pre := private.studio2_result_preconditions(r.id);

    v_state := case
      when coalesce((v_pre ->> 'publishedResults')::boolean, false) then 'published'
      when r.calculation_version > 0 and r.reveal_ready_version = r.calculation_version then 'reveal_ready'
      when r.calculation_version > 0 and r.locked_version = r.calculation_version then 'locked'
      when r.calculation_version > 0 and r.reviewed_version = r.calculation_version then 'reviewed'
      when coalesce((v_pre ->> 'resultReady')::boolean, false) then 'calculated'
      when coalesce((v_pre ->> 'calculationReady')::boolean, false) then 'calculation_ready'
      when coalesce((v_pre ->> 'juryVoteRows')::integer, 0) > 0
        or coalesce((v_pre ->> 'televoteVoteRows')::integer, 0) > 0 then 'validation'
      else 'votes_collected'
    end;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'showId', r.id,
      'showName', r.name,
      'showKind', r.kind,
      'sortOrder', r.sort_order,
      'lifecycle', v_state,
      'calculationVersion', r.calculation_version,
      'lastCalculatedAt', r.last_calculated_at,
      'lastCalculatedBy', r.last_calculated_by,
      'reviewedVersion', r.reviewed_version,
      'reviewedAt', r.reviewed_at,
      'reviewedBy', r.reviewed_by,
      'lockedVersion', r.locked_version,
      'lockedAt', r.locked_at,
      'lockedBy', r.locked_by,
      'revealReadyVersion', r.reveal_ready_version,
      'revealReadyAt', r.reveal_ready_at,
      'revealReadyBy', r.reveal_ready_by,
      'preconditions', v_pre
    ));
  end loop;

  return v_rows;
end
$$;

revoke all on function public.studio2_results_operations_snapshot(uuid) from public, anon;
grant execute on function public.studio2_results_operations_snapshot(uuid) to authenticated, service_role;

create or replace function public.studio2_execute_result_operation(
  p_show_id uuid,
  p_action text,
  p_reason text,
  p_execution_id uuid,
  p_expected_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_show public.shows%rowtype;
  v_ops public.studio2_result_operations%rowtype;
  v_existing public.studio2_result_operation_executions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_pre jsonb;
  v_after jsonb;
  v_payload jsonb;
  v_event_type text := 'results.verified';
  v_materialized integer := 0;
  v_updated integer := 0;
begin
  if p_show_id is null or p_execution_id is null or p_expected_version is null then
    raise exception 'Show, execution id and expected calculation version are required' using errcode = '22023';
  end if;
  if p_action not in ('calculate', 'review', 'lock', 'unlock', 'mark_reveal_ready', 'clear_reveal_ready') then
    raise exception 'Unsupported result operation: %', p_action using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A result operation reason of at least 5 characters is required' using errcode = '22023';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_verify_results(v_actor, v_show.edition_id) then
    raise exception 'Missing Solaris capability: results.verify' using errcode = '42501';
  end if;

  -- Serialize every lifecycle mutation for this show. The execution UUID then
  -- gives callers safe retry semantics without applying the same intent twice.
  perform pg_advisory_xact_lock(hashtextextended('studio2-results:' || p_show_id::text, 0));

  select * into v_existing
  from public.studio2_result_operation_executions e
  where e.execution_id = p_execution_id;
  if found then
    if v_existing.show_id <> p_show_id or v_existing.action <> p_action then
      raise exception 'Execution id was already used for a different result operation' using errcode = '23505';
    end if;
    return v_existing.payload || jsonb_build_object('idempotentReplay', true);
  end if;

  insert into public.studio2_result_operations (show_id, edition_id)
  values (p_show_id, v_show.edition_id)
  on conflict (show_id) do nothing;

  select * into v_ops
  from public.studio2_result_operations o
  where o.show_id = p_show_id
  for update;

  if p_expected_version <> v_ops.calculation_version then
    raise exception 'Results changed since this action was loaded. Refresh before continuing.' using errcode = '40001';
  end if;

  v_pre := private.studio2_result_preconditions(p_show_id);

  if p_action = 'calculate' then
    if coalesce((v_pre ->> 'publishedResults')::boolean, false) then
      raise exception 'Make the published result layer private before recalculating.' using errcode = '55000';
    end if;
    if v_ops.locked_version = v_ops.calculation_version and v_ops.calculation_version > 0 then
      raise exception 'Unlock the current result version before recalculating.' using errcode = '55000';
    end if;
    if not coalesce((v_pre ->> 'calculationReady')::boolean, false) then
      raise exception 'Jury/televote validation is not ready for calculation.' using errcode = '55000';
    end if;

    v_materialized := public.materialize_show_results_if_missing(p_show_id);
    if v_materialized = 0 then
      v_updated := public.recalculate_show_results_internal(p_show_id);
    else
      select count(*) into v_updated from public.results r where r.show_id = p_show_id;
    end if;

    v_after := private.studio2_result_preconditions(p_show_id);
    if not coalesce((v_after ->> 'resultReady')::boolean, false) then
      raise exception 'Calculated results did not reconcile with the canonical participant/vote data.' using errcode = '55000';
    end if;

    update public.studio2_result_operations
    set calculation_version = calculation_version + 1,
        last_calculated_at = now(),
        last_calculated_by = v_actor,
        reviewed_version = null,
        reviewed_at = null,
        reviewed_by = null,
        locked_version = null,
        locked_at = null,
        locked_by = null,
        reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
    v_event_type := 'results.calculated';
  elsif p_action = 'review' then
    if v_ops.calculation_version < 1 then
      raise exception 'Calculate a versioned result before review.' using errcode = '55000';
    end if;
    if not coalesce((v_pre ->> 'resultReady')::boolean, false) then
      raise exception 'Result rows do not reconcile and cannot be reviewed.' using errcode = '55000';
    end if;
    update public.studio2_result_operations
    set reviewed_version = calculation_version,
        reviewed_at = now(),
        reviewed_by = v_actor,
        locked_version = null,
        locked_at = null,
        locked_by = null,
        reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
  elsif p_action = 'lock' then
    if v_ops.calculation_version < 1 or v_ops.reviewed_version is distinct from v_ops.calculation_version then
      raise exception 'Review the current calculation version before locking it.' using errcode = '55000';
    end if;
    update public.studio2_result_operations
    set locked_version = calculation_version,
        locked_at = now(),
        locked_by = v_actor,
        reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
  elsif p_action = 'unlock' then
    if coalesce((v_pre ->> 'publishedResults')::boolean, false) then
      raise exception 'Make the published result layer private before unlocking results.' using errcode = '55000';
    end if;
    if v_ops.locked_version is distinct from v_ops.calculation_version or v_ops.calculation_version < 1 then
      raise exception 'The current calculation version is not locked.' using errcode = '55000';
    end if;
    update public.studio2_result_operations
    set locked_version = null,
        locked_at = null,
        locked_by = null,
        reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
    v_event_type := 'rule.changed';
  elsif p_action = 'mark_reveal_ready' then
    if v_ops.locked_version is distinct from v_ops.calculation_version or v_ops.calculation_version < 1 then
      raise exception 'Lock the current result version before marking it reveal ready.' using errcode = '55000';
    end if;
    update public.studio2_result_operations
    set reveal_ready_version = calculation_version,
        reveal_ready_at = now(),
        reveal_ready_by = v_actor,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
  elsif p_action = 'clear_reveal_ready' then
    if coalesce((v_pre ->> 'publishedResults')::boolean, false) then
      raise exception 'Make the published result layer private before clearing reveal readiness.' using errcode = '55000';
    end if;
    if v_ops.reveal_ready_version is distinct from v_ops.calculation_version or v_ops.calculation_version < 1 then
      raise exception 'The current calculation version is not marked reveal ready.' using errcode = '55000';
    end if;
    update public.studio2_result_operations
    set reveal_ready_version = null,
        reveal_ready_at = null,
        reveal_ready_by = null,
        updated_at = now()
    where show_id = p_show_id
    returning * into v_ops;
    v_event_type := 'rule.changed';
  end if;

  v_after := private.studio2_result_preconditions(p_show_id);
  v_payload := jsonb_build_object(
    'executionId', p_execution_id,
    'showId', p_show_id,
    'editionId', v_show.edition_id,
    'action', p_action,
    'reason', v_reason,
    'calculationVersion', v_ops.calculation_version,
    'previousVersion', p_expected_version,
    'materializedRows', v_materialized,
    'updatedRows', v_updated,
    'preconditionsBefore', v_pre,
    'preconditionsAfter', v_after,
    'idempotentReplay', false
  );

  insert into public.studio2_result_operation_executions (
    execution_id, edition_id, show_id, action, calculation_version,
    reason, actor_user_id, payload
  ) values (
    p_execution_id, v_show.edition_id, p_show_id, p_action, v_ops.calculation_version,
    v_reason, v_actor, v_payload
  );

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_show.edition_id,
    v_event_type,
    v_actor,
    'show',
    p_show_id::text,
    jsonb_build_object(
      'changeKind', 'results.operation',
      'action', p_action,
      'executionId', p_execution_id,
      'calculationVersion', v_ops.calculation_version,
      'reason', v_reason,
      'preconditions', v_after
    )
  );

  return v_payload;
end
$$;

revoke all on function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint) from public, anon;
grant execute on function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint) to authenticated, service_role;

commit;
