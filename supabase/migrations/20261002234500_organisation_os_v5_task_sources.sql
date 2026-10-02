begin;

-- Organisation OS V5 Task Engine source expansion.
--
-- Add only conditions that have unambiguous authoritative domain truth.
-- Missing-country confirmation work is intentionally NOT derived from an open
-- submission round: a round is a submission window, not a new requirement.

create or replace function private.studio2_reconcile_organizer_tasks_operational(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $$
begin
  -- ----------------------------------------------------------
  -- Existing confirmation / entry submissions awaiting review
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_review'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.submissions submission
      where submission.id::text = task.source_id
        and (
          submission.reviewed = false
          or exists (
            select 1
            from public.internal_entries internal_entry
            where internal_entry.submission_id = submission.id
              and internal_entry.review_status = 'pending'
          )
          or exists (
            select 1
            from public.national_finals national_final
            join public.national_final_entries national_final_entry
              on national_final_entry.national_final_id = national_final.id
            where national_final.submission_id = submission.id
              and national_final_entry.review_status = 'pending'
              and national_final_entry.removed = false
          )
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    submission.edition_id,
    'confirmation_review',
    submission.id::text,
    'confirmation-review:' || submission.id::text,
    'confirmation.review',
    'confirmation.manage',
    'normal',
    'open',
    submission.country || ' confirmation needs review',
    'Review the submitted confirmation and any pending entry-review decisions. This task exists because a submission already exists; opening another round does not create a duplicate requirement.',
    '/confirmations/admin/responses/' || submission.id::text,
    jsonb_build_object(
      'table', 'submissions',
      'id', submission.id,
      'resolvedWhen', 'submission reviewed and no child entry review remains pending'
    ),
    submission.submitted_at,
    null,
    now(),
    now()
  from public.submissions submission
  where (
      submission.reviewed = false
      or exists (
        select 1
        from public.internal_entries internal_entry
        where internal_entry.submission_id = submission.id
          and internal_entry.review_status = 'pending'
      )
      or exists (
        select 1
        from public.national_finals national_final
        join public.national_final_entries national_final_entry
          on national_final_entry.national_final_id = national_final.id
        where national_final.submission_id = submission.id
          and national_final_entry.review_status = 'pending'
          and national_final_entry.removed = false
      )
    )
    and (p_edition_id is null or submission.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Missing jury ballots while the authoritative jury window is open
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'jury_missing_ballots'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.jury_voting_windows jury_window
      where jury_window.show_id::text = task.source_id
        and jury_window.status = 'open'
        and exists (
          select 1
          from public.voters voter
          where voter.show_id = jury_window.show_id
            and voter.country_id is not null
            and not exists (
              select 1
              from public.jury_ballot_submissions ballot
              where ballot.show_id = jury_window.show_id
                and ballot.voter_country_id = voter.country_id
                and ballot.status = 'submitted'
            )
            and not exists (
              select 1
              from public.jury_ballot_statuses ballot_status
              where ballot_status.show_id = jury_window.show_id
                and ballot_status.status = 'did_not_vote'
                and (
                  ballot_status.voter_id = voter.id
                  or (
                    voter.country_id is not null
                    and ballot_status.voter_country_id = voter.country_id
                  )
                  or (
                    voter.contest_entity_id is not null
                    and ballot_status.voter_entity_id = voter.contest_entity_id
                  )
                )
            )
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    jury_window.edition_id,
    'jury_missing_ballots',
    jury_window.show_id::text,
    'jury-missing-ballots:' || jury_window.show_id::text,
    'jury.ballots.missing',
    'jury.ballots.manage',
    'high',
    'open',
    'Jury voting is missing ' || missing.missing_count::text || ' ballot' ||
      case when missing.missing_count = 1 then '' else 's' end,
    'The jury window is open and at least one expected country jury has neither submitted a ballot nor been recorded as did not vote.',
    '/admin/jury/' || edition.slug,
    jsonb_build_object(
      'table', 'jury_voting_windows',
      'showId', jury_window.show_id,
      'resolvedWhen', 'window closed or every expected jury has submitted / DNV state'
    ),
    coalesce(jury_window.opened_at, jury_window.updated_at),
    null,
    now(),
    now()
  from public.jury_voting_windows jury_window
  join public.editions edition on edition.id = jury_window.edition_id
  cross join lateral (
    select count(*)::integer as missing_count
    from public.voters voter
    where voter.show_id = jury_window.show_id
      and voter.country_id is not null
      and not exists (
        select 1
        from public.jury_ballot_submissions ballot
        where ballot.show_id = jury_window.show_id
          and ballot.voter_country_id = voter.country_id
          and ballot.status = 'submitted'
      )
      and not exists (
        select 1
        from public.jury_ballot_statuses ballot_status
        where ballot_status.show_id = jury_window.show_id
          and ballot_status.status = 'did_not_vote'
          and (
            ballot_status.voter_id = voter.id
            or ballot_status.voter_country_id = voter.country_id
            or (
              voter.contest_entity_id is not null
              and ballot_status.voter_entity_id = voter.contest_entity_id
            )
          )
      )
  ) missing
  where jury_window.status = 'open'
    and missing.missing_count > 0
    and (p_edition_id is null or jury_window.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Public-vote submissions requiring integrity moderation
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'televote_suspicious'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.televoting_round_bindings binding
      join televoting.rounds round
        on round.id::text = binding.remote_round_id
      join televoting.vote_submissions submission
        on submission.round_id = round.id
      where round.id::text = task.source_id
        and submission.status = 'suspicious'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    binding.edition_id,
    'televote_suspicious',
    round.id::text,
    'televote-suspicious:' || round.id::text,
    'televote.integrity.review',
    'televote.ballots.manage',
    'high',
    'open',
    suspicious.suspicious_count::text || ' public-vote submission' ||
      case when suspicious.suspicious_count = 1 then ' needs' else 's need' end ||
      ' integrity review',
    'Suspicious public-vote submissions remain unresolved in the authoritative Televoting backend.',
    '/televoting/admin/integrity',
    jsonb_build_object(
      'schema', 'televoting',
      'table', 'vote_submissions',
      'roundId', round.id,
      'resolvedWhen', 'no submissions remain suspicious'
    ),
    suspicious.first_seen_at,
    null,
    now(),
    now()
  from public.televoting_round_bindings binding
  join televoting.rounds round
    on round.id::text = binding.remote_round_id
  cross join lateral (
    select
      count(*)::integer as suspicious_count,
      min(submission.created_at) as first_seen_at
    from televoting.vote_submissions submission
    where submission.round_id = round.id
      and submission.status = 'suspicious'
  ) suspicious
  where suspicious.suspicious_count > 0
    and (p_edition_id is null or binding.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Result lifecycle after a calculation exists
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'result_lifecycle'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_result_operations result_operation
      where result_operation.show_id::text = task.source_id
        and result_operation.calculation_version > 0
        and result_operation.reveal_ready_version is distinct from result_operation.calculation_version
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    result_operation.edition_id,
    'result_lifecycle',
    result_operation.show_id::text,
    'result-lifecycle:' || result_operation.show_id::text,
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'results.review'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'results.lock'
      else 'results.reveal_ready'
    end,
    'results.verify',
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'high'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'high'
      else 'normal'
    end,
    'open',
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'Review ' || show_row.name || ' result calculation'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'Lock the verified ' || show_row.name || ' result'
      else 'Mark ' || show_row.name || ' result reveal ready'
    end,
    case
      when result_operation.reviewed_version is distinct from result_operation.calculation_version
        then 'The current result calculation version has not been reviewed.'
      when result_operation.locked_version is distinct from result_operation.calculation_version
        then 'The reviewed result version has not been locked.'
      else 'The locked result version is not yet marked reveal ready.'
    end,
    '/admin/results',
    jsonb_build_object(
      'table', 'studio2_result_operations',
      'showId', result_operation.show_id,
      'calculationVersion', result_operation.calculation_version,
      'resolvedWhen', 'current calculation version reaches reveal-ready state'
    ),
    coalesce(result_operation.last_calculated_at, result_operation.updated_at),
    null,
    now(),
    now()
  from public.studio2_result_operations result_operation
  join public.shows show_row on show_row.id = result_operation.show_id
  where result_operation.calculation_version > 0
    and result_operation.reveal_ready_version is distinct from result_operation.calculation_version
    and (p_edition_id is null or result_operation.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    task_type = excluded.task_type,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Keep notification resolution aligned with newly-added canonical task sources.
  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$$;

revoke all on function private.studio2_reconcile_organizer_tasks_operational(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
end
$$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

create or replace function public.admin_organizer_tasks(
  p_edition_id uuid default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $$
declare
  v_actor uuid := auth.uid();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_filter not in ('all', 'mine', 'waiting', 'resolved') then
    raise exception 'Unknown task filter: %', v_filter using errcode = '22023';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  if p_edition_id is null
     and not public.studio2_access_allowed('edition.read', null, false)
     and not public.studio2_access_allowed('integrity.read', null, false)
     and not public.studio2_access_allowed('incident.read', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', task.id,
        'editionId', task.edition_id,
        'countryId', task.country_id,
        'assignedTo', task.assigned_to,
        'sourceKind', task.source_kind,
        'sourceKey', task.source_key,
        'taskType', task.task_type,
        'priority', task.priority,
        'state', task.state,
        'title', task.title,
        'description', task.description,
        'href', task.href,
        'dueAt', task.due_at,
        'resolutionPredicate', task.resolution_predicate,
        'ruleReference', task.rule_reference,
        'openedAt', task.opened_at,
        'resolvedAt', task.resolved_at,
        'lastEvaluatedAt', task.last_evaluated_at
      )
      order by
        case task.priority when 'critical' then 1 when 'high' then 2 else 3 end,
        task.due_at asc nulls last,
        task.opened_at desc
    )
    from public.studio2_organizer_tasks task
    where (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
      and public.studio2_access_allowed(task.required_capability, task.edition_id, false)
      and (
        (v_filter = 'all' and task.state <> 'resolved')
        or (v_filter = 'mine' and task.state <> 'resolved' and task.assigned_to = v_actor)
        or (v_filter = 'waiting' and task.state = 'waiting')
        or (v_filter = 'resolved' and task.state = 'resolved')
      )
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_organizer_tasks(uuid, text) from public, anon;
grant execute on function public.admin_organizer_tasks(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_organizer_task_count(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  select count(*)::integer
  into v_count
  from public.studio2_organizer_tasks task
  where task.state <> 'resolved'
    and (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
    and public.studio2_access_allowed(task.required_capability, task.edition_id, false);

  return v_count;
end
$$;

revoke all on function public.admin_organizer_task_count(uuid) from public, anon;
grant execute on function public.admin_organizer_task_count(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
