begin;

-- System V3 S5 Entry lifecycle completion.
--
-- Entry has two already-canonical mutation authorities that were still missing
-- completed domain facts:
--   * a successful participant Confirmation operation can submit/resubmit the
--     canonical Entry as part of the same transaction;
--   * every real Entry content mutation appends one immutable
--     private.v3_entry_versions row.
--
-- This migration observes those authorities. It does not create a second Entry
-- writer and it does not backfill legacy observations into invented events.

create or replace function private.v3_entry_version_operation_id(
  p_version_id uuid,
  p_actor_id uuid,
  p_command text,
  p_risk_class text,
  p_entry_id uuid,
  p_submission_id uuid,
  p_edition_id uuid,
  p_revision bigint,
  p_source text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $identity$
declare
  v_fingerprint text;
begin
  if p_version_id is null
     or p_actor_id is null
     or p_command not in ('entry.submit', 'entry.restore_version')
     or p_risk_class not in ('R1', 'R2')
     or p_entry_id is null
     or p_submission_id is null
     or p_edition_id is null
     or p_revision is null
     or p_revision < 1
     or p_source not in ('canonical_write', 'organizer_restore') then
    raise exception 'Entry version operation identity is incomplete'
      using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    p_command,
    p_risk_class,
    jsonb_build_object(
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'subjectType', 'entry',
      'subjectId', p_entry_id
    ),
    jsonb_build_object(
      'entryVersionId', p_version_id,
      'revision', p_revision,
      'source', p_source
    )
  );

  return (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;
end
$identity$;

revoke all on function private.v3_entry_version_operation_id(
  uuid, uuid, text, text, uuid, uuid, uuid, bigint, text
) from public, anon, authenticated;

create or replace function private.v3_emit_entry_version_changed_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $emit$
declare
  v_command text;
  v_risk_class text;
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  -- Rows observed before V3 version authority existed are historical evidence,
  -- not newly completed operations. Never turn them into retroactive facts.
  if new.source = 'legacy_observation' then
    return new;
  end if;

  if new.source not in ('canonical_write', 'organizer_restore') then
    raise exception 'Unsupported canonical Entry version source: %', new.source
      using errcode = '23514';
  end if;

  -- Database/bootstrap maintenance and local rehearsal fixtures can legitimately
  -- append canonical-shaped rows without an authenticated request context. They
  -- must not fabricate an actor or synthetic production event. Real application
  -- Entry writes are authenticated by their existing authority and therefore
  -- carry actor_id into the immutable ledger.
  if new.actor_id is null then
    return new;
  end if;

  v_command := case
    when new.source = 'organizer_restore' then 'entry.restore_version'
    else 'entry.submit'
  end;
  v_risk_class := case
    when new.source = 'organizer_restore' then 'R2'
    else 'R1'
  end;

  v_scope := jsonb_build_object(
    'editionId', new.edition_id,
    'submissionId', new.submission_id,
    'subjectType', 'entry',
    'subjectId', new.entry_id
  );
  v_request := jsonb_strip_nulls(jsonb_build_object(
    'entryVersionId', new.id,
    'targetType', new.target_type,
    'revision', new.revision,
    'source', new.source,
    'parentVersionId', new.parent_version_id,
    'restoredFromSubmissionVersionId', new.restored_from_submission_version_id
  ));
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    v_risk_class,
    v_scope,
    v_request
  );
  v_operation_id := private.v3_entry_version_operation_id(
    new.id,
    new.actor_id,
    v_command,
    v_risk_class,
    new.entry_id,
    new.submission_id,
    new.edition_id,
    new.revision,
    new.source
  );

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
    new.actor_id,
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    v_command,
    v_risk_class,
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'submissionId', new.submission_id,
      'entryId', new.entry_id,
      'entryVersionId', new.id,
      'targetType', new.target_type,
      'revision', new.revision,
      'source', new.source
    ),
    now()
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from new.actor_id
     or v_receipt.command is distinct from v_command
     or v_receipt.risk_class is distinct from v_risk_class
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Entry version identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    'entry.version_changed',
    'entry',
    new.entry_id::text,
    new.revision,
    v_operation_id,
    new.edition_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'submissionId', new.submission_id,
      'entryId', new.entry_id,
      'entryVersionId', new.id,
      'targetType', new.target_type,
      'revision', new.revision,
      'source', new.source,
      'parentVersionId', new.parent_version_id,
      'restoredFromSubmissionVersionId', new.restored_from_submission_version_id
    )),
    1,
    array['entry.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_entry_version_changed_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_entry_version_changed_event
  on private.v3_entry_versions;
create trigger v3_emit_entry_version_changed_event
after insert on private.v3_entry_versions
for each row
execute function private.v3_emit_entry_version_changed_event();

create or replace function private.v3_emit_entry_submission_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission public.submissions%rowtype;
  v_submission_id uuid;
  v_round_id uuid;
  v_edition_id uuid;
  v_edit_count bigint;
  v_entry_count integer;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'confirmation.submit' then
    return new;
  end if;

  begin
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_edit_count := nullif(new.result ->> 'editCount', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Confirmation operation has invalid Entry provenance'
      using errcode = '23514';
  end;

  if v_submission_id is null
     or v_round_id is null
     or v_edition_id is null
     or v_edit_count is null
     or v_edit_count < 0 then
    raise exception 'Completed Confirmation operation lacks Entry submission provenance'
      using errcode = '23514';
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = v_submission_id;

  if v_submission.id is null
     or v_submission.round_id is distinct from v_round_id
     or v_submission.edition_id is distinct from v_edition_id
     or v_submission.edit_count is distinct from v_edit_count then
    raise exception 'Completed Confirmation operation does not match canonical Entry submission state'
      using errcode = '23514';
  end if;

  -- Confirmation also accepts non-participation and metadata-only responses.
  -- entry.submitted exists only when the participating response owns at least
  -- one canonical immutable Entry version.
  if not v_submission.participating then
    return new;
  end if;

  select count(*)::integer
  into v_entry_count
  from (
    select internal_entry.current_version_id
    from public.internal_entries internal_entry
    where internal_entry.submission_id = v_submission.id
      and internal_entry.current_version_id is not null
    union all
    select nf_entry.current_version_id
    from public.national_final_entries nf_entry
    join public.national_finals final
      on final.id = nf_entry.national_final_id
    where final.submission_id = v_submission.id
      and nf_entry.current_version_id is not null
  ) canonical_entries;

  if coalesce(v_entry_count, 0) = 0 then
    return new;
  end if;

  perform private.v3_emit_domain_event(
    'entry.submitted',
    'entry_submission',
    v_submission.id::text,
    v_edit_count,
    new.operation_id,
    v_submission.edition_id,
    null,
    jsonb_build_object(
      'submissionId', v_submission.id,
      'roundId', v_submission.round_id,
      'editCount', v_edit_count,
      'entryCount', v_entry_count,
      'selectionMethod', v_submission.selection_method
    ),
    1,
    array['entry.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_entry_submission_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_entry_submission_event
  on public.studio2_operation_receipts;
create trigger v3_emit_entry_submission_event
after update of status
on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_entry_submission_event();

-- Extend the existing single Entry consequence worker. All four Entry lifecycle
-- facts re-read current canonical truth and converge the same Organizer tasks;
-- no event gets its own competing task engine.
create or replace function public.studio2_process_entry_domain_event(
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
     or p_consumer_key <> 'entry.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Entry domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'entry.submitted',
       'entry.version_changed',
       'entry.reviewed',
       'entry.changes_requested'
     ) then
    raise exception 'Entry consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Entry domain event delivery was not found'
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
    raise exception 'Entry domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
  v_metadata := jsonb_build_object(
    'effect', 'entry-task-reconciliation',
    'editionId', v_event.edition_id,
    'eventType', v_event.event_type
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_entry_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_entry_domain_event(uuid, text, text)
  to service_role;

commit;
