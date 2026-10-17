begin;

-- System V3 S5: bridge the existing Permission Engine V2 R3 operation boundary
-- into canonical DomainEvents without replacing or weakening the permission
-- command path. A successful role assignment/revocation changes both scoped
-- membership and effective permissions. A direct capability grant/revocation
-- changes permissions only. The operation receipt is already the durable,
-- idempotent transaction boundary, so events are emitted from its transition to
-- succeeded rather than by adding a second access authority.

create or replace function private.v3_emit_access_operation_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $emit$
declare
  v_change_kind text;
  v_key text;
  v_target_user_id uuid;
  v_edition_id uuid;
  v_previous_version bigint;
  v_version bigint;
  v_payload jsonb;
  v_expected_command text;
begin
  if new.status <> 'succeeded'
     or new.command not in (
       'permissions.assign_role',
       'permissions.revoke_role',
       'permissions.grant_capability',
       'permissions.revoke_capability'
     ) then
    return new;
  end if;

  -- studio2_apply_permission_change_r3 enriches auth-freshness evidence after
  -- the inner operation completes. Never re-emit facts for later receipt edits.
  if old.status = 'succeeded' then
    return new;
  end if;

  if not coalesce((new.result ->> 'changed')::boolean, false) then
    return new;
  end if;

  v_change_kind := nullif(btrim(new.result ->> 'changeKind'), '');
  v_key := nullif(btrim(new.result ->> 'key'), '');
  v_target_user_id := nullif(new.result ->> 'targetUserId', '')::uuid;
  v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
  v_previous_version := nullif(new.result ->> 'previousVersion', '')::bigint;
  v_version := nullif(new.result ->> 'version', '')::bigint;
  v_expected_command := 'permissions.' || coalesce(v_change_kind, '');

  if v_change_kind not in (
       'assign_role',
       'revoke_role',
       'grant_capability',
       'revoke_capability'
     )
     or v_key is null
     or v_target_user_id is null
     or v_previous_version is null
     or v_version is null
     or v_version <= v_previous_version
     or new.command is distinct from v_expected_command then
    raise exception 'Successful permission operation has incomplete or inconsistent event provenance'
      using errcode = '23514';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'changeKind', v_change_kind,
    'key', v_key,
    'editionId', v_edition_id,
    'previousVersion', v_previous_version,
    'version', v_version,
    'globalScope', v_edition_id is null
  ));

  if v_change_kind in ('assign_role', 'revoke_role') then
    perform private.v3_emit_domain_event(
      'membership.changed',
      'membership',
      v_target_user_id::text,
      v_version,
      new.operation_id,
      v_edition_id,
      null,
      v_payload,
      1,
      array['access.tasks']::text[]
    );
  end if;

  perform private.v3_emit_domain_event(
    'permissions.changed',
    'permission_subject',
    v_target_user_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['access.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_access_operation_events()
  from public, anon, authenticated;

drop trigger if exists v3_emit_access_operation_events
  on public.studio2_operation_receipts;
create trigger v3_emit_access_operation_events
after update of status, result
on public.studio2_operation_receipts
for each row
execute function private.v3_emit_access_operation_events();

create or replace function public.studio2_process_access_domain_event(
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
  v_metadata jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'access.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid access domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('membership.changed', 'permissions.changed') then
    raise exception 'Access task consumer only accepts membership/permission changes'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Access domain event delivery was not found'
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
    raise exception 'Access domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  -- Permission approval/apply tasks are an existing canonical projection. A
  -- successful access mutation can change both task resolution and which
  -- operators remain eligible to own pending approvals, so reconcile against
  -- current authority rather than copying task state into the event payload.
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_sync_task_notifications(null);

  v_metadata := jsonb_build_object(
    'effect', 'access-task-reconciliation',
    'eventType', v_event.event_type,
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

revoke all on function public.studio2_process_access_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_access_domain_event(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
