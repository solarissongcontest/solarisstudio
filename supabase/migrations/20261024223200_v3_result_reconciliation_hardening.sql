begin;

-- System V3 Results reconciliation hardening.
--
-- Historical result rows for withdrawn/disqualified participants are deliberate
-- archive evidence and remain intact. Operational readiness is instead derived
-- from the active confirmed lineup. True missing/orphan rows and component
-- divergence remain fail-closed and are reported independently.

select public.v3_register_migration_contract(
  'v3.results.reconciliation-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Make Results readiness active-lineup aware, expose canonical component drift, and add fail-closed calculation diagnostics without deleting historical result evidence.'
);

create or replace function private.studio2_result_reconciliation(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_config jsonb;
  v_jury_scale integer[] := array[]::integer[];
  v_participant_count integer := 0;
  v_active_result_rows integer := 0;
  v_all_result_rows integer := 0;
  v_historical_result_rows integer := 0;
  v_orphan_result_rows integer := 0;
  v_missing_result_rows integer := 0;
  v_jury_mismatches integer := 0;
  v_televote_mismatches integer := 0;
  v_total_mismatches integer := 0;
  v_rank_value_issues integer := 0;
  v_distinct_rank_count integer := 0;
  v_rank_issues integer := 0;
  v_reconcile_issues integer := 0;
begin
  select coalesce(show_row.voting_config, '{}'::jsonb)
  into v_config
  from public.shows show_row
  where show_row.id = p_show_id;

  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  select coalesce(array_agg(scale.value::integer order by scale.ord), array[]::integer[])
  into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config -> 'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);

  with active_participants as (
    select participant.country_id, participant.contest_entity_id
    from public.participants participant
    where participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
  ), result_rows as (
    select result_row.*
    from public.results result_row
    where result_row.show_id = p_show_id
  )
  select
    (select count(*)::integer from active_participants),
    (select count(*)::integer
       from result_rows result_row
      where exists (
        select 1
        from active_participants participant
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      )),
    (select count(*)::integer from result_rows),
    (select count(*)::integer
       from result_rows result_row
      where not exists (
        select 1
        from active_participants participant
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      )
        and exists (
          select 1
          from public.participants participant
          where participant.show_id = p_show_id
            and coalesce(participant.participation_status, 'confirmed') in ('withdrawn', 'disqualified')
            and (
              (participant.country_id is not null and result_row.country_id = participant.country_id)
              or (
                participant.country_id is null
                and participant.contest_entity_id is not null
                and result_row.country_id is null
                and result_row.contest_entity_id = participant.contest_entity_id
              )
            )
        )),
    (select count(*)::integer
       from result_rows result_row
      where not exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and (
            (participant.country_id is not null and result_row.country_id = participant.country_id)
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.country_id is null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      )),
    (select count(*)::integer
       from active_participants participant
      where not exists (
        select 1
        from result_rows result_row
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      ))
  into
    v_participant_count,
    v_active_result_rows,
    v_all_result_rows,
    v_historical_result_rows,
    v_orphan_result_rows,
    v_missing_result_rows;

  with expected_jury as (
    select
      coalesce(vote.receiving_country_id, vote.receiving_entity_id) as identity_id,
      coalesce(sum(vote.points), 0)::integer as points
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
      and (cardinality(v_jury_scale) = 0 or vote.points = any(v_jury_scale))
    group by coalesce(vote.receiving_country_id, vote.receiving_entity_id)
  ), expected_televote as (
    select
      coalesce(vote.country_id, vote.contest_entity_id) as identity_id,
      coalesce(sum(vote.points), 0)::integer as points
    from public.televote_votes vote
    where vote.show_id = p_show_id
    group by coalesce(vote.country_id, vote.contest_entity_id)
  ), active_results as (
    select
      result_row.id,
      result_row.jury_points,
      result_row.televote_points,
      result_row.total_points,
      result_row.final_rank,
      coalesce(expected_jury.points, 0)::integer as expected_jury_points,
      coalesce(expected_televote.points, 0)::integer as expected_televote_points
    from public.results result_row
    left join expected_jury
      on expected_jury.identity_id = coalesce(result_row.country_id, result_row.contest_entity_id)
    left join expected_televote
      on expected_televote.identity_id = coalesce(result_row.country_id, result_row.contest_entity_id)
    where result_row.show_id = p_show_id
      and exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
          and (
            (participant.country_id is not null and result_row.country_id = participant.country_id)
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.country_id is null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      )
  )
  select
    count(*) filter (
      where active_result.jury_points is distinct from active_result.expected_jury_points
    )::integer,
    count(*) filter (
      where active_result.televote_points is distinct from active_result.expected_televote_points
    )::integer,
    count(*) filter (
      where active_result.total_points is distinct from (
        case
          when coalesce((v_config ->> 'weightedScoring')::boolean, false) then
            round(
              active_result.expected_jury_points
                * coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50) / 50
              + active_result.expected_televote_points
                * coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50) / 50
            )::integer
          else active_result.expected_jury_points + active_result.expected_televote_points
        end
      )
    )::integer,
    count(*) filter (
      where active_result.final_rank is null
         or active_result.final_rank < 1
         or active_result.final_rank > greatest(v_participant_count, 1)
    )::integer,
    count(distinct active_result.final_rank)::integer
  into
    v_jury_mismatches,
    v_televote_mismatches,
    v_total_mismatches,
    v_rank_value_issues,
    v_distinct_rank_count
  from active_results active_result;

  v_rank_issues := v_rank_value_issues
    + case
        when v_active_result_rows > 0
         and v_distinct_rank_count <> v_active_result_rows then 1
        else 0
      end;

  v_reconcile_issues :=
      v_missing_result_rows
    + v_orphan_result_rows
    + greatest(v_active_result_rows - v_participant_count, 0)
    + v_jury_mismatches
    + v_televote_mismatches
    + v_total_mismatches
    + v_rank_issues;

  return jsonb_build_object(
    'participantCount', v_participant_count,
    'resultRowCount', v_active_result_rows,
    'activeResultRowCount', v_active_result_rows,
    'allResultRowCount', v_all_result_rows,
    'historicalInactiveResultRowCount', v_historical_result_rows,
    'missingResultRowCount', v_missing_result_rows,
    'orphanResultRowCount', v_orphan_result_rows,
    'extraActiveResultRowCount', greatest(v_active_result_rows - v_participant_count, 0),
    'juryPointsMismatchCount', v_jury_mismatches,
    'televotePointsMismatchCount', v_televote_mismatches,
    'totalPointsMismatchCount', v_total_mismatches,
    'rankIssueCount', v_rank_issues,
    'reconcileIssueCount', v_reconcile_issues,
    'reconciliationConsistent', (
      v_participant_count > 0
      and v_active_result_rows = v_participant_count
      and v_reconcile_issues = 0
    )
  );
end
$reconcile$;

revoke all on function private.studio2_result_reconciliation(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_reconciliation(uuid)
  to service_role;

-- Preserve all established Jury/Televote readiness semantics and replace only
-- the Results projection portion with the stronger active-lineup reconciliation.
alter function private.studio2_result_preconditions(uuid)
  rename to studio2_result_preconditions_v3_base;

revoke all on function private.studio2_result_preconditions_v3_base(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_result_preconditions(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preconditions$
declare
  v_base jsonb;
  v_reconciliation jsonb;
begin
  v_base := private.studio2_result_preconditions_v3_base(p_show_id);
  v_reconciliation := private.studio2_result_reconciliation(p_show_id);

  return v_base
    || v_reconciliation
    || jsonb_build_object(
      'resultReady', coalesce(
        (v_reconciliation ->> 'reconciliationConsistent')::boolean,
        false
      )
    );
end
$preconditions$;

revoke all on function private.studio2_result_preconditions(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions(uuid)
  to service_role;

-- Keep the established operation implementation intact, but wrap its generic
-- reconciliation failure with exact structured evidence. The diagnostic
-- recalculation occurs only inside the exception subtransaction and is rolled
-- back with the raised error, so a failed calculation cannot mutate Results.
alter function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint)
  rename to studio2_execute_result_operation_v3_base;

revoke all on function public.studio2_execute_result_operation_v3_base(uuid, text, text, uuid, bigint)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_execute_result_operation(
  p_show_id uuid,
  p_action text,
  p_reason text,
  p_execution_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $operation$
declare
  v_message text;
  v_diagnostics jsonb;
begin
  begin
    return public.studio2_execute_result_operation_v3_base(
      p_show_id,
      p_action,
      p_reason,
      p_execution_id,
      p_expected_version
    );
  exception
    when sqlstate '55000' then
      get stacked diagnostics v_message = message_text;

      if p_action = 'calculate'
         and v_message = 'Calculated results did not reconcile with the canonical participant/vote data.' then
        begin
          perform public.recalculate_show_results_internal(p_show_id);
          v_diagnostics := private.studio2_result_reconciliation(p_show_id);
        exception
          when others then
            v_diagnostics := jsonb_build_object(
              'diagnosticError', sqlerrm,
              'showId', p_show_id
            );
        end;

        raise exception 'Calculated results did not reconcile with the canonical participant/vote data.'
          using errcode = '55000',
                detail = v_diagnostics::text,
                hint = 'Inspect missing/orphan result rows, Jury/Televote component mismatches, total mismatch, and rankIssueCount.';
      end if;

      raise;
  end;
end
$operation$;

revoke all on function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint)
  from public, anon;
grant execute on function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
