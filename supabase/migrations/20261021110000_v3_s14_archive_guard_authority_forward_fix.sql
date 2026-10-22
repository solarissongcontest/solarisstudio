begin;

-- System V3 / S14 forward fix.
--
-- A custom GUC is caller controlled, including by an otherwise privileged
-- service worker.  Archive permission must therefore be an unforgeable,
-- transaction-scoped capability issued only by the canonical lifecycle RPC.
-- Keep the capability in private storage, consume it exactly once in the
-- runtime trigger, and leave no alternate direct-SQL path into Archive.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-guard-authority-forward-fix',
  3,
  'forward_fix_only',
  false,
  null,
  'Replace caller-controlled Archive guard context with a private one-shot transaction capability; serialize workflow writes with Archive; freeze archived runtime and Task history.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

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

commit;
