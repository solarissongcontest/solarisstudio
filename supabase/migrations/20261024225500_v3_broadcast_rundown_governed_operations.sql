begin;

-- System V3 / O11 Broadcast Rundown governed command boundary.
--
-- The legacy Studio 2 Broadcast Rundown RPCs remain available during the
-- compatibility window. These V3 RPCs are the canonical cutover target: they
-- bind every consequential operation to an exact Edition + Show, enforce the
-- Broadcast capability model, claim one durable semantic operation before
-- mutable-state validation, apply optimistic revision control under a Show row
-- lock, preserve audit/contest-event compatibility, and emit one correlated
-- canonical show.changed DomainEvent in the same transaction.
select public.v3_register_migration_contract(
  'v3.broadcast.rundown-governed-operations',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-scope idempotent Broadcast Rundown read/save/lock/segment commands with receipts and DomainEvent evidence'
);

create or replace function private.v3_broadcast_rundown_summary(p_rundown jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $summary$
  select case
    when p_rundown is null then null
    else jsonb_build_object(
      'revision', coalesce((p_rundown ->> 'revision')::bigint, 0),
      'startAt', p_rundown -> 'startAt',
      'lockedAt', p_rundown -> 'lockedAt',
      'lockedBy', p_rundown -> 'lockedBy',
      'segmentCount', case
        when jsonb_typeof(p_rundown -> 'segments') = 'array'
          then jsonb_array_length(p_rundown -> 'segments')
        else 0
      end
    )
  end
$summary$;

revoke all on function private.v3_broadcast_rundown_summary(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_broadcast_replayed_result(p_claim jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $replay$
begin
  if not coalesce((p_claim ->> 'replayed')::boolean, false) then
    return null;
  end if;

  if p_claim ->> 'status' = 'succeeded'
     and jsonb_typeof(p_claim -> 'result') = 'object' then
    return (p_claim -> 'result') || jsonb_build_object(
      'replayed', true,
      'reconciled', true
    );
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'STATE_CHANGED',
    hint = 'Reconcile the existing operation before issuing another Broadcast Rundown mutation.';
end
$replay$;

revoke all on function private.v3_broadcast_replayed_result(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_record_broadcast_rundown_change(
  p_operation_id uuid,
  p_edition_id uuid,
  p_show_id uuid,
  p_revision bigint,
  p_change_kind text,
  p_legacy_event_type text,
  p_reason text,
  p_before jsonb,
  p_after jsonb,
  p_event_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $record$
declare
  v_actor uuid := auth.uid();
  v_change_kind text := nullif(btrim(coalesce(p_change_kind, '')), '');
  v_legacy_event_type text := nullif(btrim(coalesce(p_legacy_event_type, '')), '');
begin
  if v_actor is null
     or p_operation_id is null
     or p_edition_id is null
     or p_show_id is null
     or p_revision is null
     or p_revision < 0
     or v_change_kind is null
     or v_legacy_event_type is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not exists (
    select 1
    from public.studio2_operation_receipts receipt
    where receipt.operation_id = p_operation_id
      and receipt.actor_id = v_actor
      and receipt.status = 'processing'
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
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
    v_change_kind,
    'shows',
    p_show_id::text,
    p_edition_id,
    coalesce(p_before, '{}'::jsonb) || jsonb_build_object(
      'operationId', p_operation_id,
      'reason', p_reason
    ),
    coalesce(p_after, '{}'::jsonb) || jsonb_build_object(
      'operationId', p_operation_id,
      'reason', p_reason
    )
  );

  -- Keep the existing Studio 2 contest-event stream compatible while V3
  -- consumers move to canonical DomainEvents.
  insert into public.studio2_contest_events (
    edition_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    v_legacy_event_type,
    v_actor,
    'broadcast_rundown',
    p_show_id::text,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'changeKind', v_change_kind,
      'showId', p_show_id,
      'revision', p_revision,
      'reason', p_reason,
      'operationId', p_operation_id
    )
  );

  -- show.changed is already the canonical live-show domain event declared by
  -- the System registry. The operation receipt supplies actor/correlation
  -- provenance and the exact Edition/Show relationship is revalidated by S4.
  perform private.v3_emit_domain_event(
    'show.changed',
    'live-show',
    p_show_id::text,
    p_revision,
    p_operation_id,
    p_edition_id,
    p_show_id,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'changeKind', v_change_kind,
      'showId', p_show_id,
      'revision', p_revision,
      'reason', p_reason
    ),
    1,
    array[]::text[]
  );
end
$record$;

revoke all on function private.v3_record_broadcast_rundown_change(
  uuid, uuid, uuid, bigint, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;

create or replace function public.studio2_broadcast_rundown_v3(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_actor uuid := auth.uid();
  v_show_edition_id uuid;
  v_config jsonb;
  v_rundown jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.edition_id, coalesce(show_row.broadcast_config, '{}'::jsonb)
  into v_show_edition_id, v_config
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not (
    public.studio2_access_allowed('broadcast.read', p_edition_id, true)
    or public.studio2_access_allowed('broadcast.manage', p_edition_id, true)
    or public.studio2_access_allowed('broadcast.control', p_edition_id, true)
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_rundown := v_config -> 'studio2Rundown';

  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'rundown', v_rundown,
    'revision', coalesce((v_rundown ->> 'revision')::bigint, 0),
    'stateVersion', coalesce((v_rundown ->> 'revision')::bigint, 0),
    'serverTime', now()
  );
end
$snapshot$;

create or replace function public.studio2_save_broadcast_rundown_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_expected_revision integer,
  p_start_at timestamptz,
  p_segments jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_show_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_current_revision integer;
  v_next jsonb;
  v_claim jsonb;
  v_replay jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_show_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_start_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_reason is null
     or length(v_reason) < 5
     or length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_segments is null
     or jsonb_typeof(p_segments) <> 'array'
     or jsonb_array_length(p_segments) > 250
     or pg_column_size(p_segments) > 65536 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  perform private.studio2_validate_rundown_segments(p_segments);

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not public.studio2_access_allowed('broadcast.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'broadcast.rundown.save',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'broadcast_rundown',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'startAt', p_start_at,
      'segments', p_segments,
      'reason', v_reason
    )
  );

  v_replay := private.v3_broadcast_replayed_result(v_claim);
  if v_replay is not null then
    return v_replay;
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select show_row.edition_id, coalesce(show_row.broadcast_config, '{}'::jsonb)
  into v_show_edition_id, v_config
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id
     or not public.studio2_access_allowed('broadcast.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_current := v_config -> 'studio2Rundown';
  v_current_revision := coalesce((v_current ->> 'revision')::integer, 0);
  if v_current_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if nullif(v_current ->> 'lockedAt', '') is not null then
    raise exception using errcode = '55000', message = 'STATE_CHANGED';
  end if;

  v_next := jsonb_build_object(
    'version', 3,
    'revision', v_current_revision + 1,
    'startAt', p_start_at,
    'segments', p_segments,
    'lockedAt', null,
    'lockedBy', null,
    'lockReason', null,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  perform private.v3_record_broadcast_rundown_change(
    v_canonical_operation_id,
    p_edition_id,
    p_show_id,
    v_current_revision + 1,
    'broadcast.rundown_updated',
    'rule.changed',
    v_reason,
    private.v3_broadcast_rundown_summary(v_current),
    private.v3_broadcast_rundown_summary(v_next),
    jsonb_build_object('action', 'save')
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'command', 'broadcast.rundown.save',
    'editionId', p_edition_id,
    'showId', p_show_id,
    'previousRevision', v_current_revision,
    'revision', v_current_revision + 1,
    'stateVersion', v_current_revision + 1,
    'rundown', v_next,
    'replayed', false,
    'reconciled', false,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$save$;

create or replace function public.studio2_set_broadcast_rundown_lock_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_expected_revision integer,
  p_locked boolean,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $lock$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_show_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_revision integer;
  v_next jsonb;
  v_claim jsonb;
  v_replay jsonb;
  v_canonical_operation_id uuid;
  v_command text;
  v_change_kind text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_show_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_locked is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_reason is null
     or length(v_reason) < 5
     or length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_command := case when p_locked then 'broadcast.rundown.lock' else 'broadcast.rundown.unlock' end;
  v_change_kind := case when p_locked then 'broadcast.rundown_locked' else 'broadcast.rundown_unlocked' end;

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not public.studio2_access_allowed('broadcast.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'broadcast_rundown',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'locked', p_locked,
      'reason', v_reason
    )
  );

  v_replay := private.v3_broadcast_replayed_result(v_claim);
  if v_replay is not null then
    return v_replay;
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select show_row.edition_id, coalesce(show_row.broadcast_config, '{}'::jsonb)
  into v_show_edition_id, v_config
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id
     or not public.studio2_access_allowed('broadcast.manage', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_current := v_config -> 'studio2Rundown';
  if v_current is null then
    raise exception using errcode = '55000', message = 'STATE_CHANGED';
  end if;
  perform private.studio2_validate_rundown_segments(v_current -> 'segments');
  v_revision := coalesce((v_current ->> 'revision')::integer, 0);
  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if (p_locked and nullif(v_current ->> 'lockedAt', '') is not null)
     or (not p_locked and nullif(v_current ->> 'lockedAt', '') is null) then
    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'command', v_command,
      'editionId', p_edition_id,
      'showId', p_show_id,
      'previousRevision', v_revision,
      'revision', v_revision,
      'stateVersion', v_revision,
      'changed', false,
      'rundown', v_current,
      'replayed', false,
      'reconciled', false,
      'serverTime', now()
    );
    return private.studio2_complete_operation(v_canonical_operation_id, v_result);
  end if;

  v_next := v_current || jsonb_build_object(
    'version', 3,
    'revision', v_revision + 1,
    'lockedAt', case when p_locked then to_jsonb(now()) else 'null'::jsonb end,
    'lockedBy', case when p_locked then to_jsonb(v_actor) else 'null'::jsonb end,
    'lockReason', case when p_locked then to_jsonb(v_reason) else 'null'::jsonb end,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  perform private.v3_record_broadcast_rundown_change(
    v_canonical_operation_id,
    p_edition_id,
    p_show_id,
    v_revision + 1,
    v_change_kind,
    'rule.changed',
    v_reason,
    private.v3_broadcast_rundown_summary(v_current),
    private.v3_broadcast_rundown_summary(v_next),
    jsonb_build_object('action', case when p_locked then 'lock' else 'unlock' end)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'command', v_command,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'previousRevision', v_revision,
    'revision', v_revision + 1,
    'stateVersion', v_revision + 1,
    'changed', true,
    'rundown', v_next,
    'replayed', false,
    'reconciled', false,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$lock$;

create or replace function public.studio2_transition_broadcast_segment_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_expected_revision integer,
  p_segment_id text,
  p_to_status text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $transition$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_segment_id text := nullif(btrim(coalesce(p_segment_id, '')), '');
  v_show_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_segments jsonb;
  v_revision integer;
  v_from_status text;
  v_next_segments jsonb;
  v_next jsonb;
  v_claim jsonb;
  v_replay jsonb;
  v_canonical_operation_id uuid;
  v_command text;
  v_change_kind text;
  v_legacy_event_type text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_show_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_segment_id is null
     or length(v_segment_id) > 160
     or p_to_status not in ('ready', 'live', 'completed', 'skipped')
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_reason is null
     or length(v_reason) < 5
     or length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_command := 'broadcast.segment.' || p_to_status;
  v_change_kind := 'broadcast.segment_' || p_to_status;
  v_legacy_event_type := case
    when p_to_status = 'live' then 'broadcast.segment_started'
    when p_to_status = 'completed' then 'broadcast.segment_completed'
    else 'rule.changed'
  end;

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not public.studio2_access_allowed('broadcast.control', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'broadcast_segment',
      'subjectId', p_show_id::text || ':' || v_segment_id
    ),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'segmentId', v_segment_id,
      'toStatus', p_to_status,
      'reason', v_reason
    )
  );

  v_replay := private.v3_broadcast_replayed_result(v_claim);
  if v_replay is not null then
    return v_replay;
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  select show_row.edition_id, coalesce(show_row.broadcast_config, '{}'::jsonb)
  into v_show_edition_id, v_config
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show_edition_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_show_edition_id is distinct from p_edition_id
     or not public.studio2_access_allowed('broadcast.control', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_current := v_config -> 'studio2Rundown';
  if v_current is null then
    raise exception using errcode = '55000', message = 'STATE_CHANGED';
  end if;
  v_segments := v_current -> 'segments';
  perform private.studio2_validate_rundown_segments(v_segments);
  v_revision := coalesce((v_current ->> 'revision')::integer, 0);
  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select segment ->> 'status'
  into v_from_status
  from jsonb_array_elements(v_segments) as items(segment)
  where segment ->> 'id' = v_segment_id;

  if v_from_status is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if not (
    (v_from_status = 'planned' and p_to_status in ('ready', 'skipped'))
    or (v_from_status = 'ready' and p_to_status in ('live', 'skipped'))
    or (v_from_status = 'live' and p_to_status in ('completed', 'skipped'))
  ) then
    raise exception using errcode = '55000', message = 'STATE_CHANGED';
  end if;
  if p_to_status = 'live' and exists (
    select 1
    from jsonb_array_elements(v_segments) as items(segment)
    where segment ->> 'id' <> v_segment_id
      and segment ->> 'status' = 'live'
  ) then
    raise exception using errcode = '55000', message = 'STATE_CHANGED';
  end if;

  select jsonb_agg(
    case
      when segment ->> 'id' <> v_segment_id then segment
      else segment
        || jsonb_build_object('status', p_to_status)
        || case
          when p_to_status = 'live' then jsonb_build_object(
            'actualStartedAt', to_jsonb(coalesce(nullif(segment ->> 'actualStartedAt', '')::timestamptz, now()))
          )
          else '{}'::jsonb
        end
        || case
          when p_to_status in ('completed', 'skipped') then jsonb_build_object(
            'actualCompletedAt', to_jsonb(coalesce(nullif(segment ->> 'actualCompletedAt', '')::timestamptz, now()))
          )
          else '{}'::jsonb
        end
    end
    order by ordinal
  )
  into v_next_segments
  from jsonb_array_elements(v_segments) with ordinality as items(segment, ordinal);

  v_next := v_current || jsonb_build_object(
    'version', 3,
    'revision', v_revision + 1,
    'segments', v_next_segments,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  perform private.v3_record_broadcast_rundown_change(
    v_canonical_operation_id,
    p_edition_id,
    p_show_id,
    v_revision + 1,
    v_change_kind,
    v_legacy_event_type,
    v_reason,
    private.v3_broadcast_rundown_summary(v_current),
    private.v3_broadcast_rundown_summary(v_next),
    jsonb_build_object(
      'action', 'segment_transition',
      'segmentId', v_segment_id,
      'fromStatus', v_from_status,
      'toStatus', p_to_status
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'command', v_command,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'segmentId', v_segment_id,
    'fromStatus', v_from_status,
    'toStatus', p_to_status,
    'previousRevision', v_revision,
    'revision', v_revision + 1,
    'stateVersion', v_revision + 1,
    'rundown', v_next,
    'replayed', false,
    'reconciled', false,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$transition$;

revoke all on function public.studio2_broadcast_rundown_v3(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_broadcast_rundown_v3(uuid, uuid)
  to authenticated;

revoke all on function public.studio2_save_broadcast_rundown_v3(
  uuid, uuid, integer, timestamptz, jsonb, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_save_broadcast_rundown_v3(
  uuid, uuid, integer, timestamptz, jsonb, text, uuid, text, uuid
) to authenticated;

revoke all on function public.studio2_set_broadcast_rundown_lock_v3(
  uuid, uuid, integer, boolean, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_set_broadcast_rundown_lock_v3(
  uuid, uuid, integer, boolean, text, uuid, text, uuid
) to authenticated;

revoke all on function public.studio2_transition_broadcast_segment_v3(
  uuid, uuid, integer, text, text, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_transition_broadcast_segment_v3(
  uuid, uuid, integer, text, text, text, uuid, text, uuid
) to authenticated;

comment on function public.studio2_broadcast_rundown_v3(uuid, uuid) is
  'Exact Edition + Show Broadcast Rundown snapshot with server-authoritative broadcast capability checks.';
comment on function public.studio2_save_broadcast_rundown_v3(uuid, uuid, integer, timestamptz, jsonb, text, uuid, text, uuid) is
  'Governed R2 Broadcast Rundown structure save with semantic idempotency, revision CAS, receipt, audit and DomainEvent evidence.';
comment on function public.studio2_set_broadcast_rundown_lock_v3(uuid, uuid, integer, boolean, text, uuid, text, uuid) is
  'Governed R2 Broadcast Rundown lock/unlock with semantic idempotency, revision CAS, receipt, audit and DomainEvent evidence.';
comment on function public.studio2_transition_broadcast_segment_v3(uuid, uuid, integer, text, text, text, uuid, text, uuid) is
  'Governed R2 Broadcast segment lifecycle operation requiring broadcast.control and exact Edition + Show scope.';

notify pgrst, 'reload schema';

commit;
