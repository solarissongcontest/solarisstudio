begin;

-- System #1074 / Organizer custom reminders.
--
-- admin_deadlines remains the canonical storage for organizer-only reminders,
-- but browser writes are retired. Existing supported behavior (create and
-- complete/reopen) now uses the common V3 operation/idempotency/receipt
-- boundary, exact edition/show scope, optimistic versioning, atomic audit and
-- DomainEvent/outbox evidence, and deterministic Organizer Task projection.
select public.v3_register_migration_contract(
  '20261020001000_v3_admin_deadline_operations',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern existing custom Organizer reminder create + complete/reopen lifecycle; additive version metadata and RPC cutover'
);

alter table public.admin_deadlines
  add column if not exists version bigint;

update public.admin_deadlines
set version = 1
where version is null;

alter table public.admin_deadlines
  alter column version set default 1,
  alter column version set not null;

alter table public.admin_deadlines
  drop constraint if exists admin_deadlines_version_check;
alter table public.admin_deadlines
  add constraint admin_deadlines_version_check check (version >= 1);

alter table public.admin_deadlines
  add column if not exists updated_at timestamptz;

update public.admin_deadlines
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.admin_deadlines
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function private.v3_admin_deadline_scope_allowed(
  p_edition_id uuid,
  p_show_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $scope$
declare
  v_show_edition_id uuid;
begin
  if auth.uid() is null or p_edition_id is null then
    return false;
  end if;

  if p_show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = p_show_id;

    if v_show_edition_id is null or v_show_edition_id is distinct from p_edition_id then
      return false;
    end if;
  end if;

  return public.studio2_access_allowed('edition.manage', p_edition_id, true) is true;
end
$scope$;

revoke all on function private.v3_admin_deadline_scope_allowed(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_admin_deadline_json(
  p_row public.admin_deadlines
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $json$
  select jsonb_build_object(
    'id', p_row.id,
    'editionId', p_row.edition_id,
    'showId', p_row.show_id,
    'kind', p_row.kind,
    'label', p_row.label,
    'dueAt', p_row.due_at,
    'completedAt', p_row.completed_at,
    'notes', p_row.notes,
    'version', p_row.version,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
$json$;

revoke all on function private.v3_admin_deadline_json(public.admin_deadlines)
  from public, anon, authenticated;

create or replace function private.v3_reconcile_admin_deadline_task(
  p_deadline_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_deadline public.admin_deadlines%rowtype;
begin
  select deadline.*
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id;

  if not found then
    update public.studio2_organizer_tasks task
    set
      state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
    where task.source_key = 'admin-deadline:' || p_deadline_id::text
      and task.state <> 'resolved';
    return;
  end if;

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
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  ) values (
    v_deadline.edition_id,
    'admin_deadline',
    v_deadline.id::text,
    'admin-deadline:' || v_deadline.id::text,
    'organizer.reminder',
    'edition.manage',
    case
      when v_deadline.completed_at is null and v_deadline.due_at < now() then 'high'
      else 'normal'
    end,
    case when v_deadline.completed_at is null then 'open' else 'resolved' end,
    v_deadline.label,
    coalesce(nullif(btrim(v_deadline.notes), ''), 'Organizer custom reminder.'),
    '/admin/system',
    v_deadline.due_at,
    jsonb_build_object(
      'table', 'admin_deadlines',
      'id', v_deadline.id,
      'version', v_deadline.version,
      'resolvedWhen', 'completed_at is not null'
    ),
    v_deadline.created_at,
    v_deadline.completed_at,
    now(),
    now()
  )
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = excluded.state,
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = excluded.resolved_at,
    last_evaluated_at = now(),
    updated_at = now();
end
$reconcile$;

revoke all on function private.v3_reconcile_admin_deadline_task(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_admin_deadline_snapshot(
  p_deadline_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_deadline public.admin_deadlines%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select deadline.*
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'REMINDER_NOT_FOUND';
  end if;

  if private.v3_admin_deadline_scope_allowed(v_deadline.edition_id, v_deadline.show_id) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return private.v3_admin_deadline_json(v_deadline) || jsonb_build_object('serverTime', now());
end
$snapshot$;

revoke all on function public.studio2_admin_deadline_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_admin_deadline_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_create_admin_deadline(
  p_edition_id uuid,
  p_show_id uuid,
  p_label text,
  p_due_at timestamptz,
  p_notes text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $create$
declare
  v_actor uuid := auth.uid();
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_deadline public.admin_deadlines%rowtype;
  v_after jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_edition_id is null or p_due_at is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_label is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_label) > 220 or length(coalesce(v_notes, '')) > 4000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if private.v3_admin_deadline_scope_allowed(p_edition_id, p_show_id) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'task.reminder.create',
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'organizer_reminder'
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'label', v_label,
      'dueAt', p_due_at,
      'notes', v_notes
    ))
  );

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_canonical_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  insert into public.admin_deadlines (
    edition_id,
    show_id,
    kind,
    label,
    due_at,
    completed_at,
    notes,
    version,
    updated_at
  ) values (
    p_edition_id,
    p_show_id,
    'other',
    v_label,
    p_due_at,
    null,
    v_notes,
    1,
    now()
  )
  returning * into v_deadline;

  v_after := private.v3_admin_deadline_json(v_deadline);

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
    'organizer_reminder_created',
    'admin_deadlines',
    v_deadline.id::text,
    p_edition_id,
    null,
    v_after
  );

  perform private.v3_reconcile_admin_deadline_task(v_deadline.id);

  perform private.v3_emit_domain_event(
    'task.opened',
    'organizer_reminder',
    v_deadline.id::text,
    v_deadline.version,
    v_canonical_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'deadlineId', v_deadline.id,
      'version', v_deadline.version,
      'dueAt', v_deadline.due_at,
      'state', 'open'
    ),
    1,
    array['task.custom-reminder']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'deadline', v_after,
    'serverTime', now()
  );
  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  return public.studio2_reconcile_operation(v_canonical_operation_id)
    || jsonb_build_object('replayed', false);
end
$create$;

revoke all on function public.studio2_create_admin_deadline(
  uuid, uuid, text, timestamptz, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_create_admin_deadline(
  uuid, uuid, text, timestamptz, text, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_set_admin_deadline_completed(
  p_deadline_id uuid,
  p_expected_version bigint,
  p_complete boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $toggle$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_before_row public.admin_deadlines%rowtype;
  v_after_row public.admin_deadlines%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_event_type text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_deadline_id is null or p_expected_version is null or p_expected_version < 1
     or p_complete is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select deadline.*
  into v_before_row
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'REMINDER_NOT_FOUND';
  end if;
  if private.v3_admin_deadline_scope_allowed(v_before_row.edition_id, v_before_row.show_id) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    case when p_complete then 'task.reminder.complete' else 'task.reminder.reopen' end,
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', v_before_row.edition_id,
      'showId', v_before_row.show_id,
      'subjectType', 'organizer_reminder',
      'subjectId', p_deadline_id
    )),
    jsonb_build_object(
      'deadlineId', p_deadline_id,
      'expectedVersion', p_expected_version,
      'complete', p_complete
    )
  );

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_canonical_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select deadline.*
  into v_before_row
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REMINDER_NOT_FOUND';
  end if;
  if v_before_row.version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  v_before := private.v3_admin_deadline_json(v_before_row);

  if (v_before_row.completed_at is not null) = p_complete then
    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'deadline', v_before,
      'noOp', true,
      'serverTime', now()
    );
    perform private.studio2_complete_operation(v_canonical_operation_id, v_result);
    return public.studio2_reconcile_operation(v_canonical_operation_id)
      || jsonb_build_object('replayed', false);
  end if;

  update public.admin_deadlines
  set
    completed_at = case when p_complete then now() else null end,
    version = version + 1,
    updated_at = now()
  where id = p_deadline_id
  returning * into v_after_row;

  v_after := private.v3_admin_deadline_json(v_after_row);

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
    case when p_complete then 'organizer_reminder_completed' else 'organizer_reminder_reopened' end,
    'admin_deadlines',
    p_deadline_id::text,
    v_after_row.edition_id,
    v_before,
    v_after
  );

  perform private.v3_reconcile_admin_deadline_task(p_deadline_id);

  v_event_type := case when p_complete then 'task.resolved' else 'task.opened' end;
  perform private.v3_emit_domain_event(
    v_event_type,
    'organizer_reminder',
    p_deadline_id::text,
    v_after_row.version,
    v_canonical_operation_id,
    v_after_row.edition_id,
    v_after_row.show_id,
    jsonb_build_object(
      'deadlineId', p_deadline_id,
      'version', v_after_row.version,
      'dueAt', v_after_row.due_at,
      'state', case when p_complete then 'resolved' else 'open' end
    ),
    1,
    array['task.custom-reminder']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'deadline', v_after,
    'before', v_before,
    'serverTime', now()
  );
  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  return public.studio2_reconcile_operation(v_canonical_operation_id)
    || jsonb_build_object('replayed', false);
end
$toggle$;

revoke all on function public.studio2_set_admin_deadline_completed(
  uuid, bigint, boolean, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_set_admin_deadline_completed(
  uuid, bigint, boolean, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_process_custom_reminder_domain_event(
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
  v_deadline_id uuid;
  v_metadata jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_event_id is null or p_consumer_key <> 'task.custom-reminder'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('task.opened', 'task.resolved')
     or v_event.aggregate_type <> 'organizer_reminder' then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_EVENT';
  end if;

  begin
    v_deadline_id := v_event.aggregate_id::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '23514', message = 'INVALID_EVENT_PROVENANCE';
  end;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception using errcode = 'P0002', message = 'DELIVERY_NOT_FOUND';
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
    raise exception using errcode = '40001', message = 'DELIVERY_LEASE_LOST';
  end if;

  perform private.v3_reconcile_admin_deadline_task(v_deadline_id);
  v_metadata := jsonb_build_object(
    'effect', 'custom-reminder-task-reconciliation',
    'deadlineId', v_deadline_id,
    'editionId', v_event.edition_id,
    'aggregateVersion', v_event.aggregate_version
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_custom_reminder_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_custom_reminder_domain_event(uuid, text, text)
  to service_role;

-- V3 callers read the canonical rows through existing RLS, but authoritative
-- reminder writes must now pass through the governed commands above.
revoke insert, update, delete on public.admin_deadlines from authenticated;
grant select on public.admin_deadlines to authenticated;

notify pgrst, 'reload schema';

commit;
