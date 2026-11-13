begin;

-- V3 System / Organizer O10 authority bridge.
--
-- Official Communications already has mature state validation, row locking,
-- revision capture, publication recipient materialisation and immutable deletion
-- audit. This migration deliberately preserves those implementations and adds
-- the canonical V3 command boundary around the consequential lifecycle.
--
-- Legacy browser RPCs remain callable during the compatibility window. They are
-- not revoked here because Organizer cutover is a separate consumer change and
-- production must not be broken merely to make the architecture look finished.
select public.v3_register_migration_contract(
  '20261020001500_v3_official_communications_command_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Official Communications lifecycle with exact scope, CAS, idempotency, receipts and reconciliable publication events'
);

create or replace function private.v3_notice_command_risk(p_action text)
returns text
language sql
immutable
set search_path = pg_catalog
as $risk$
  select case p_action
    when 'schedule' then 'R1'
    when 'restore' then 'R1'
    when 'publish' then 'R2'
    when 'cancel' then 'R2'
    when 'archive' then 'R2'
    when 'delete' then 'R3'
    else null
  end
$risk$;

revoke all on function private.v3_notice_command_risk(text)
  from public, anon, authenticated;

create or replace function private.v3_notice_command_scope(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_id uuid
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $scope$
begin
  if p_notice_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_scope_kind = 'edition' then
    if p_edition_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    return jsonb_build_object(
      'scopeKind', 'edition',
      'editionId', p_edition_id,
      'subjectType', 'official_notice',
      'subjectId', p_notice_id
    );
  end if;

  if p_scope_kind = 'global' then
    if p_edition_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    return jsonb_build_object(
      'scopeKind', 'global',
      'subjectType', 'official_notice',
      'subjectId', p_notice_id
    );
  end if;

  raise exception using errcode = '22023', message = 'VALIDATION';
end
$scope$;

revoke all on function private.v3_notice_command_scope(text, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_assert_notice_command_scope(
  p_notice public.studio2_official_notices,
  p_scope_kind text,
  p_edition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $assert$
begin
  if p_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  if p_scope_kind = 'edition' then
    if p_edition_id is null
       or p_notice.edition_id is distinct from p_edition_id then
      raise exception using
        errcode = '42501',
        message = 'SCOPE_MISMATCH',
        hint = 'Reload Organizer context before retrying this communication.';
    end if;
    perform private.studio2_require_communications_access(p_edition_id);
    return;
  end if;

  if p_scope_kind = 'global' then
    if p_edition_id is not null or p_notice.edition_id is not null then
      raise exception using
        errcode = '42501',
        message = 'SCOPE_MISMATCH',
        hint = 'Global communication commands cannot target an edition notice.';
    end if;

    -- A null edition must never accidentally broaden an edition capability.
    -- Global communication authority is deliberately restricted to Organizer
    -- role until a dedicated platform/global communications capability exists.
    if not public.has_role(auth.uid(), 'organizer'::public.app_role) then
      raise exception using errcode = '42501', message = 'AUTHORIZATION';
    end if;
    return;
  end if;

  raise exception using errcode = '22023', message = 'VALIDATION';
end
$assert$;

revoke all on function private.v3_assert_notice_command_scope(
  public.studio2_official_notices, text, uuid
) from public, anon, authenticated;

create or replace function public.v3_preflight_notice_lifecycle(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_action text,
  p_scheduled_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preflight$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_risk text := private.v3_notice_command_risk(p_action);
  v_blockers text[] := array[]::text[];
  v_recipient_receipts bigint := 0;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 or v_risk is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Validate explicit scope shape before resolving an object.
  perform private.v3_notice_command_scope(p_scope_kind, p_edition_id, p_notice_id);

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;

  if v_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);

  if v_notice.revision is distinct from p_expected_revision then
    v_blockers := array_append(v_blockers, 'VERSION_CONFLICT');
  end if;

  case p_action
    when 'publish' then
      if v_notice.archived_at is not null then
        v_blockers := array_append(v_blockers, 'COMMUNICATION_ARCHIVED');
      end if;
      if v_notice.status not in ('draft', 'scheduled') then
        v_blockers := array_append(v_blockers, 'INVALID_STATE');
      end if;
    when 'schedule' then
      if v_notice.archived_at is not null then
        v_blockers := array_append(v_blockers, 'COMMUNICATION_ARCHIVED');
      end if;
      if v_notice.status not in ('draft', 'scheduled') then
        v_blockers := array_append(v_blockers, 'INVALID_STATE');
      end if;
      if p_scheduled_at is null or p_scheduled_at <= v_now then
        v_blockers := array_append(v_blockers, 'INVALID_SCHEDULE');
      end if;
    when 'cancel' then
      if v_notice.status not in ('draft', 'scheduled') then
        v_blockers := array_append(v_blockers, 'INVALID_STATE');
      end if;
    when 'archive' then
      -- Already archived is an idempotent no-op under the legacy authority.
      null;
    when 'restore' then
      -- Already restored is likewise an idempotent no-op.
      null;
    when 'delete' then
      if nullif(btrim(coalesce(p_reason, '')), '') is null then
        v_blockers := array_append(v_blockers, 'REASON_REQUIRED');
      end if;
      if v_notice.sent_at is not null and v_notice.archived_at is null then
        v_blockers := array_append(v_blockers, 'ARCHIVE_BEFORE_DELETE');
      end if;
    else
      raise exception using errcode = '22023', message = 'VALIDATION';
  end case;

  select count(*)
  into v_recipient_receipts
  from public.studio2_notice_receipts receipt
  where receipt.notice_id = v_notice.id;

  return jsonb_build_object(
    'ok', true,
    'serverTime', v_now,
    'scopeKind', p_scope_kind,
    'editionId', v_notice.edition_id,
    'noticeId', v_notice.id,
    'action', p_action,
    'riskClass', v_risk,
    'currentRevision', v_notice.revision,
    'expectedRevision', p_expected_revision,
    'state', v_notice.status,
    'archived', v_notice.archived_at is not null,
    'scheduledAt', v_notice.scheduled_at,
    'publishedAt', v_notice.sent_at,
    'audience', v_notice.audience,
    'audienceGroup', v_notice.audience_group,
    'displaySurfaces', to_jsonb(v_notice.display_surfaces),
    'acknowledgementRequired', v_notice.acknowledgement_required,
    'recipientReceiptCount', v_recipient_receipts,
    'blockers', to_jsonb(v_blockers),
    'canCommit', cardinality(v_blockers) = 0
  );
end
$preflight$;

revoke all on function public.v3_preflight_notice_lifecycle(
  text, uuid, uuid, integer, text, timestamptz, text
) from public, anon;
grant execute on function public.v3_preflight_notice_lifecycle(
  text, uuid, uuid, integer, text, timestamptz, text
) to authenticated, service_role;

-- S5 already owns notice.published / notice.superseded consequences. During a
-- canonical V3 publish command, bind those events to the caller's real
-- operation rather than manufacturing a second transition receipt. Legacy and
-- scheduled-worker transitions keep the established deterministic fallback.
create or replace function private.v3_emit_notice_transition_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_event_type text;
  v_command text;
  v_operation_id uuid;
  v_explicit_operation_text text := nullif(
    current_setting('solaris.v3_notice_operation_id', true),
    ''
  );
  v_correlation_id uuid;
  v_actor_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_consumers text[] := array[]::text[];
  v_materialized integer := 0;
  v_parent_event private.v3_domain_events%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'published' then
      return new;
    end if;
  else
    if old.status is not distinct from new.status then
      return new;
    end if;
    if new.status not in ('published', 'superseded') then
      return new;
    end if;
  end if;

  if new.status = 'published' then
    if new.sent_at is null then
      raise exception 'Published notice lacks sent timestamp' using errcode = '23514';
    end if;
    v_event_type := 'notice.published';
    v_command := 'notice.publish';
    v_consumers := array['notice.notifications']::text[];
    v_materialized := private.v3_materialize_notice_recipients(new.id);
  else
    if new.superseded_by_id is null then
      raise exception 'Superseded notice lacks replacement provenance'
        using errcode = '23514';
    end if;
    v_event_type := 'notice.superseded';
    v_command := 'notice.supersede';
  end if;

  if v_explicit_operation_text is not null then
    begin
      v_operation_id := v_explicit_operation_text::uuid;
    exception when invalid_text_representation then
      raise exception 'Explicit Notice operation identity is invalid'
        using errcode = '23514';
    end;

    select receipt.*
    into v_receipt
    from public.studio2_operation_receipts receipt
    where receipt.operation_id = v_operation_id
    for share;

    if v_receipt.operation_id is null
       or v_receipt.status <> 'processing'
       or v_receipt.command <> 'notice.publish'
       or v_receipt.actor_id is distinct from auth.uid() then
      raise exception 'Explicit Notice publication operation provenance is invalid'
        using errcode = '23514';
    end if;

    if new.edition_id is not null
       and nullif(v_receipt.scope ->> 'editionId', '')::uuid is distinct from new.edition_id then
      raise exception 'Explicit Notice publication operation has the wrong edition scope'
        using errcode = '23514';
    end if;

    -- A publish that supersedes an older notice intentionally owns both facts.
    -- The receipt subject is the newly published notice, while the old notice's
    -- notice.superseded event shares the operation/correlation provenance.
    perform private.v3_emit_domain_event(
      v_event_type,
      'notice',
      new.id::text,
      new.revision::bigint,
      v_operation_id,
      new.edition_id,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'noticeId', new.id,
        'revision', new.revision,
        'status', new.status,
        'severity', new.severity,
        'audience', new.audience,
        'acknowledgementRequired', new.acknowledgement_required,
        'supersededById', new.superseded_by_id,
        'recipientReceiptsMaterialized', case
          when new.status = 'published' then v_materialized
        end
      )),
      1,
      v_consumers
    );

    return new;
  end if;

  -- Compatibility/scheduled-worker path: preserve the exact S5 deterministic
  -- transition identity so existing callers keep one replay-safe audit fact.
  v_operation_id := private.v3_notice_transition_operation_id(
    new.id,
    new.revision,
    new.status,
    new.sent_at,
    new.superseded_by_id
  );
  v_actor_id := coalesce(auth.uid(), new.updated_by, new.created_by);
  v_scope := jsonb_strip_nulls(jsonb_build_object('editionId', new.edition_id));
  v_request := jsonb_strip_nulls(jsonb_build_object(
    'noticeId', new.id,
    'revision', new.revision,
    'status', new.status,
    'sentAt', new.sent_at,
    'supersededById', new.superseded_by_id
  ));
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R2',
    v_scope,
    v_request
  );
  v_correlation_id := v_operation_id;

  if new.status = 'superseded' then
    select event_row.*
    into v_parent_event
    from private.v3_domain_events event_row
    where event_row.event_type = 'notice.published'
      and event_row.aggregate_type = 'notice'
      and event_row.aggregate_id = new.superseded_by_id::text
    order by event_row.occurred_at desc, event_row.id desc
    limit 1;

    if v_parent_event.id is not null then
      v_correlation_id := v_parent_event.correlation_id;
    end if;
  end if;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    v_operation_id,
    v_actor_id,
    v_operation_id::text,
    v_correlation_id,
    v_fingerprint,
    v_command,
    'R2',
    v_scope,
    'succeeded',
    jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'noticeId', new.id,
      'editionId', new.edition_id,
      'revision', new.revision,
      'status', new.status,
      'supersededById', new.superseded_by_id,
      'recipientReceiptsMaterialized', case
        when new.status = 'published' then v_materialized
      end
    )),
    coalesce(new.sent_at, now())
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor_id
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_correlation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Notice transition identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    'notice',
    new.id::text,
    new.revision::bigint,
    v_operation_id,
    new.edition_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'noticeId', new.id,
      'revision', new.revision,
      'status', new.status,
      'severity', new.severity,
      'audience', new.audience,
      'acknowledgementRequired', new.acknowledgement_required,
      'supersededById', new.superseded_by_id
    )),
    1,
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_notice_transition_event()
  from public, anon, authenticated;

create or replace function public.v3_execute_notice_lifecycle(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_action text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_risk text := private.v3_notice_command_risk(p_action);
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_deleted boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_expected_revision is null
     or p_expected_revision < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_risk is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_scope := private.v3_notice_command_scope(
    p_scope_kind,
    p_edition_id,
    p_notice_id
  );

  -- Resolve scope before claiming, but do not use mutable state for replay
  -- semantics. A stale cross-edition object can never become a valid command.
  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;

  if v_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);

  v_request := jsonb_strip_nulls(jsonb_build_object(
    'noticeId', p_notice_id,
    'action', p_action,
    'expectedRevision', p_expected_revision,
    'scheduledAt', p_scheduled_at,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  ));

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'notice.' || p_action,
    v_risk,
    v_scope,
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Re-lock after the claim. Commit repeats scope and revision checks because a
  -- preflight or initial read is never permission to mutate later.
  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
  for update;

  if v_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);

  if v_notice.revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'Reload the current communication revision before retrying.';
  end if;

  if p_action = 'publish' then
    -- The S5 publication trigger consumes this transaction-local provenance and
    -- attaches notice.published / notice.superseded to this exact operation.
    perform set_config('solaris.v3_notice_operation_id', v_operation_id::text, true);
    v_notice := public.studio2_publish_notice(p_notice_id);
    perform set_config('solaris.v3_notice_operation_id', '', true);
  elsif p_action = 'schedule' then
    v_notice := public.studio2_schedule_notice(p_notice_id, p_scheduled_at);
  elsif p_action = 'cancel' then
    v_notice := public.studio2_cancel_notice(p_notice_id, p_reason);
  elsif p_action = 'archive' then
    v_notice := public.studio2_archive_communication(p_notice_id, p_reason);
  elsif p_action = 'restore' then
    v_notice := public.studio2_restore_communication(p_notice_id);
  elsif p_action = 'delete' then
    v_deleted := public.studio2_delete_communication(p_notice_id, p_reason);
  else
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_action = 'delete' then
    if not v_deleted then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;
    v_result := jsonb_build_object(
      'ok', true,
      'noticeId', p_notice_id,
      'editionId', p_edition_id,
      'scopeKind', p_scope_kind,
      'action', p_action,
      'deleted', true,
      'previousRevision', p_expected_revision,
      'operationId', v_operation_id,
      'serverTime', now()
    );
  else
    if v_notice.id is null
       or v_notice.id is distinct from p_notice_id
       or v_notice.edition_id is distinct from p_edition_id then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'noticeId', v_notice.id,
      'editionId', v_notice.edition_id,
      'scopeKind', p_scope_kind,
      'action', p_action,
      'stateVersion', v_notice.revision,
      'state', v_notice.status,
      'archived', v_notice.archived_at is not null,
      'scheduledAt', v_notice.scheduled_at,
      'publishedAt', v_notice.sent_at,
      'notice', to_jsonb(v_notice),
      'operationId', v_operation_id,
      'serverTime', now()
    );
  end if;

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$command$;

revoke all on function public.v3_execute_notice_lifecycle(
  text, uuid, uuid, integer, text, uuid, text, uuid, timestamptz, text
) from public, anon;
grant execute on function public.v3_execute_notice_lifecycle(
  text, uuid, uuid, integer, text, uuid, text, uuid, timestamptz, text
) to authenticated, service_role;

comment on function public.v3_execute_notice_lifecycle(
  text, uuid, uuid, integer, text, uuid, text, uuid, timestamptz, text
) is
  'Canonical Official Communications lifecycle command. Exact edition/global scope, expected revision, semantic idempotency and operation reconciliation are authoritative; mature legacy transition validators remain the internal writers during cutover.';

notify pgrst, 'reload schema';

commit;
