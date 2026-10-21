begin;

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
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.failed-task-delivery-evidence',
  2,
  'forward_fix_only',
  false,
  null,
  'Preserve terminal failed Organizer-task delivery attempts; close remaining Archive current-workflow storage gaps; make archived task reconciliation convergent without weakening direct historical-evidence guards.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

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

commit;
