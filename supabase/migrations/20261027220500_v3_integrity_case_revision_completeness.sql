begin;

select public.v3_register_migration_contract(
  'v3.integrity.case-revision-completeness',
  1,
  'forward_fix_only',
  false,
  null,
  'Include case retention changes in server-managed revisions and immutable case_changed history so retention races cannot silently overwrite'
);

create or replace function private.v3_integrity_case_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
begin
  if old.status is distinct from new.status
     and not private.v3_integrity_case_transition_allowed(old.status, new.status) then
    raise exception 'Illegal Integrity case transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  if old.status is distinct from new.status
     or old.assigned_to is distinct from new.assigned_to
     or old.priority is distinct from new.priority
     or old.retention_until is distinct from new.retention_until then
    new.version := old.version + 1;
    new.updated_at := now();
  elsif new.version is distinct from old.version then
    raise exception 'Integrity case version is server-managed' using errcode = '42501';
  end if;
  return new;
end
$body$;

create or replace function private.v3_integrity_case_changed_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_operation uuid := private.v3_integrity_operation_id();
  v_previous jsonb;
  v_next jsonb;
  v_rationale text := nullif(current_setting('app.integrity_rationale', true), '');
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.assigned_to is not distinct from new.assigned_to
     and old.priority is not distinct from new.priority
     and old.retention_until is not distinct from new.retention_until then
    return new;
  end if;

  v_previous := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'status', old.status,
    'priority', old.priority,
    'assignedTo', old.assigned_to,
    'retentionUntil', old.retention_until,
    'version', old.version
  ) end;
  v_next := jsonb_build_object(
    'status', new.status,
    'priority', new.priority,
    'assignedTo', new.assigned_to,
    'retentionUntil', new.retention_until,
    'version', new.version
  );

  insert into public.integrity_adjudication_history(
    aggregate_type, aggregate_id, case_id, revision, operation_id, event_type,
    actor_user_id, previous_state, next_state, rationale, metadata
  ) values (
    'case', new.id, new.id, new.version, v_operation, 'integrity.case_changed',
    auth.uid(), v_previous, v_next, v_rationale,
    jsonb_build_object('source', coalesce(nullif(current_setting('app.integrity_command', true), ''), 'sanctioned_compatibility'))
  );

  insert into public.integrity_case_events(
    case_id, event_type, detail, visible_to_reporter, actor_user_id,
    operation_id, aggregate_version, event_metadata
  ) values (
    new.id,
    'integrity.case_changed',
    case when tg_op = 'INSERT' then 'Canonical case created' else 'Canonical case adjudication state changed' end,
    false,
    auth.uid(),
    v_operation,
    new.version,
    jsonb_build_object('previous', v_previous, 'next', v_next)
  );
  return new;
end
$body$;

revoke all on function private.v3_integrity_case_before_update() from public, anon, authenticated, service_role;
revoke all on function private.v3_integrity_case_changed_event() from public, anon, authenticated, service_role;

commit;
