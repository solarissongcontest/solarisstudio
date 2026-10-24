begin;

-- System V3 / Organizer System Settings: move custom Organizer reminders behind
-- the canonical operation ledger. Existing reminder reads remain table-backed;
-- consequential writes become versioned, idempotent and receipted.
select public.v3_register_migration_contract(
  'v3.organizer-reminder-commands',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Organizer custom reminder create and complete/reopen mutations with exact edition scope, CAS, operation receipts, audit and DomainEvent evidence.'
);

alter table public.admin_deadlines
  add column if not exists revision bigint not null default 1;

alter table public.admin_deadlines
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_deadlines'::regclass
      and conname = 'admin_deadlines_revision_check'
  ) then
    alter table public.admin_deadlines
      add constraint admin_deadlines_revision_check check (revision >= 1);
  end if;
end
$$;

create or replace function private.studio2_admin_deadline_scope_allowed(
  p_edition_id uuid,
  p_show_id uuid default null
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
  if p_edition_id is null then
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

  return public.studio2_access_allowed('edition.manage', p_edition_id, false);
end
$scope$;

revoke all on function private.studio2_admin_deadline_scope_allowed(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_admin_deadline_preview(
  p_deadline_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_deadline public.admin_deadlines%rowtype;
begin
  if p_deadline_id is null then
    raise exception 'Organizer reminder is required' using errcode = '22023';
  end if;

  select *
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id;

  if v_deadline.id is null then
    raise exception 'Organizer reminder not found' using errcode = 'P0002';
  end if;

  if not private.studio2_admin_deadline_scope_allowed(v_deadline.edition_id, v_deadline.show_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_deadline.id,
    'editionId', v_deadline.edition_id,
    'showId', v_deadline.show_id,
    'kind', v_deadline.kind,
    'label', v_deadline.label,
    'dueAt', v_deadline.due_at,
    'completedAt', v_deadline.completed_at,
    'notes', v_deadline.notes,
    'revision', v_deadline.revision,
    'updatedAt', v_deadline.updated_at
  );
end
$preview$;

create or replace function public.studio2_create_admin_deadline(
  p_edition_id uuid,
  p_show_id uuid,
  p_kind text,
  p_label text,
  p_due_at timestamptz,
  p_notes text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $create$
declare
  v_actor uuid := auth.uid();
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'reminder');
  v_label text := nullif(btrim(p_label), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_deadline public.admin_deadlines%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_edition_id is null
     or v_label is null
     or p_due_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Organizer reminder create parameters are incomplete' using errcode = '22023';
  end if;
  if length(v_label) > 240 or length(v_kind) > 80 or length(coalesce(v_notes, '')) > 4000 then
    raise exception 'Organizer reminder fields exceed supported limits' using errcode = '22023';
  end if;
  if not private.studio2_admin_deadline_scope_allowed(p_edition_id, p_show_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'organizer_reminder.create',
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'kind', v_kind,
      'label', v_label,
      'dueAt', p_due_at,
      'notes', v_notes
    ))
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(p_operation_id)
      || jsonb_build_object('replayed', true);
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.admin_deadlines (
    edition_id,
    show_id,
    kind,
    label,
    due_at,
    completed_at,
    notes,
    revision,
    updated_at
  ) values (
    p_edition_id,
    p_show_id,
    v_kind,
    v_label,
    p_due_at,
    null,
    v_notes,
    1,
    now()
  )
  returning * into v_deadline;

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
    'create_admin_deadline',
    'admin_deadlines',
    v_deadline.id::text,
    v_deadline.edition_id,
    null,
    to_jsonb(v_deadline)
  );

  perform private.v3_emit_domain_event(
    'organizer_reminder.changed',
    'organizer_reminder',
    v_deadline.id::text,
    v_deadline.revision,
    v_canonical_operation_id,
    v_deadline.edition_id,
    v_deadline.show_id,
    jsonb_build_object(
      'action', 'created',
      'deadlineId', v_deadline.id,
      'dueAt', v_deadline.due_at,
      'completed', false
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'action', 'create',
    'deadlineId', v_deadline.id,
    'editionId', v_deadline.edition_id,
    'showId', v_deadline.show_id,
    'revision', v_deadline.revision,
    'deadline', to_jsonb(v_deadline)
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$create$;

create or replace function public.studio2_set_admin_deadline_completed(
  p_deadline_id uuid,
  p_complete boolean,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $set_completed$
declare
  v_actor uuid := auth.uid();
  v_deadline public.admin_deadlines%rowtype;
  v_before public.admin_deadlines%rowtype;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_changed boolean := false;
  v_action text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_deadline_id is null
     or p_complete is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Organizer reminder completion parameters are incomplete' using errcode = '22023';
  end if;

  select *
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id;

  if v_deadline.id is null then
    raise exception 'Organizer reminder not found' using errcode = 'P0002';
  end if;
  if not private.studio2_admin_deadline_scope_allowed(v_deadline.edition_id, v_deadline.show_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'organizer_reminder.set_completed',
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'deadlineId', p_deadline_id,
      'editionId', v_deadline.edition_id,
      'showId', v_deadline.show_id
    )),
    jsonb_build_object(
      'complete', p_complete,
      'expectedRevision', p_expected_revision
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(p_operation_id)
      || jsonb_build_object('replayed', true);
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id
  for update;

  if v_deadline.id is null then
    raise exception 'Organizer reminder not found' using errcode = 'P0002';
  end if;
  if not private.studio2_admin_deadline_scope_allowed(v_deadline.edition_id, v_deadline.show_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;
  if v_deadline.revision is distinct from p_expected_revision then
    raise exception 'Organizer reminder changed since this state was loaded. Refresh before applying the action.'
      using errcode = '40001';
  end if;

  v_before := v_deadline;
  v_changed := (v_deadline.completed_at is not null) is distinct from p_complete;

  if v_changed then
    update public.admin_deadlines
    set completed_at = case when p_complete then now() else null end,
        revision = revision + 1,
        updated_at = now()
    where id = p_deadline_id
      and revision = p_expected_revision
    returning * into v_deadline;

    if v_deadline.id is null then
      raise exception 'Organizer reminder changed before the command could be applied. Refresh current state.'
        using errcode = '40001';
    end if;

    v_action := case when p_complete then 'completed' else 'reopened' end;

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
      case when p_complete then 'complete_admin_deadline' else 'reopen_admin_deadline' end,
      'admin_deadlines',
      v_deadline.id::text,
      v_deadline.edition_id,
      to_jsonb(v_before),
      to_jsonb(v_deadline)
    );

    perform private.v3_emit_domain_event(
      'organizer_reminder.changed',
      'organizer_reminder',
      v_deadline.id::text,
      v_deadline.revision,
      v_canonical_operation_id,
      v_deadline.edition_id,
      v_deadline.show_id,
      jsonb_build_object(
        'action', v_action,
        'deadlineId', v_deadline.id,
        'dueAt', v_deadline.due_at,
        'completed', p_complete
      ),
      1,
      array[]::text[]
    );
  else
    v_action := case when p_complete then 'already_completed' else 'already_open' end;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'action', v_action,
    'deadlineId', v_deadline.id,
    'editionId', v_deadline.edition_id,
    'showId', v_deadline.show_id,
    'previousRevision', v_before.revision,
    'revision', v_deadline.revision,
    'completedAt', v_deadline.completed_at,
    'deadline', to_jsonb(v_deadline)
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$set_completed$;

revoke all on function public.studio2_admin_deadline_preview(uuid) from public, anon;
revoke all on function public.studio2_create_admin_deadline(uuid, uuid, text, text, timestamptz, text, uuid, text)
  from public, anon;
revoke all on function public.studio2_set_admin_deadline_completed(uuid, boolean, bigint, uuid, text)
  from public, anon;

grant execute on function public.studio2_admin_deadline_preview(uuid) to authenticated, service_role;
grant execute on function public.studio2_create_admin_deadline(uuid, uuid, text, text, timestamptz, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.studio2_set_admin_deadline_completed(uuid, boolean, bigint, uuid, text)
  to authenticated, service_role;

-- The browser now has a canonical command boundary for reminder mutation. Keep
-- read access for the Organizer projection, but remove direct write authority so
-- a future caller cannot silently bypass receipts, CAS, audit or events.
revoke insert, update, delete on public.admin_deadlines from authenticated;
grant select on public.admin_deadlines to authenticated;

notify pgrst, 'reload schema';
commit;
