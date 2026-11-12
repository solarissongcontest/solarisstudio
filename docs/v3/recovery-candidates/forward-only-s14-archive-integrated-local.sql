-- SOLARIS V3 S14 / ARCHIVE FORWARD-EFFECT CANDIDATE. LOCAL REHEARSAL ONLY.
-- NOT a Supabase migration and NEVER a SQL Editor production script.
--
-- This is a deliberately complete, ordered Archive-effect slice. It is NOT
-- the historical versions listed below and MUST NOT be marked as those versions.
-- Requires the separate S13 migration-governance recovery before installation.
-- Twelve canonical source SQL stages are included in chronological dependency
-- order, except their historical private.v3_migration_contracts history writes:
-- one *new* semantic recovery-intent entry records ONLY this forward operation.
-- All source DDL/functions and final convergence fixes otherwise remain intact.
--
-- Independent hosted-head-equivalent isolated rehearsal, history-effect parity,
-- cross-domain dependency certification and explicit owner approval are required.
-- A green synthetic/local clean-chain test does not authorize hosted writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $s14_forward_archive_preflight$
declare
  v_existing text;
  v_absent text;
  v_duplicate text;
begin
  if to_regclass('private.v3_migration_contracts') is null
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null then
    raise exception 'S14 Archive recovery BLOCKED: S13 governance foundation absent';
  end if;

  select required_object into v_absent
    from unnest(array[
      'public.editions','public.shows','public.studio2_edition_runtime',
      'public.studio2_result_operations','public.studio2_organizer_tasks',
      'public.admin_notifications','public.notification_deliveries',
      'public.studio2_operation_receipts','public.studio2_contest_events',
      'private.v3_domain_events','private.v3_domain_event_outbox',
      'public.studio2_next_in_line_windows','public.next_in_line_responses',
      'public.studio2_eligibility_overrides','public.televoting_round_bindings',
      'televoting.rounds'
    ]) required_object
    where to_regclass(required_object) is null limit 1;
  if v_absent is not null then
    raise exception 'S14 Archive recovery BLOCKED: required relation missing %', v_absent;
  end if;

  select wanted into v_absent from unnest(array[
    'private.studio2_reconcile_all_organizer_tasks(uuid)',
    'private.studio2_prune_stale_task_notifications(uuid)',
    'public.studio2_transition_edition_v2(uuid,text,text,uuid)',
    'private.studio2_request_is_service_role()'
  ]) wanted where to_regprocedure(wanted) is null limit 1;
  if v_absent is not null then
    raise exception 'S14 Archive recovery BLOCKED: required original function missing %', v_absent;
  end if;


  -- Catalog-only evidence collected by bounded, READ-ONLY production queries.
  -- Column type and nullability must match the critical preexisting ledgers;
  -- existence-only relation checks can silently accept incompatible schemas.
  -- This is intentionally a subset, not a full hosted-head-equivalence proof.
  select e.rel || '.' || e.col into v_absent
  from (values
    ('public.studio2_edition_runtime', 'edition_id', 'uuid', true),
    ('public.studio2_edition_runtime', 'state', 'text', true),
    ('public.studio2_edition_runtime', 'subsystems', 'jsonb', true),
    ('public.studio2_edition_runtime', 'version', 'bigint', true),
    ('public.studio2_edition_runtime', 'updated_at', 'timestamptz', true),
    ('public.studio2_organizer_tasks', 'id', 'uuid', true),
    ('public.studio2_organizer_tasks', 'edition_id', 'uuid', false),
    ('public.studio2_organizer_tasks', 'state', 'text', true),
    ('public.studio2_organizer_tasks', 'task_type', 'text', true),
    ('public.studio2_organizer_tasks', 'source_key', 'text', true),
    ('public.admin_notifications', 'recipient_id', 'uuid', true),
    ('public.admin_notifications', 'source_key', 'text', false),
    ('public.admin_notifications', 'resolution_mode', 'text', true),
    ('public.admin_notifications', 'requires_action', 'boolean', true),
    ('public.admin_notifications', 'resolved_at', 'timestamptz', false),
    ('public.notification_deliveries', 'subject_id', 'text', true),
    ('public.notification_deliveries', 'category', 'text', true),
    ('public.notification_deliveries', 'status', 'text', true),
    ('public.notification_deliveries', 'scheduled_for', 'timestamptz', true),
    ('private.v3_result_versions', 'show_id', 'uuid', true),
    ('private.v3_result_versions', 'version', 'bigint', true),
    ('private.v3_result_versions', 'result_rows', 'jsonb', true),
    ('public.studio2_operation_receipts', 'operation_id', 'uuid', true),
    ('public.studio2_operation_receipts', 'idempotency_key', 'text', true),
    ('public.studio2_operation_receipts', 'correlation_id', 'uuid', true),
    ('private.v3_domain_events', 'event_type', 'text', true),
    ('private.v3_domain_events', 'aggregate_version', 'bigint', true),
    ('private.v3_domain_events', 'payload', 'jsonb', true),
    ('private.v3_domain_event_outbox', 'event_id', 'uuid', true),
    ('private.v3_domain_event_outbox', 'consumer_key', 'text', true),
    ('private.v3_domain_event_outbox', 'status', 'text', true)
  ) as e(rel,col,typ,must_not_null)
  left join pg_attribute a
    on a.attrelid = to_regclass(e.rel) and a.attname = e.col
    and a.attnum > 0 and not a.attisdropped
  where a.attname is null
     or a.atttypid is distinct from to_regtype(e.typ)
     or a.attnotnull is distinct from e.must_not_null
  limit 1;
  if v_absent is not null then
    raise exception 'S14 Archive recovery BLOCKED: hosted critical column drift %', v_absent;
  end if;

  -- Mandatory runtime dependencies were confirmed through *read-only* hosted
  -- pg_catalog metadata. PostgreSQL may create a PL/pgSQL function even when
  -- external helpers invoked at runtime are missing; refuse that false green.
  -- Optional legacy public.televotes and public.televoting_windows are NOT
  -- included: the canonical source explicitly guards their absence.
  select required_object into v_absent
  from unnest(array[
    'private.v3_result_versions',
    'public.studio2_show_publication_controls',
    'public.submission_rounds', 'public.submissions',
    'public.studio2_confirmation_requirements', 'public.internal_entries',
    'public.national_finals', 'public.national_final_entries',
    'public.next_in_line_submissions', 'public.entries',
    'public.participants', 'public.studio2_media_asset_reviews',
    'public.results', 'public.voters', 'public.jury_votes',
    'public.jury_ballot_statuses', 'public.jury_ballot_submissions',
    'public.jury_voting_windows', 'public.televote_votes',
    'televoting.round_countries','televoting.round_entries',
    'televoting.round_results','televoting.vote_submissions',
    'televoting.vote_entries','televoting.televote_aggregations',
    'televoting.televote_aggregation_sources',
    'televoting.televote_aggregation_participants',
    'televoting.combined_televote_results',
    'televoting.combined_televote_component_results'
  ]) required_object
  where to_regclass(required_object) is null limit 1;
  if v_absent is not null then
    raise exception 'S14 Archive recovery BLOCKED: canonical current-workflow storage missing %', v_absent;
  end if;

  select wanted into v_absent
  from unnest(array[
    'private.studio2_claim_operation(uuid,text,uuid,text,text,jsonb,jsonb)',
    'private.studio2_complete_operation(uuid,jsonb)',
    'private.studio2_default_subsystems(text)',
    'private.studio2_normalise_publication_config(jsonb)',
    'private.studio2_reconcile_confirmation_requirement_tasks(uuid)',
    'private.studio2_reconcile_confirmation_sync_tasks()',
    'private.studio2_reconcile_jury_ballot_review_tasks(uuid)',
    'private.studio2_reconcile_organizer_tasks(uuid)',
    'private.studio2_reconcile_organizer_tasks_operational(uuid)',
    'private.studio2_reconcile_organizer_tasks_truth(uuid)',
    'private.studio2_reconcile_permission_approval_tasks()',
    'private.studio2_reconcile_system_job_tasks()',
    'private.studio2_repair_jury_missing_ballot_tasks(uuid)',
    'private.studio2_sync_task_notifications(uuid)',
    'private.studio2_task_recipient_eligible(uuid,uuid)',
    'private.studio2_transition_risk(text,text)',
    'private.v3_emit_domain_event(text,text,text,bigint,uuid,uuid,uuid,jsonb,integer,text[])',
    'private.v3_publication_result_version_release_ready(uuid,bigint)',
    'public.studio2_access_allowed(text,uuid,boolean)',
    'public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)',
    'public.studio2_transition_edition_v2(uuid,text,text,uuid)'
  ]) wanted
  where to_regprocedure(wanted) is null limit 1;
  if v_absent is not null then
    raise exception 'S14 Archive recovery BLOCKED: required upstream RPC missing %', v_absent;
  end if;

  -- These are the source-owned NEW Archive identities absent in the observed
  -- production catalog. If ANY is present, stop for semantic effect parity.
  select wanted into v_existing from unnest(array[
    'private.v3_resolve_archived_edition_workflow_tasks(uuid)',
    'private.v3_reconcile_resolved_task_notifications(uuid)',
    'private.v3_project_resolved_task_delivery_state()',
    'private.v3_guard_archive_runtime_transition()',
    'private.v3_edition_final_results_ready(uuid)',
    'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)',
    'private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)',
    'public.studio2_process_edition_domain_event(uuid,text,text)',
    'private.v3_archive_task_type_is_current_workflow(text)',
    'private.v3_guard_archived_edition_task_resurrection()',
    'private.v3_sync_archived_edition_legacy_status()',
    'private.v3_guard_archived_legacy_edition_status()',
    'private.v3_archived_workflow_row_edition(jsonb)',
    'private.v3_guard_archived_edition_workflow_write()',
    'private.v3_arm_archive_runtime_transition_gate(uuid)',
    'private.v3_televote_row_solaris_editions(text,jsonb)',
    'private.v3_guard_archived_televote_write()',
    'private.v3_archive_task_reconciliation_gate_active(uuid)'
  ]) wanted where to_regprocedure(wanted) is not null limit 1;
  if v_existing is not null then
    raise exception 'S14 Archive recovery BLOCKED: function already exists %', v_existing;
  end if;

  if to_regclass('private.v3_archive_runtime_transition_gates') is not null
    or to_regclass('private.v3_archive_task_reconciliation_gates') is not null then
    raise exception 'S14 Archive recovery BLOCKED: partial private gate installation detected';
  end if;
  if exists (
    select 1 from pg_trigger t where not t.tgisinternal and t.tgname = any(array[
      'v3_guard_archive_runtime_transition',
      'v3_guard_archive_runtime_update','v3_guard_archive_runtime_insert',
      'v3_guard_archive_runtime_delete',
      'v3_guard_archived_edition_task_resurrection',
      'v3_project_resolved_task_delivery_state',
      'v3_guard_archived_edition_workflow_write',
      'v3_guard_archived_televote_write',
      'v3_sync_archived_edition_legacy_status',
      'v3_guard_archived_legacy_edition_status'
    ])
  ) then
    raise exception 'S14 Archive recovery BLOCKED: preexisting Archive trigger collision';
  end if;
  if exists (
    select 1 from private.v3_migration_contracts c
    where c.migration_key = any(array[
      'v3.s14.archive-consequence-reconciliation',
      'v3.s14.transition-http409',
      'v3.s14.archive-task-registry-alignment',
      'v3.s14.resolved-task-notification-invariant',
      'v3.s14.archive-invariant-forward-fixes',
      'v3.s14.archive-guard-authority-forward-fix',
      'v3.s14.failed-task-delivery-evidence',
      'v3.s14.final-results-readiness-hardening',
      'v3.s14.resolved-task-delivery-reconciliation',
      'v3.s14.archive-runtime-update-guard',
      'v3.s14.task-reconciliation-service-boundary',
      'v3.s14.archive-reconciliation-convergence',
      'v3.s14.archive-forward-effect-recovery'
    ])
  ) then
    raise exception 'S14 Archive recovery BLOCKED: semantic history / recovery key already recorded; reconcile first';
  end if;

  -- Existing upstream helpers must retain their expected schema and owner.
  if exists (
    select 1 from pg_proc p where p.oid = any(array[
      to_regprocedure('private.studio2_reconcile_all_organizer_tasks(uuid)')::oid,
      to_regprocedure('private.studio2_prune_stale_task_notifications(uuid)')::oid
    ]) and (p.prosecdef is false or pg_get_userbyid(p.proowner) <> 'postgres')
  ) then
    raise exception 'S14 Archive recovery BLOCKED: unexpected upstream worker owner/definer';
  end if;
end
$s14_forward_archive_preflight$;

-- This is a *new effect-recovery declaration*, not an assertion that any of
-- the twelve missing historical migration versions were applied.
insert into private.v3_migration_contracts
  (migration_key,schema_version,rollback_mode,destructive,backfill_key,reason)
values
  ('v3.s14.archive-forward-effect-recovery',1,'forward_fix_only',false,null,
   'Forward-only recovery of the twelve ordered S14 Archive effect stages; historical migrations were not replayed or marked applied. Approval and release parity remain separate.')
on conflict (migration_key) do nothing;

-- =====================================================================
-- Canonical source effects: 20261019112100_v3_s14_archive_consequence_reconciliation.sql (history INSERT omitted)
-- =====================================================================

-- Solaris Studio V3 / S14: canonical archive transition + consequence
-- reconciliation, adopted through the S13 migration-hardening framework.
--
-- Canonical lifecycle authority is public.studio2_edition_runtime. The legacy
-- public.editions.status column remains compatibility/catalog metadata and is
-- deliberately not independently rewritten by V3 lifecycle mutations.
--
-- Show-scoped Jury, Televote and Results lifecycles are orthogonal V3 domains.
-- A multi-show edition may reconcile its coarse edition runtime to `results`
-- only after canonical Grand Final publication points at retained immutable
-- result evidence. Archive itself remains strictly results -> post_edition ->
-- archived.

-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

-- ---------------------------------------------------------------------------
-- Archive-aware Organizer work reconciliation
-- ---------------------------------------------------------------------------

create or replace function private.v3_resolve_archived_edition_workflow_tasks(
  p_edition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_resolved integer := 0;
begin
  if p_edition_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = p_edition_id
      and runtime.state = 'archived'
  ) then
    return 0;
  end if;

  -- Resolve only current-contest operational work whose underlying mutation is
  -- impossible after Archive. Governance/history work (for example incidents
  -- or integrity investigations) is intentionally not blanket-resolved.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.edition_id = p_edition_id
    and task.state <> 'resolved'
    and task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\.(transition|subsystem))\.';

  get diagnostics v_resolved = row_count;
  return v_resolved;
end
$resolve$;

revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.v3_reconcile_resolved_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
begin
  -- Historical Inbox evidence remains. Only its current-action claim is ended.
  update public.admin_notifications notification
  set resolved_at = coalesce(notification.resolved_at, task.resolved_at, now()),
      requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

-- Keep the existing domain reconcilers as the one rebuild path. They may
-- rediscover ordinary work first; Archive is applied last so impossible current
-- contest work cannot resurrect. Notifications are then synchronized and stale
-- deliveries are suppressed by the existing delivery-safety reconciler.
create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();

  if p_edition_id is not null then
    perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id);
  else
    perform private.v3_resolve_archived_edition_workflow_tasks(runtime.edition_id)
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived';
  end if;

  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.v3_reconcile_resolved_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One lifecycle authority + archive guard
-- ---------------------------------------------------------------------------

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if new.state = 'archived'
     and old.state is distinct from 'archived'
     and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
    raise exception 'Archive transition must use the canonical V3 lifecycle command.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archive_runtime_transition
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_transition
before update of state on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- Grand Final publication is the canonical cross-domain prerequisite for
-- reconciling the coarse edition runtime to results. Every final-like show must
-- have a public publication control pointing to retained, non-empty immutable
-- result evidence.
create or replace function private.v3_edition_final_results_ready(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  with final_shows as (
    select show_row.id
    from public.shows show_row
    where show_row.edition_id = p_edition_id
      and lower(replace(replace(coalesce(show_row.kind, ''), '_', '-'), ' ', '-'))
          in ('grand-final', 'final')
  )
  select
    exists (select 1 from final_shows)
    and not exists (
      select 1
      from final_shows final_show
      where not exists (
        select 1
        from public.studio2_show_publication_controls control
        join private.v3_result_versions result_version
          on result_version.show_id = control.show_id
         and result_version.version = control.source_result_version
         and result_version.edition_id = control.edition_id
        where control.show_id = final_show.id
          and control.edition_id = p_edition_id
          and control.state = 'public'
          and control.source_result_version is not null
          and result_version.result_row_count > 0
      )
    )
$ready$;

revoke all on function private.v3_edition_final_results_ready(uuid)
  from public, anon, authenticated;

-- Canonical browser-callable V3 lifecycle mutation authority.
create or replace function public.studio2_transition_edition_v3(
  p_edition_id uuid,
  p_to text,
  p_reason text,
  p_approval_request_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $transition$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_required_capability text;
  v_claim_risk text;
  v_claim jsonb;
  v_runtime public.studio2_edition_runtime%rowtype;
  v_from text;
  v_risk text;
  v_reconciled_final_results boolean := false;
  v_approval public.studio2_transition_approval_requests%rowtype;
  v_result jsonb;
  v_server_time timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or nullif(btrim(coalesce(p_to, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_operation_id is null
     or v_key is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim_risk := case when p_approval_request_id is null then 'R2' else 'R3' end;

  -- Claim before evaluating mutable runtime state so an exact retry after a
  -- committed transition returns the original receipt instead of re-executing
  -- against already-advanced state. The S2 fingerprint binds semantic request.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    p_operation_id,
    'edition.transition',
    v_claim_risk,
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'to', p_to,
      'reason', v_reason,
      'approvalRequestId', p_approval_request_id,
      'expectedRuntimeVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = 'Edition transition operation exists but is not in a replayable succeeded state.';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id
  for update;

  if v_runtime.edition_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'STATE_CHANGED',
      detail = 'Canonical edition runtime does not exist.';
  end if;

  if v_runtime.version is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = format(
        'Expected edition runtime version %s, current version is %s.',
        p_expected_version,
        v_runtime.version
      ),
      hint = 'Reload the Control Room and review the current lifecycle state before trying again.';
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  -- V3 does not encode every show-level Jury/Televote/Results cycle into the
  -- edition runtime. Allow one reconciliation edge only when final publication
  -- proves the edition genuinely reached Results. This cannot move
  -- post_edition/archive backwards and cannot run without immutable final data.
  if v_risk is null
     and p_to = 'results'
     and v_from in (
       'submissions',
       'pre_show',
       'rehearsals',
       'jury_voting',
       'live_show',
       'televoting',
       'vote_verification'
     )
     and private.v3_edition_final_results_ready(p_edition_id) then
    v_risk := 'normal';
    v_reconciled_final_results := true;
  end if;

  if v_risk is null then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = format('Edition cannot transition from %s to %s.', v_from, p_to);
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = format('A reason is required for %s edition transitions.', v_risk);
  end if;

  if v_risk = 'critical' then
    if p_approval_request_id is null then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'An approved second-person request is required for critical edition transitions.';
    end if;

    select approval.*
    into v_approval
    from public.studio2_transition_approval_requests approval
    where approval.id = p_approval_request_id
    for update;

    if v_approval.id is null
       or v_approval.edition_id <> p_edition_id
       or v_approval.from_state <> v_from
       or v_approval.to_state <> p_to
       or v_approval.requested_by <> v_actor
       or v_approval.approved_by is null
       or v_approval.approved_by = v_actor
       or v_approval.approved_at is null
       or v_approval.consumed_at is not null
       or v_approval.expires_at <= now()
       or v_approval.reason <> v_reason then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'Critical transition approval is missing, stale, mismatched, or already consumed.';
    end if;
  elsif p_approval_request_id is not null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Approval request ids are only valid for critical transitions.';
  end if;

  if p_to = 'archived' then
    perform set_config('solaris.v3_archive_command', 'allowed', true);
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.edition_id is null then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id
      and consumed_at is null;

    if not found then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
  end if;

  v_server_time := clock_timestamp();

  insert into public.studio2_contest_events (
    edition_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'operationId', p_operation_id,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version,
      'reconciledFromFinalPublication', v_reconciled_final_results
    )
  );

  if p_to = 'archived' then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
    ) values (
      p_edition_id,
      'edition.archived',
      v_actor,
      'edition',
      p_edition_id::text,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'operationId', p_operation_id,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'editionId', p_edition_id,
    'from', v_from,
    'previousRuntimeVersion', p_expected_version,
    'state', v_runtime.state,
    'runtimeVersion', v_runtime.version,
    'serverTime', v_server_time,
    'replayed', false,
    'reconciledFromFinalPublication', v_reconciled_final_results,
    'runtime', to_jsonb(v_runtime)
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);

  perform private.v3_emit_domain_event(
    'edition.state_changed',
    'edition',
    p_edition_id::text,
    v_runtime.version,
    p_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version,
      'reconciledFromFinalPublication', v_reconciled_final_results,
      'lifecycleAuthority', 'studio2_edition_runtime'
    ),
    1,
    array[]::text[]
  );

  if p_to = 'archived' then
    perform private.v3_emit_domain_event(
      'edition.archived',
      'edition',
      p_edition_id::text,
      v_runtime.version,
      p_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version,
        'legacyStatus', (
          select edition.status
          from public.editions edition
          where edition.id = p_edition_id
        ),
        'lifecycleAuthority', 'studio2_edition_runtime'
      ),
      1,
      array['edition.tasks']::text[]
    );
  end if;

  return v_result;
end
$transition$;

-- V3 is now the only browser-callable edition lifecycle mutation authority.
-- The legacy RPC remains service-role readable for compatibility/recovery, but
-- its Archive update is also fenced by the runtime trigger above.
revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  to service_role;

revoke all on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) from public, anon;
grant execute on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) to authenticated, service_role;

comment on function private.v3_edition_final_results_ready(uuid) is
  'True only when every Grand Final/final show for the edition has public publication control pointing to retained non-empty immutable V3 result evidence.';

comment on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) is
  'Canonical V3 edition lifecycle mutation authority. Requires reviewed runtime version plus stable operation/idempotency identity; may reconcile coarse runtime to results only after authoritative Grand Final publication; returns a durable reconciliable receipt result.';

-- ---------------------------------------------------------------------------
-- Archive DomainEvent consumer
-- ---------------------------------------------------------------------------

create or replace function public.studio2_process_edition_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $process$
declare
  v_event private.v3_domain_events%rowtype;
  v_delivery private.v3_domain_event_outbox%rowtype;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_event_id is null
     or p_consumer_key <> 'edition.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid edition domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null or v_event.event_type <> 'edition.archived' then
    raise exception 'Edition consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Edition domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.v3_domain_event_consumer_receipts receipt
    where receipt.event_id = p_event_id
      and receipt.consumer_key = p_consumer_key
  ) then
    return public.studio2_complete_domain_event_delivery(
      p_event_id,
      p_consumer_key,
      p_worker_id,
      '{}'::jsonb
    );
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Edition domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);

  v_metadata := jsonb_build_object(
    'effect', 'archive-task-notification-reconciliation',
    'editionId', v_event.edition_id,
    'runtimeState', 'archived'
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_edition_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_edition_domain_event(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- =====================================================================
-- Canonical source effects: 20261019112200_v3_s14_final_results_readiness_hardening.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 follow-up: final-publication reconciliation may advance the
-- coarse edition runtime to results only when the actual Results layer is
-- public and bound to an exact current reviewed/locked/reveal-ready immutable
-- result version. A merely-public show, or publication of qualifiers alone, is
-- not enough evidence that the contest has reached final Results.

-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.v3_edition_final_results_ready(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  with final_shows as (
    select show_row.id
    from public.shows show_row
    where show_row.edition_id = p_edition_id
      and lower(replace(replace(coalesce(show_row.kind, ''), '_', '-'), ' ', '-'))
          in ('grand-final', 'final')
  ),
  evidenced_final_shows as (
    select final_show.id
    from final_shows final_show
    join public.studio2_show_publication_controls control
      on control.show_id = final_show.id
     and control.edition_id = p_edition_id
     and control.state = 'public'
     and coalesce(
       (private.studio2_normalise_publication_config(control.frozen_config) ->> 'results')::boolean,
       false
     )
     and control.source_result_version is not null
    join private.v3_result_versions result_version
      on result_version.show_id = final_show.id
     and result_version.edition_id = p_edition_id
     and result_version.version = control.source_result_version
     and result_version.result_row_count > 0
    where private.v3_publication_result_version_release_ready(
      final_show.id,
      control.source_result_version
    )
  )
  select exists (select 1 from final_shows)
     and not exists (
       select 1
       from final_shows final_show
       where not exists (
         select 1
         from evidenced_final_shows evidenced
         where evidenced.id = final_show.id
       )
     );
$ready$;

revoke all on function private.v3_edition_final_results_ready(uuid)
  from public, anon, authenticated;

comment on function private.v3_edition_final_results_ready(uuid) is
  'S14 coarse-runtime reconciliation guard: every Grand Final/final show must have its Results layer public with an exact non-empty release-ready immutable result version.';

notify pgrst, 'reload schema';

-- =====================================================================
-- Canonical source effects: 20261019112300_v3_s14_transition_http409.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- studio2_transition_edition_v3 is a browser-facing governed operation. Its
-- stale-version and illegal-state branches are deterministic application
-- conflicts, not PostgreSQL serialization failures. PostgREST treats SQLSTATE
-- 40001 as retryable, so keeping 40001 here can replay a command that is known
-- to be stale and eventually surface as a gateway failure instead of HTTP 409.
--
-- The same canonical function originally emitted a V3 DomainEvent named
-- edition.state_changed even though the canonical Edition registry owns the
-- event as edition.transitioned. Keep the legacy contest-event audit vocabulary
-- unchanged, but normalize the S4 DomainEvent vocabulary here so System/S15 has
-- one canonical event name.
--
-- Keep the genuine DomainEvent worker lease conflict on 40001. Only the exact
-- V3 lifecycle command definition is rewritten.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

do $normalize_transition_contract$
declare
  v_signature constant text :=
    'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)';
  v_old_domain_event constant text := E'perform private.v3_emit_domain_event(\n    ''edition.state_changed'',';
  v_new_domain_event constant text := E'perform private.v3_emit_domain_event(\n    ''edition.transitioned'',';
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_function := to_regprocedure(v_signature);
  if v_function is null then
    raise exception 'Canonical V3 edition transition function is missing';
  end if;

  select pg_get_functiondef(v_function::oid)
  into v_definition;

  if position('''40001''' in v_definition) = 0 then
    raise exception
      'Expected deterministic SQLSTATE 40001 was not found in %; review the forward fix instead of silently skipping it',
      v_signature;
  end if;
  if position(v_old_domain_event in v_definition) = 0 then
    raise exception
      'Expected canonical edition.state_changed DomainEvent call was not found in %; review lifecycle event vocabulary instead of silently skipping it',
      v_signature;
  end if;

  v_rewritten := replace(v_definition, '''40001''', '''PT409''');
  v_rewritten := replace(v_rewritten, v_old_domain_event, v_new_domain_event);
  if v_rewritten is not distinct from v_definition then
    raise exception 'Could not normalize V3 edition transition contract';
  end if;

  execute v_rewritten;

  v_function := to_regprocedure(v_signature);
  if v_function is null then
    raise exception 'V3 edition transition function identity changed during normalization';
  end if;

  select pg_get_functiondef(v_function::oid)
  into v_definition;

  if position('''40001''' in v_definition) > 0 then
    raise exception 'Deterministic SQLSTATE 40001 remains in V3 edition transition';
  end if;
  if position('''PT409''' in v_definition) = 0 then
    raise exception 'HTTP 409 SQLSTATE was not installed in V3 edition transition';
  end if;
  if position(v_old_domain_event in v_definition) > 0 then
    raise exception 'Canonical edition.state_changed DomainEvent remains in V3 edition transition';
  end if;
  if position(v_new_domain_event in v_definition) = 0 then
    raise exception 'Canonical edition.transitioned DomainEvent was not installed in V3 edition transition';
  end if;
end
$normalize_transition_contract$;

-- The archive consumer is a leased S4 worker boundary. Its lost/stale lease is
-- a genuine retry/serialization condition and must remain 40001.
do $assert_worker_retry_semantics$
declare
  v_worker regprocedure;
  v_definition text;
begin
  v_worker := to_regprocedure(
    'public.studio2_process_edition_domain_event(uuid,text,text)'
  );
  if v_worker is null then
    raise exception 'Canonical edition DomainEvent consumer is missing';
  end if;

  select pg_get_functiondef(v_worker::oid)
  into v_definition;

  if position('''40001''' in v_definition) = 0 then
    raise exception
      'Edition DomainEvent lease conflict no longer retains genuine serialization retry semantics';
  end if;
end
$assert_worker_retry_semantics$;

notify pgrst, 'reload schema';

-- =====================================================================
-- Canonical source effects: 20261019112400_v3_s14_archive_task_registry_alignment.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- The canonical Edition registry declares `edition.blocker` as Edition-owned
-- task vocabulary. Archive reconciliation already resolves legacy/current
-- edition.transition.* and edition.subsystem.* work, but it must also terminate
-- the canonical blocker task once the edition is irreversibly archived.
--
-- More importantly, that rule is a database invariant rather than merely a
-- property of today's reconciliation function. Future task producers must not
-- be able to resurrect impossible current-contest work after Archive.
-- Governance/history task families remain intentionally untouched.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.v3_archive_task_type_is_current_workflow(
  p_task_type text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $candidate$
  select
    coalesce(p_task_type, '') ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast)\.'
    or coalesce(p_task_type, '') ~ '^edition\.(transition|subsystem)\.'
    or coalesce(p_task_type, '') = 'edition.blocker';
$candidate$;

revoke all on function private.v3_archive_task_type_is_current_workflow(text)
  from public, anon, authenticated;

create or replace function private.v3_resolve_archived_edition_workflow_tasks(
  p_edition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_resolved integer := 0;
begin
  if p_edition_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = p_edition_id
      and runtime.state = 'archived'
  ) then
    return 0;
  end if;

  -- Resolve only current-contest operational work whose underlying mutation is
  -- impossible after Archive. Incident/integrity/governance work is deliberately
  -- not part of the candidate vocabulary above.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.edition_id = p_edition_id
    and task.state <> 'resolved'
    and private.v3_archive_task_type_is_current_workflow(task.task_type);

  get diagnostics v_resolved = row_count;
  return v_resolved;
end
$resolve$;

revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)
  from public, anon, authenticated;

comment on function private.v3_resolve_archived_edition_workflow_tasks(uuid) is
  'Resolve archived-edition current-workflow Organizer tasks, including canonical edition.blocker, while preserving governance/history work.';

create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = new.edition_id
      and runtime.state = 'archived'
  ) then
    new.state := 'resolved';
    new.resolved_at := coalesce(new.resolved_at, now());
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_edition_task_resurrection
  on public.studio2_organizer_tasks;
create trigger v3_guard_archived_edition_task_resurrection
before insert or update on public.studio2_organizer_tasks
for each row execute function private.v3_guard_archived_edition_task_resurrection();

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Fail-safe task projection invariant: impossible current-workflow tasks for archived editions remain historical rows but cannot become actionable again.';

-- =====================================================================
-- Canonical source effects: 20261019112500_v3_s14_resolved_task_notification_invariant.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- Organizer Task state is canonical workflow truth. A resolved Task must never
-- project as an actionable Inbox item or remain deliverable merely because one
-- caller forgot to run the aggregate notification reconciler afterward.
--
-- This is intentionally general rather than Archive-specific: Archive is the
-- scenario that exposed the gap, but the invariant belongs to every domain-
-- backed Organizer Task.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

-- Keep the existing fan-out and push semantics, but derive current-action state
-- from the Task itself. The old implementation copied resolved_at correctly yet
-- unconditionally set requires_action=true in the same update.
create or replace function private.studio2_sync_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $sync$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  -- Domain Task state is authoritative for every Task-backed Inbox item.
  update public.admin_notifications notification
  set
    resolved_at = task.resolved_at,
    requires_action = task.state <> 'resolved',
    resolution_mode = 'domain'
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is distinct from task.resolved_at
      or notification.requires_action is distinct from (task.state <> 'resolved')
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- Assigned Tasks notify only the assigned capable operator. Unassigned Tasks,
  -- or assignments that lost permission, fan out to operators who actually
  -- hold the Task's required capability in the same scope.
  with active_tasks as (
    select task.*
    from public.studio2_organizer_tasks task
    where task.state <> 'resolved'
      and (
        p_edition_id is null
        or task.edition_id is null
        or task.edition_id = p_edition_id
      )
  ),
  recipients as (
    select
      task.id as task_id,
      task.assigned_to as user_id
    from active_tasks task
    where task.assigned_to is not null
      and private.studio2_user_has_capability(
        task.assigned_to,
        task.required_capability,
        task.edition_id
      )

    union

    select
      task.id,
      direct_grant.user_id
    from active_tasks task
    join public.studio2_capability_grants direct_grant
      on direct_grant.capability = task.required_capability
     and (direct_grant.expires_at is null or direct_grant.expires_at > now())
     and (
       direct_grant.edition_id is null
       or (
         task.edition_id is not null
         and direct_grant.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      assignment.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.studio2_role_assignments assignment
      on assignment.role_key = role_capability.role_key
     and (assignment.expires_at is null or assignment.expires_at > now())
     and (
       assignment.edition_id is null
       or (
         task.edition_id is not null
         and assignment.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      legacy_role.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.user_roles legacy_role
      on legacy_role.role::text = role_capability.role_key
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )
  )
  insert into public.admin_notifications (
    recipient_id,
    severity,
    title,
    body,
    href,
    source_key,
    read_at,
    resolved_at,
    requires_action,
    resolution_mode
  )
  select distinct
    recipient.user_id,
    case
      when task.priority = 'critical' then 'critical'
      when task.priority = 'high' then 'action'
      else 'warning'
    end,
    task.title,
    task.description,
    task.href,
    task.source_key,
    null::timestamptz,
    null::timestamptz,
    true,
    'domain'
  from recipients recipient
  join active_tasks task on task.id = recipient.task_id
  where recipient.user_id is not null
  on conflict (recipient_id, source_key)
    where source_key is not null
  do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    requires_action = true,
    resolution_mode = 'domain',
    resolved_at = null,
    read_at = case
      when public.admin_notifications.resolved_at is not null
        then null
      else public.admin_notifications.read_at
    end;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- High and critical Task activations join the existing push queue. This is a
  -- required Organizer delivery class: global push enable/disable and quiet
  -- hours still apply, but it is not disguised as a participant category.
  insert into public.notification_deliveries (
    user_id,
    category,
    event_type,
    subject_id,
    dedupe_key,
    route,
    title,
    body,
    scheduled_for
  )
  select
    notification.recipient_id,
    'organizer_tasks',
    case
      when task.priority = 'critical'
        then 'organizer_task.critical'
      else 'organizer_task.high'
    end,
    task.id::text,
    'organizer-task:' || task.source_key || ':' || notification.recipient_id::text,
    task.href,
    task.title,
    left(task.description, 240),
    now()
  from public.admin_notifications notification
  join public.studio2_organizer_tasks task
    on task.source_key = notification.source_key
  where notification.resolution_mode = 'domain'
    and notification.requires_action = true
    and notification.resolved_at is null
    and task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$sync$;

revoke all on function private.studio2_sync_task_notifications(uuid)
  from public, anon, authenticated;

-- Immediate fail-safe for code paths that resolve a Task but do not invoke the
-- aggregate reconciler in the same transaction. Historical notification rows
-- remain; only their present-tense action claim and still-undelivered pending /
-- in-flight push attempts are ended. A failed attempt is historical evidence,
-- not an undelivered placeholder, and must retain its original failure/error.
create or replace function private.v3_project_resolved_task_delivery_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $project$
begin
  if new.state <> 'resolved' then
    return new;
  end if;

  update public.admin_notifications notification
  set
    resolved_at = coalesce(new.resolved_at, notification.resolved_at, now()),
    requires_action = false,
    resolution_mode = 'domain'
  where notification.source_key = new.source_key
    and notification.resolution_mode = 'domain'
    and (
      notification.resolved_at is distinct from coalesce(new.resolved_at, notification.resolved_at, now())
      or notification.requires_action
    );

  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = 'Organizer Task resolved before delivery.'
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = new.id::text
    and delivery.status in ('pending', 'processing');

  return new;
end
$project$;

revoke all on function private.v3_project_resolved_task_delivery_state()
  from public, anon, authenticated;

drop trigger if exists v3_project_resolved_task_delivery_state
  on public.studio2_organizer_tasks;
create trigger v3_project_resolved_task_delivery_state
after insert or update of state, resolved_at on public.studio2_organizer_tasks
for each row execute function private.v3_project_resolved_task_delivery_state();

comment on function private.v3_project_resolved_task_delivery_state() is
  'Project canonical Organizer Task resolution immediately into historical Inbox action state, suppress pending/in-flight task pushes, and preserve failed delivery attempts as immutable evidence.';

-- =====================================================================
-- Canonical source effects: 20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- The immediate Task-resolution trigger added by the S14 notification
-- invariant protects new state transitions. Reconciliation must also repair
-- delivery rows that pre-date that trigger, or that were restored/poisoned
-- after the transition. Keep the historical rows and end only their current
-- claim to be deliverable. Failed attempts remain failed historical evidence;
-- later governed retry paths already recheck canonical Task state.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.v3_reconcile_resolved_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  -- Historical Inbox evidence remains. Only its current-action claim is ended.
  update public.admin_notifications notification
  set resolved_at = coalesce(notification.resolved_at, task.resolved_at, now()),
      requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- Pending and in-flight attempts are no longer deliverable after their Task
  -- resolves. Failed attempts are immutable failure evidence and are left in
  -- failed state with the original error for verification/governed retry.
  update public.notification_deliveries delivery
  set status = 'suppressed',
      processing_started_at = null,
      error = 'Organizer Task resolved before delivery.'
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing')
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.v3_reconcile_resolved_task_notifications(uuid) is
  'Reconcile resolved Organizer Tasks into retained non-actionable Inbox evidence and suppress pending/in-flight task deliveries while preserving failed attempts as historical evidence.';

-- =====================================================================
-- Canonical source effects: 20261020130000_v3_s14_archive_invariant_forward_fixes.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- Archive is irreversible even for database owners and service-role workers.
-- Keep historical Task and delivery evidence stable, freeze current-workflow
-- data after Archive, and keep the legacy public edition status as a derived
-- compatibility projection of canonical studio2_edition_runtime while readers
-- finish cutting over.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if tg_op = 'INSERT' then
    if new.state = 'archived'
       and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
      raise exception 'Archive transition must use the canonical V3 lifecycle command.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.state = 'archived' then
      raise exception 'Archived edition runtime is irreversible.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.state = 'archived'
     and new.state is distinct from old.state then
    raise exception 'Archived edition runtime is irreversible.'
      using errcode = '42501';
  end if;

  if new.state = 'archived'
     and old.state is distinct from 'archived'
     and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
    raise exception 'Archive transition must use the canonical V3 lifecycle command.'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archive_runtime_insert
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_insert
before insert on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

drop trigger if exists v3_guard_archive_runtime_delete
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_delete
before delete on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- Public readers still consuming editions.status must not keep an archived
-- edition in an active/submissions presentation. studio2_edition_runtime stays
-- authoritative; this field is only a one-way compatibility projection.
create or replace function private.v3_sync_archived_edition_legacy_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $sync$
begin
  if new.state = 'archived'
     and (tg_op = 'INSERT' or old.state is distinct from new.state) then
    update public.editions
    set status = 'completed'
    where id = new.edition_id
      and status not in ('completed', 'finished');
  end if;
  return new;
end
$sync$;

revoke all on function private.v3_sync_archived_edition_legacy_status()
  from public, anon, authenticated;

drop trigger if exists v3_sync_archived_edition_legacy_status
  on public.studio2_edition_runtime;
create trigger v3_sync_archived_edition_legacy_status
after insert or update of state on public.studio2_edition_runtime
for each row execute function private.v3_sync_archived_edition_legacy_status();

update public.editions edition
set status = 'completed'
from public.studio2_edition_runtime runtime
where runtime.edition_id = edition.id
  and runtime.state = 'archived'
  and edition.status not in ('completed', 'finished');

create or replace function private.v3_guard_archived_legacy_edition_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $guard$
begin
  if new.status not in ('completed', 'finished')
     and exists (
       select 1
       from public.studio2_edition_runtime runtime
       where runtime.edition_id = new.id
         and runtime.state = 'archived'
     ) then
    raise exception 'Archived edition lifecycle is read-only.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_legacy_edition_status()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_legacy_edition_status on public.editions;
create trigger v3_guard_archived_legacy_edition_status
before update of status on public.editions
for each row execute function private.v3_guard_archived_legacy_edition_status();

-- Resolve the edition owned by a current-workflow row without making every
-- child table duplicate edition_id. Historical/audit rows are not passed
-- through this helper because they intentionally remain outside the freeze.
create or replace function private.v3_archived_workflow_row_edition(p_row jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $resolve$
declare
  v_id uuid;
begin
  if p_row is null then
    return null;
  end if;

  if nullif(p_row ->> 'edition_id', '') is not null then
    return (p_row ->> 'edition_id')::uuid;
  end if;

  if nullif(p_row ->> 'show_id', '') is not null then
    select show.edition_id
    into v_id
    from public.shows show
    where show.id = (p_row ->> 'show_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'submission_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.submissions submission
    where submission.id = (p_row ->> 'submission_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'national_final_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.national_finals national_final
    join public.submissions submission on submission.id = national_final.submission_id
    where national_final.id = (p_row ->> 'national_final_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'round_id', '') is not null then
    select round.edition_id
    into v_id
    from public.submission_rounds round
    where round.id = (p_row ->> 'round_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'source_submission_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.submissions submission
    where submission.id = (p_row ->> 'source_submission_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'participant_id', '') is not null then
    select participant.edition_id
    into v_id
    from public.participants participant
    where participant.id = (p_row ->> 'participant_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'entry_id', '') is not null then
    select entry.edition_id
    into v_id
    from public.entries entry
    where entry.id = (p_row ->> 'entry_id')::uuid;
    return v_id;
  end if;

  return null;
end
$resolve$;

revoke all on function private.v3_archived_workflow_row_edition(jsonb)
  from public, anon, authenticated;

-- Freeze canonical current-contest workflow rows once the edition is archived.
-- Both OLD and NEW scope are checked so moving a row out of an archived edition
-- cannot be used to evade the terminal boundary. Dependent Entry/NF content is
-- scoped through its canonical parent instead of duplicating edition_id.
create or replace function private.v3_guard_archived_edition_workflow_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_old_edition_id uuid;
  v_new_edition_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(old));
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(new));
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived'
      and runtime.edition_id in (v_old_edition_id, v_new_edition_id)
  ) then
    raise exception 'Archived edition workflow is read-only.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_workflow_write()
  from public, anon, authenticated;

do $install$
declare
  v_table text;
begin
  foreach v_table in array array[
    'submission_rounds',
    'submissions',
    'studio2_confirmation_requirements',
    'internal_entries',
    'national_finals',
    'national_final_entries',
    'next_in_line_submissions',
    'entries',
    'participants',
    'studio2_media_asset_reviews',
    'shows',
    'results',
    'voters',
    'jury_votes',
    'jury_ballot_statuses',
    'jury_ballot_submissions',
    'jury_voting_windows',
    'televotes',
    'televote_votes',
    'televoting_windows',
    'studio2_show_publication_controls',
    'studio2_result_operations'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'drop trigger if exists v3_guard_archived_edition_workflow_write on public.%I',
        v_table
      );
      execute format(
        'create trigger v3_guard_archived_edition_workflow_write before insert or update or delete on public.%I for each row execute function private.v3_guard_archived_edition_workflow_write()',
        v_table
      );
    end if;
  end loop;
end
$install$;

comment on function private.v3_guard_archived_edition_workflow_write() is
  'Fail-closed Archive boundary for current-workflow rows, including dependent Entry/NF content. Archive/history/audit/event evidence remains writable through its separate canonical stores.';

-- Archived current-workflow Task rows are retained history. New/reopened rows
-- are forced resolved, and DELETE is rejected so a privileged caller cannot
-- erase the original task identity or resolution timestamp.
create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if tg_op = 'DELETE' then
    if old.edition_id is not null
       and private.v3_archive_task_type_is_current_workflow(old.task_type)
       and exists (
         select 1
         from public.studio2_edition_runtime runtime
         where runtime.edition_id = old.edition_id
           and runtime.state = 'archived'
       ) then
      raise exception 'Archived edition workflow task history is read-only.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = new.edition_id
      and runtime.state = 'archived'
  ) then
    new.state := 'resolved';
    if tg_op = 'UPDATE' then
      new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    else
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_edition_task_resurrection
  on public.studio2_organizer_tasks;
create trigger v3_guard_archived_edition_task_resurrection
before insert or update or delete on public.studio2_organizer_tasks
for each row execute function private.v3_guard_archived_edition_task_resurrection();

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Retain archived current-workflow Task evidence: prevent deletion, prevent actionable resurrection, and preserve the original resolution timestamp.';

-- Keep the existing reconciler as the one source of derived Inbox/delivery
-- state. The final canonical prune call covers queue rows that predate the
-- Task trigger or have been restored with legacy event shapes. Failed delivery
-- attempts remain failed historical evidence and are not rewritten.
create or replace function private.v3_reconcile_resolved_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.admin_notifications notification
  set resolved_at = coalesce(notification.resolved_at, task.resolved_at, now()),
      requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.notification_deliveries delivery
  set status = 'suppressed',
      processing_started_at = null,
      error = 'Organizer Task resolved before delivery.'
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing')
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;
  v_changed := v_changed + private.studio2_prune_stale_task_notifications(p_edition_id);

  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.v3_reconcile_resolved_task_notifications(uuid) is
  'Reconcile resolved Organizer Tasks into retained non-actionable Inbox evidence, suppress pending/in-flight task deliveries, and preserve failed attempts as immutable failure evidence.';

-- =====================================================================
-- Canonical source effects: 20261020140000_v3_s14_archive_runtime_update_guard.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
-- The archive guard function already validates UPDATE transitions, but the
-- original hardening migration only installed INSERT and DELETE triggers.
-- Install the missing UPDATE trigger so privileged direct SQL cannot enter or
-- leave the terminal archived runtime state outside the canonical command.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

drop trigger if exists v3_guard_archive_runtime_update
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_update
before update of state on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- =====================================================================
-- Canonical source effects: 20261021110000_v3_s14_archive_guard_authority_forward_fix.sql (history INSERT omitted)
-- =====================================================================

-- System V3 / S14 forward fix.
--
-- A custom GUC is caller controlled, including by an otherwise privileged
-- service worker.  Archive permission must therefore be an unforgeable,
-- transaction-scoped capability issued only by the canonical lifecycle RPC.
-- Keep the capability in private storage, consume it exactly once in the
-- runtime trigger, and leave no alternate direct-SQL path into Archive.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create table if not exists private.v3_archive_runtime_transition_gates (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  transaction_id bigint not null,
  issued_at timestamptz not null default now()
);

revoke all on table private.v3_archive_runtime_transition_gates
  from public, anon, authenticated, service_role;

create or replace function private.v3_arm_archive_runtime_transition_gate(
  p_edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $arm$
begin
  if p_edition_id is null then
    raise exception 'Archive transition requires an edition id.' using errcode = '22023';
  end if;

  -- A replay that returns before the runtime UPDATE may leave a transaction
  -- specific row behind. It is harmless because transaction_id must match, but
  -- removing it keeps this private gate bounded and auditable.
  delete from private.v3_archive_runtime_transition_gates
  where edition_id = p_edition_id;

  insert into private.v3_archive_runtime_transition_gates (
    edition_id,
    transaction_id
  ) values (
    p_edition_id,
    txid_current()
  );
end
$arm$;

revoke all on function private.v3_arm_archive_runtime_transition_gate(uuid)
  from public, anon, authenticated, service_role;

-- The canonical RPC below is intentionally a small, public wrapper around the
-- existing reviewed implementation. Moving the implementation private makes
-- the gate issuer unreachable to direct SQL while preserving the exact public
-- signature, grants, receipt semantics and PostgREST contract.
alter function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) set schema private;

revoke all on function private.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;

create function public.studio2_transition_edition_v3(
  p_edition_id uuid,
  p_to text,
  p_reason text,
  p_approval_request_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $transition$
begin
  if p_to = 'archived' then
    perform private.v3_arm_archive_runtime_transition_gate(p_edition_id);
  end if;

  return private.studio2_transition_edition_v3(
    p_edition_id,
    p_to,
    p_reason,
    p_approval_request_id,
    p_expected_version,
    p_operation_id,
    p_idempotency_key
  );
end
$transition$;

revoke all on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) from public, anon;
grant execute on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) to authenticated, service_role;

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $guard$
declare
  v_gate_edition_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.state = 'archived' then
      raise exception 'Archived edition runtime is irreversible.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.state = 'archived' then
    raise exception 'Archived edition runtime is read-only.' using errcode = '42501';
  end if;

  if new.state = 'archived'
     and (tg_op = 'INSERT' or old.state is distinct from 'archived') then
    delete from private.v3_archive_runtime_transition_gates
    where edition_id = new.edition_id
      and transaction_id = txid_current()
    returning edition_id into v_gate_edition_id;

    if v_gate_edition_id is null then
      raise exception 'Archive transition must use the canonical V3 lifecycle command.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_archive_runtime_insert on public.studio2_edition_runtime;
drop trigger if exists v3_guard_archive_runtime_update on public.studio2_edition_runtime;
drop trigger if exists v3_guard_archive_runtime_delete on public.studio2_edition_runtime;
drop trigger if exists v3_guard_archive_runtime_transition on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_transition
before insert or update or delete on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- Lock the lifecycle row before checking Archive state. A workflow write that
-- races Archive either completes before the terminal transition or waits and
-- fails after seeing the archived runtime; it cannot slip through after it.
create or replace function private.v3_guard_archived_edition_workflow_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_old_edition_id uuid;
  v_new_edition_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(old));
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(new));
  end if;

  perform 1
  from public.studio2_edition_runtime runtime
  where runtime.edition_id in (v_old_edition_id, v_new_edition_id)
  for no key update;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived'
      and runtime.edition_id in (v_old_edition_id, v_new_edition_id)
  ) then
    raise exception 'Archived edition workflow is read-only.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_workflow_write()
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_old_archived boolean := false;
  v_new_archived boolean := false;
begin
  if tg_op <> 'INSERT'
     and old.edition_id is not null
     and private.v3_archive_task_type_is_current_workflow(old.task_type) then
    perform 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = old.edition_id
    for no key update;

    select runtime.state = 'archived'
    into v_old_archived
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = old.edition_id;
  end if;

  if tg_op = 'DELETE' then
    if v_old_archived then
      raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- Check OLD scope before the resolved-row fast path. Otherwise a privileged
  -- caller could rewrite or move retained historical evidence while keeping the
  -- state value at resolved.
  if v_old_archived then
    if old.state = 'resolved' then
      if (to_jsonb(new) - array['updated_at', 'last_evaluated_at'])
           is distinct from (to_jsonb(old) - array['updated_at', 'last_evaluated_at']) then
        raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
      end if;
      return new;
    end if;

    if (to_jsonb(new) - array['state', 'resolved_at', 'updated_at', 'last_evaluated_at'])
         is distinct from (to_jsonb(old) - array['state', 'resolved_at', 'updated_at', 'last_evaluated_at']) then
      raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
    end if;

    new.state := 'resolved';
    new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    new.last_evaluated_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  perform 1
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = new.edition_id
  for no key update;

  select runtime.state = 'archived'
  into v_new_archived
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = new.edition_id;

  if v_new_archived then
    new.state := 'resolved';
    if tg_op = 'UPDATE' then
      new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    else
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated, service_role;

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Retain archived current-workflow Task evidence: prevent deletion and history rewrites, force only the terminal resolution transition, and preserve any original resolution timestamp.';

-- =====================================================================
-- Canonical source effects: 20261021161000_v3_s14_task_reconciliation_service_boundary.sql (history INSERT omitted)
-- =====================================================================

-- Solaris Studio V3 / S14 release-unblock forward fix.
--
-- The canonical Organizer task projection is explicitly rebuildable, and the
-- System/background worker identity is service_role.  The aggregate reconciler
-- was hardened away from PUBLIC/anon/authenticated execution, but no explicit
-- service_role EXECUTE grant remained after PUBLIC was revoked.  That left the
-- documented rebuild path unusable by the system identity even though normal
-- edition consequence processing correctly reaches the same private reconciler
-- through its service-role-only consumer.
--
-- Keep this a System-only capability: this does not expose the reconciler to
-- browser actors and does not alter any Archive runtime/workflow guard.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

comment on function private.studio2_reconcile_all_organizer_tasks(uuid) is
  'System-only canonical Organizer task projection rebuild. EXECUTE is denied to browser roles and granted explicitly to service_role; callers should scope normal operational reconciliation to one edition.';

-- =====================================================================
-- Canonical source effects: 20261021163000_v3_s14_failed_task_delivery_evidence.sql (history INSERT omitted)
-- =====================================================================

-- Solaris Studio V3 / S14 release-unblock forward fix.
--
-- Organizer Task delivery reconciliation may suppress work that has not yet
-- reached a terminal delivery outcome. A failed delivery is different: it is
-- historical evidence used by observability, retry governance and incident
-- diagnosis. The older generic prune helper included `failed` in the same set
-- as pending/in-flight work, so a later aggregate reconciliation could erase
-- that evidence even after the resolved-task projection had preserved it.
--
-- This final release-unblock pass also closes the remaining Archive terminal
-- boundary gaps found by exact-head review: authoritative Next in Line and
-- eligibility configuration, canonical Televote storage, and repeated task
-- reconciliation after Archive. Governance/audit/integrity evidence remains
-- deliberately outside the current-workflow freeze.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.studio2_prune_stale_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $prune$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.admin_notifications notification
  set
    resolved_at = coalesce(notification.resolved_at, now()),
    requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state <> 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not private.studio2_task_recipient_eligible(
      task.id,
      notification.recipient_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- Only work which has not reached a terminal attempt may be suppressed.
  -- `failed` remains immutable delivery evidence and keeps its original error.
  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = case
      when task.state = 'resolved'
        then 'Organizer Task resolved before delivery.'
      else 'Organizer Task recipient is no longer eligible.'
    end
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      task.state = 'resolved'
      or not private.studio2_task_recipient_eligible(
        task.id,
        delivery.user_id
      )
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$prune$;

revoke all on function private.studio2_prune_stale_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.studio2_prune_stale_task_notifications(uuid) is
  'Prune stale Organizer Task projections while preserving terminal failed delivery attempts as immutable operational evidence.';

-- ---------------------------------------------------------------------------
-- Remaining public-schema current-workflow stores.
-- ---------------------------------------------------------------------------
-- These tables all carry canonical public edition_id directly, so the existing
-- serialized Archive workflow guard can protect them without inventing another
-- source of edition truth.
do $install_public_terminal_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'televoting_round_bindings',
    'studio2_next_in_line_windows',
    'next_in_line_responses',
    'studio2_eligibility_overrides'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'drop trigger if exists v3_guard_archived_edition_workflow_write on public.%I',
        v_table
      );
      execute format(
        'create trigger v3_guard_archived_edition_workflow_write before insert or update or delete on public.%I for each row execute function private.v3_guard_archived_edition_workflow_write()',
        v_table
      );
    end if;
  end loop;
end
$install_public_terminal_guards$;

-- ---------------------------------------------------------------------------
-- Canonical Televote storage lives in the isolated televoting schema.
-- ---------------------------------------------------------------------------
-- Resolve only the current-workflow tables. Integrity/moderation/audit tables
-- remain intentionally writable after Archive because they are governance
-- evidence rather than mutable contest truth.
create or replace function private.v3_televote_row_solaris_editions(
  p_table text,
  p_row jsonb
)
returns table(edition_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $resolve$
begin
  if p_row is null then
    return;
  end if;

  if p_table = 'rounds' then
    return query
      select distinct binding.edition_id
      from public.televoting_round_bindings binding
      where binding.remote_round_id = nullif(p_row ->> 'id', '')
         or binding.remote_edition_id = nullif(p_row ->> 'edition_id', '');
    return;
  end if;

  if p_table in ('round_countries', 'round_entries', 'round_results', 'vote_submissions') then
    return query
      select distinct binding.edition_id
      from public.televoting_round_bindings binding
      where binding.remote_round_id = nullif(p_row ->> 'round_id', '');
    return;
  end if;

  if p_table = 'vote_entries' then
    return query
      select distinct binding.edition_id
      from televoting.vote_submissions submission
      join public.televoting_round_bindings binding
        on binding.remote_round_id = submission.round_id::text
      where submission.id = nullif(p_row ->> 'submission_id', '')::uuid;
    return;
  end if;

  if p_table = 'televote_aggregations' then
    return query
      select distinct binding.edition_id
      from public.televoting_round_bindings binding
      where binding.remote_edition_id = nullif(p_row ->> 'edition_id', '');
    return;
  end if;

  if p_table = 'televote_aggregation_sources' then
    return query
      select distinct source_scope.edition_id
      from (
        select binding.edition_id
        from public.televoting_round_bindings binding
        where binding.remote_round_id = nullif(p_row ->> 'source_round_id', '')
        union
        select binding.edition_id
        from televoting.televote_aggregations aggregation
        join public.televoting_round_bindings binding
          on binding.remote_edition_id = aggregation.edition_id::text
        where aggregation.id = nullif(p_row ->> 'aggregation_id', '')::uuid
      ) source_scope;
    return;
  end if;

  if p_table in (
    'televote_aggregation_participants',
    'combined_televote_results',
    'combined_televote_component_results'
  ) then
    return query
      select distinct binding.edition_id
      from televoting.televote_aggregations aggregation
      join public.televoting_round_bindings binding
        on binding.remote_edition_id = aggregation.edition_id::text
      where aggregation.id = nullif(p_row ->> 'aggregation_id', '')::uuid;
    return;
  end if;
end
$resolve$;

revoke all on function private.v3_televote_row_solaris_editions(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_archived_televote_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $guard$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  -- Serialize Televote writes with the lifecycle row for every bound Solaris
  -- edition in OLD or NEW scope. If Archive is committing concurrently, this
  -- waits and then evaluates the committed terminal state before proceeding.
  perform 1
  from public.studio2_edition_runtime runtime
  where runtime.edition_id in (
    select resolved.edition_id
    from private.v3_televote_row_solaris_editions(tg_table_name, v_old) resolved
    union
    select resolved.edition_id
    from private.v3_televote_row_solaris_editions(tg_table_name, v_new) resolved
  )
  for no key update;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived'
      and runtime.edition_id in (
        select resolved.edition_id
        from private.v3_televote_row_solaris_editions(tg_table_name, v_old) resolved
        union
        select resolved.edition_id
        from private.v3_televote_row_solaris_editions(tg_table_name, v_new) resolved
      )
  ) then
    raise exception 'Archived edition workflow is read-only.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_televote_write()
  from public, anon, authenticated, service_role;

do $install_televote_terminal_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'rounds',
    'round_countries',
    'round_entries',
    'round_results',
    'vote_submissions',
    'vote_entries',
    'televote_aggregations',
    'televote_aggregation_sources',
    'televote_aggregation_participants',
    'combined_televote_results',
    'combined_televote_component_results'
  ]
  loop
    if to_regclass(format('televoting.%I', v_table)) is not null then
      execute format(
        'drop trigger if exists v3_guard_archived_televote_write on televoting.%I',
        v_table
      );
      execute format(
        'create trigger v3_guard_archived_televote_write before insert or update or delete on televoting.%I for each row execute function private.v3_guard_archived_televote_write()',
        v_table
      );
    end if;
  end loop;
end
$install_televote_terminal_guards$;

comment on function private.v3_guard_archived_televote_write() is
  'Fail-closed terminal Archive boundary for canonical Televote workflow/result storage while leaving governance, integrity and audit evidence outside the freeze.';

-- ---------------------------------------------------------------------------
-- Convergent Organizer task reconciliation after Archive.
-- ---------------------------------------------------------------------------
-- Direct privileged writes to retained Task history must still fail. Canonical
-- reconciliation is different: existing producers may propose state=open on an
-- ON CONFLICT path before the archive resolver runs. Give only the private
-- aggregate reconciler an unforgeable transaction-local gate so those proposals
-- are neutralized into terminal state instead of making repeated reconciliation
-- fail. service_role cannot arm this gate directly.
create table if not exists private.v3_archive_task_reconciliation_gates (
  edition_id uuid not null references public.editions(id) on delete cascade,
  transaction_id bigint not null,
  issued_at timestamptz not null default now(),
  primary key (edition_id, transaction_id)
);

revoke all on table private.v3_archive_task_reconciliation_gates
  from public, anon, authenticated, service_role;

create or replace function private.v3_archive_task_reconciliation_gate_active(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $active$
  select p_edition_id is not null
     and exists (
       select 1
       from private.v3_archive_task_reconciliation_gates gate
       where gate.edition_id = p_edition_id
         and gate.transaction_id = txid_current()
     );
$active$;

revoke all on function private.v3_archive_task_reconciliation_gate_active(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_old_archived boolean := false;
  v_new_archived boolean := false;
  v_canonical_reconcile boolean := false;
begin
  if tg_op <> 'INSERT'
     and old.edition_id is not null
     and private.v3_archive_task_type_is_current_workflow(old.task_type) then
    perform 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = old.edition_id
    for no key update;

    select runtime.state = 'archived'
    into v_old_archived
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = old.edition_id;
  end if;

  if tg_op = 'DELETE' then
    if v_old_archived then
      raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
    end if;
    return old;
  end if;

  if v_old_archived then
    v_canonical_reconcile := private.v3_archive_task_reconciliation_gate_active(old.edition_id);

    if v_canonical_reconcile then
      -- Do not let producer refreshes rewrite historical identity/content.
      -- Existing current-workflow rows simply converge to the terminal state.
      new := old;
      new.state := 'resolved';
      new.resolved_at := coalesce(old.resolved_at, now());
      new.last_evaluated_at := now();
      new.updated_at := now();
      return new;
    end if;

    if old.state = 'resolved' then
      if (to_jsonb(new) - array['updated_at', 'last_evaluated_at'])
           is distinct from (to_jsonb(old) - array['updated_at', 'last_evaluated_at']) then
        raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
      end if;
      return new;
    end if;

    if (to_jsonb(new) - array['state', 'resolved_at', 'updated_at', 'last_evaluated_at'])
         is distinct from (to_jsonb(old) - array['state', 'resolved_at', 'updated_at', 'last_evaluated_at']) then
      raise exception 'Archived edition workflow task history is read-only.' using errcode = '42501';
    end if;

    new.state := 'resolved';
    new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    new.last_evaluated_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  perform 1
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = new.edition_id
  for no key update;

  select runtime.state = 'archived'
  into v_new_archived
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = new.edition_id;

  if v_new_archived then
    if tg_op = 'INSERT'
       and private.v3_archive_task_reconciliation_gate_active(new.edition_id) then
      -- Canonical post-Archive rebuilds do not manufacture new historical
      -- current-workflow rows that never existed before the terminal boundary.
      return null;
    end if;

    new.state := 'resolved';
    if tg_op = 'UPDATE' then
      new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    else
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated, service_role;

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Retain archived current-workflow Task evidence: direct history rewrites/deletes fail closed; canonical aggregate reconciliation converges existing rows to terminal state and skips new post-Archive task manufacture.';

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  insert into private.v3_archive_task_reconciliation_gates (
    edition_id,
    transaction_id
  )
  select runtime.edition_id, txid_current()
  from public.studio2_edition_runtime runtime
  where runtime.state = 'archived'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict do nothing;

  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);

  delete from private.v3_archive_task_reconciliation_gates gate
  where gate.transaction_id = txid_current()
    and (p_edition_id is null or gate.edition_id = p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

comment on function private.studio2_reconcile_all_organizer_tasks(uuid) is
  'System-only canonical Organizer task projection rebuild. Archived current-workflow producers are transaction-gated so repeated rebuilds converge without reopening or rewriting retained Task history.';

-- =====================================================================
-- Canonical source effects: 20261021202000_v3_s14_archive_reconciliation_convergence.sql (history INSERT omitted)
-- =====================================================================

-- Solaris Studio V3 / S14 release-unblock completion.
--
-- The final terminal-boundary migration introduces a private transaction gate
-- so legacy/current task producers can be replayed safely after Archive. Keep
-- the S14 Archive resolver and resolved-notification reconciler in the aggregate
-- rebuild path as well: producers are allowed to rediscover conditions, the
-- Archive resolver remains the authority that makes impossible current-contest
-- work terminal, and notification state is reconciled from that terminal task
-- truth. Repeating the whole rebuild must converge without reopening work or
-- rewriting retained resolution evidence.
-- Historical contract registration omitted in forward-only recovery;
-- see new v3.s14.archive-forward-effect-recovery registration.

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  -- Arm only the private transaction-local reconciliation capability. Browser
  -- actors and service_role cannot write/read the gate directly.
  insert into private.v3_archive_task_reconciliation_gates (
    edition_id,
    transaction_id
  )
  select runtime.edition_id, txid_current()
  from public.studio2_edition_runtime runtime
  where runtime.state = 'archived'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict do nothing;

  -- Preserve the complete pre-existing producer set. Governance producers still
  -- run after Archive; the Task trigger gates only current-workflow task types.
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();

  -- Preserve S14 terminal semantics. This catches existing open
  -- current-workflow tasks that no producer happened to touch during this run.
  if p_edition_id is not null then
    perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id);
  else
    perform private.v3_resolve_archived_edition_workflow_tasks(runtime.edition_id)
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived';
  end if;

  -- Rebuild present-tense delivery projections from the now-terminal task truth
  -- while retaining failed delivery attempts as historical evidence.
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.v3_reconcile_resolved_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);

  delete from private.v3_archive_task_reconciliation_gates gate
  where gate.transaction_id = txid_current()
    and (p_edition_id is null or gate.edition_id = p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

comment on function private.studio2_reconcile_all_organizer_tasks(uuid) is
  'System-only canonical Organizer task projection rebuild. Repeated rebuilds preserve S14 Archive resolution, retained failed-delivery evidence and legitimate governance work while archived current-workflow producers converge without resurrection.';

-- Release-gate postconditions are intentionally catalog-only: no live rows,
-- votes, results, receipts, Task work or notification history are rewritten.
do $s14_forward_archive_postcheck$
begin
  if to_regclass('private.v3_archive_runtime_transition_gates') is null
     or to_regclass('private.v3_archive_task_reconciliation_gates') is null
     or to_regprocedure('public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)') is null
     or to_regprocedure('private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)') is null
     or to_regprocedure('private.v3_guard_archive_runtime_transition()') is null
     or to_regprocedure('private.v3_guard_archived_edition_workflow_write()') is null
     or to_regprocedure('private.v3_guard_archived_edition_task_resurrection()') is null
     or to_regprocedure('private.v3_guard_archived_televote_write()') is null
     or to_regprocedure('private.v3_archive_task_reconciliation_gate_active(uuid)') is null then
    raise exception 'S14 Archive recovery postcondition failed: missing core protection';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.studio2_edition_runtime'::regclass
      and t.tgname='v3_guard_archive_runtime_transition'
      and t.tgenabled='O' and not t.tgisinternal
  ) then
    raise exception 'S14 Archive recovery postcondition failed: missing enabled runtime guard';
  end if;
  if has_table_privilege('authenticated','private.v3_archive_runtime_transition_gates','INSERT')
     or has_table_privilege('service_role','private.v3_archive_runtime_transition_gates','INSERT')
     or has_table_privilege('authenticated','private.v3_archive_task_reconciliation_gates','INSERT')
     or has_table_privilege('service_role','private.v3_archive_task_reconciliation_gates','INSERT')
     or has_function_privilege('authenticated','private.v3_arm_archive_runtime_transition_gate(uuid)','EXECUTE')
     or has_function_privilege('service_role','private.v3_arm_archive_runtime_transition_gate(uuid)','EXECUTE') then
    raise exception 'S14 Archive recovery postcondition failed: gate authorizer privilege leak';
  end if;
  if exists (
    select 1 from private.v3_migration_contracts c
    where c.migration_key = any(array[
      'v3.s14.archive-consequence-reconciliation',
      'v3.s14.transition-http409',
      'v3.s14.archive-task-registry-alignment',
      'v3.s14.archive-invariant-forward-fixes',
      'v3.s14.archive-guard-authority-forward-fix',
      'v3.s14.failed-task-delivery-evidence',
      'v3.s14.final-results-readiness-hardening',
      'v3.s14.resolved-task-delivery-reconciliation',
      'v3.s14.archive-runtime-update-guard',
      'v3.s14.task-reconciliation-service-boundary',
      'v3.s14.archive-reconciliation-convergence'
    ])
  ) then
    raise exception 'S14 Archive recovery postcondition failed: falsely recorded historical migration semantics';
  end if;
end
$s14_forward_archive_postcheck$;

notify pgrst, 'reload schema';
commit;
