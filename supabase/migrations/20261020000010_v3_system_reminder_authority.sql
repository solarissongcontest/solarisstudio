begin;

-- System V3 / Organizer O14: canonical custom-reminder mutation authority.
--
-- admin_deadlines remains the canonical store. This migration does not create a
-- second reminder model. It adds optimistic versioning, soft archival and one
-- server-authoritative operation boundary over the existing table, then closes
-- the browser DML path that previously bypassed receipts/events.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.system.organizer-reminder-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive Organizer reminder authority. Existing admin_deadlines rows remain canonical; repair forward if the command contract later evolves.'
);
select set_config('request.jwt.claim.role', '', true);

alter table public.admin_deadlines
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1,
  add column if not exists archived_at timestamptz;

update public.admin_deadlines
set updated_at = coalesce(updated_at, created_at, now()),
    version = greatest(coalesce(version, 1), 1)
where updated_at is null or version is null or version < 1;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_deadlines'::regclass
      and conname = 'admin_deadlines_version_positive'
  ) then
    alter table public.admin_deadlines
      add constraint admin_deadlines_version_positive
      check (version >= 1) not valid;
  end if;
end
$constraints$;

alter table public.admin_deadlines
  validate constraint admin_deadlines_version_positive;

create index if not exists admin_deadlines_active_edition_due_idx
  on public.admin_deadlines (edition_id, due_at, id)
  where archived_at is null;

create or replace function private.v3_touch_admin_deadline_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$touch$;

revoke all on function private.v3_touch_admin_deadline_version()
  from public, anon, authenticated;

drop trigger if exists v3_touch_admin_deadline_version on public.admin_deadlines;
create trigger v3_touch_admin_deadline_version
before update on public.admin_deadlines
for each row
execute function private.v3_touch_admin_deadline_version();

create or replace function public.studio2_admin_deadline_preview(
  p_edition_id uuid,
  p_deadline_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_deadline public.admin_deadlines%rowtype;
  v_show_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_deadline_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select deadline.*
  into v_deadline
  from public.admin_deadlines deadline
  where deadline.id = p_deadline_id
    and deadline.edition_id = p_edition_id;

  if v_deadline.id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  if v_deadline.show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = v_deadline.show_id;

    if v_show_edition_id is distinct from p_edition_id then
      raise exception using errcode = '23514', message = 'SCOPE_MISMATCH';
    end if;
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
    'createdAt', v_deadline.created_at,
    'updatedAt', v_deadline.updated_at,
    'archivedAt', v_deadline.archived_at,
    'version', v_deadline.version,
    'state', case
      when v_deadline.archived_at is not null then 'archived'
      when v_deadline.completed_at is not null then 'completed'
      else 'open'
    end,
    'serverTime', now()
  );
end
$preview$;

create or replace function public.studio2_apply_admin_deadline(
  p_action text,
  p_edition_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_deadline_id uuid default null,
  p_expected_version bigint default null,
  p_show_id uuid default null,
  p_kind text default null,
  p_label text default null,
  p_due_at timestamptz default null,
  p_notes text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_kind text := lower(nullif(btrim(coalesce(p_kind, '')), ''));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_deadline_id uuid;
  v_show_edition_id uuid;
  v_before public.admin_deadlines%rowtype;
  v_after public.admin_deadlines%rowtype;
  v_result jsonb;
  v_semantic_request jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if v_action not in ('create', 'update', 'complete', 'reopen', 'archive')
     or p_edition_id is null
     or p_operation_id is null
     or v_key is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if p_show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = p_show_id;

    if v_show_edition_id is null then
      raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
    end if;
    if v_show_edition_id is distinct from p_edition_id then
      raise exception using errcode = '22023', message = 'SCOPE_MISMATCH';
    end if;
  end if;

  if v_action in ('create', 'update') then
    if v_kind is null
       or v_kind not in ('reminder', 'deadline', 'other')
       or v_label is null
       or length(v_label) > 200
       or p_due_at is null
       or length(coalesce(p_notes, '')) > 4000 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end if;

  if v_action = 'create' then
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if p_deadline_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  else
    if p_deadline_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end if;

  v_semantic_request := jsonb_strip_nulls(jsonb_build_object(
    'action', v_action,
    'editionId', p_edition_id,
    'deadlineId', p_deadline_id,
    'expectedVersion', p_expected_version,
    'showId', p_show_id,
    'kind', case when v_action in ('create', 'update') then v_kind else null end,
    'label', case when v_action in ('create', 'update') then v_label else null end,
    'dueAt', case when v_action in ('create', 'update') then p_due_at else null end,
    'notes', case when v_action in ('create', 'update') then p_notes else null end
  ));

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    coalesce(p_correlation_id, p_operation_id),
    'organizer.reminder.' || v_action,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'deadlineId', p_deadline_id
    ),
    v_semantic_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_action = 'create' then
    insert into public.admin_deadlines (
      edition_id,
      show_id,
      kind,
      label,
      due_at,
      completed_at,
      notes,
      created_by,
      version,
      updated_at,
      archived_at
    ) values (
      p_edition_id,
      p_show_id,
      v_kind,
      v_label,
      p_due_at,
      null,
      p_notes,
      v_actor,
      1,
      now(),
      null
    )
    returning * into v_after;

    v_deadline_id := v_after.id;
  else
    select deadline.*
    into v_before
    from public.admin_deadlines deadline
    where deadline.id = p_deadline_id
      and deadline.edition_id = p_edition_id
    for update;

    if v_before.id is null then
      raise exception using errcode = 'P0002', message = 'NOT_FOUND';
    end if;
    if v_before.version is distinct from p_expected_version then
      raise exception using
        errcode = '40001',
        message = 'VERSION_CONFLICT',
        detail = format('Expected reminder version %s but current version is %s.', p_expected_version, v_before.version);
    end if;
    if v_before.archived_at is not null then
      raise exception using errcode = '55000', message = 'STATE_CHANGED';
    end if;

    if v_before.show_id is not null then
      select show_row.edition_id
      into v_show_edition_id
      from public.shows show_row
      where show_row.id = v_before.show_id;

      if v_show_edition_id is distinct from p_edition_id then
        raise exception using errcode = '23514', message = 'SCOPE_MISMATCH';
      end if;
    end if;

    if v_action = 'update' then
      if v_before.show_id is not distinct from p_show_id
         and v_before.kind is not distinct from v_kind
         and v_before.label is not distinct from v_label
         and v_before.due_at is not distinct from p_due_at
         and v_before.notes is not distinct from p_notes then
        raise exception using errcode = '55000', message = 'STATE_CHANGED';
      end if;

      update public.admin_deadlines
      set show_id = p_show_id,
          kind = v_kind,
          label = v_label,
          due_at = p_due_at,
          notes = p_notes
      where id = v_before.id
        and edition_id = p_edition_id
        and version = p_expected_version
      returning * into v_after;
    elsif v_action = 'complete' then
      if v_before.completed_at is not null then
        raise exception using errcode = '55000', message = 'STATE_CHANGED';
      end if;

      update public.admin_deadlines
      set completed_at = now()
      where id = v_before.id
        and edition_id = p_edition_id
        and version = p_expected_version
      returning * into v_after;
    elsif v_action = 'reopen' then
      if v_before.completed_at is null then
        raise exception using errcode = '55000', message = 'STATE_CHANGED';
      end if;

      update public.admin_deadlines
      set completed_at = null
      where id = v_before.id
        and edition_id = p_edition_id
        and version = p_expected_version
      returning * into v_after;
    elsif v_action = 'archive' then
      update public.admin_deadlines
      set archived_at = now()
      where id = v_before.id
        and edition_id = p_edition_id
        and version = p_expected_version
      returning * into v_after;
    end if;

    if v_after.id is null then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;

    v_deadline_id := v_after.id;
  end if;

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
    'organizer.reminder.' || v_action,
    'admin_deadlines',
    v_deadline_id::text,
    p_edition_id,
    case when v_action = 'create' then null else to_jsonb(v_before) end,
    to_jsonb(v_after)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action', v_action,
    'operationId', v_canonical_operation_id,
    'deadlineId', v_after.id,
    'editionId', v_after.edition_id,
    'showId', v_after.show_id,
    'version', v_after.version,
    'kind', v_after.kind,
    'label', v_after.label,
    'dueAt', v_after.due_at,
    'completedAt', v_after.completed_at,
    'archivedAt', v_after.archived_at,
    'state', case
      when v_after.archived_at is not null then 'archived'
      when v_after.completed_at is not null then 'completed'
      else 'open'
    end,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$apply$;

-- Emit the completed fact from the durable operation boundary. If this trigger
-- fails, the receipt completion and the underlying reminder mutation roll back
-- in the same transaction. Custom reminders currently have no asynchronous
-- consequence consumer; Organizer projections read the canonical table on the
-- next invalidation/read, so an empty consumer list is deliberate rather than a
-- forgotten worker that would leave permanent pending outbox rows.
create or replace function private.v3_emit_admin_deadline_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_action text;
  v_deadline_id uuid;
  v_edition_id uuid;
  v_show_id uuid;
  v_version bigint;
  v_current public.admin_deadlines%rowtype;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not like 'organizer.reminder.%' then
    return new;
  end if;

  v_action := nullif(new.result ->> 'action', '');

  begin
    v_deadline_id := nullif(new.result ->> 'deadlineId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
  exception when invalid_text_representation then
    raise exception using errcode = '23514', message = 'REMINDER_EVENT_PROVENANCE_INVALID';
  end;

  if v_action not in ('create', 'update', 'complete', 'reopen', 'archive')
     or v_deadline_id is null
     or v_edition_id is null
     or v_version is null then
    raise exception using errcode = '23514', message = 'REMINDER_EVENT_PROVENANCE_MISSING';
  end if;

  select deadline.*
  into v_current
  from public.admin_deadlines deadline
  where deadline.id = v_deadline_id;

  if v_current.id is null
     or v_current.edition_id is distinct from v_edition_id
     or v_current.show_id is distinct from v_show_id
     or v_current.version is distinct from v_version then
    raise exception using errcode = '23514', message = 'REMINDER_EVENT_PROVENANCE_STALE';
  end if;

  perform private.v3_emit_domain_event(
    'organizer.reminder.' || v_action || 'd',
    'organizer_reminder',
    v_deadline_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'action', v_action,
      'deadlineId', v_deadline_id,
      'editionId', v_edition_id,
      'showId', v_show_id,
      'version', v_version,
      'state', new.result ->> 'state',
      'dueAt', new.result ->> 'dueAt',
      'completedAt', new.result ->> 'completedAt',
      'archivedAt', new.result ->> 'archivedAt'
    )),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_admin_deadline_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_admin_deadline_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_admin_deadline_operation_event
after update of status, result
on public.studio2_operation_receipts
for each row
execute function private.v3_emit_admin_deadline_operation_event();

-- Browser reads remain available through the existing RLS policy, but
-- consequential writes now have exactly one public authority: the command RPC.
revoke insert, update, delete on public.admin_deadlines from authenticated;

grant select on public.admin_deadlines to authenticated;

revoke all on function public.studio2_admin_deadline_preview(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_admin_deadline_preview(uuid, uuid)
  to authenticated;

revoke all on function public.studio2_apply_admin_deadline(
  text, uuid, uuid, text, uuid, bigint, uuid, text, text, timestamptz, text, uuid
) from public, anon;
grant execute on function public.studio2_apply_admin_deadline(
  text, uuid, uuid, text, uuid, bigint, uuid, text, text, timestamptz, text, uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
