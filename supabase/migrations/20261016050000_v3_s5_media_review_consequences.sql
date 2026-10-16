begin;

-- System V3 S5: Media review becomes an idempotent operation with explicit
-- DomainEvent consequences while preserving the existing canonical media source
-- resolution and review table. The public RPC signature remains unchanged so
-- current Organizer clients are rollout-compatible.

alter function public.studio2_review_media_assets(uuid, jsonb, text)
  rename to studio2_review_media_assets_legacy_impl;

revoke all on function public.studio2_review_media_assets_legacy_impl(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_review_media_assets(
  p_edition_id uuid,
  p_reviews jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $review$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_reason text := btrim(coalesce(p_reason, ''));
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_result jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_reviews) <> 'array' then
    raise exception 'Media reviews must be a JSON array' using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A media review reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if not v_is_service and not private.studio2_can_manage_media_assets(v_actor, p_edition_id) then
    raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
  end if;
  if not coalesce(private.studio2_platform_mutation_allowed('media.review'), false) then
    raise exception 'Media review is unavailable in the current platform operating mode'
      using errcode = '25006';
  end if;

  v_scope := jsonb_build_object('editionId', p_edition_id);
  v_request := jsonb_build_object(
    'actor', coalesce(v_actor::text, 'service_role'),
    'reviews', p_reviews,
    'reason', v_reason
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'media.review',
    'R1',
    v_scope,
    v_request
  );

  -- Existing clients predate the operation envelope. Derive one stable UUID
  -- from the exact semantic request so double-click/retry is idempotent without
  -- changing the public RPC signature during the compatibility window.
  v_operation_id := (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status
  ) values (
    v_operation_id,
    v_actor,
    v_fingerprint,
    v_operation_id,
    v_fingerprint,
    'media.review',
    'R1',
    v_scope,
    'processing'
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Media review operation receipt could not be persisted'
      using errcode = 'P0001';
  end if;
  if v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'media.review'
     or v_receipt.idempotency_key is distinct from v_fingerprint
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope then
    raise exception 'IDEMPOTENCY_CONFLICT: media review operation identity has different semantics'
      using errcode = 'P0001';
  end if;

  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '[]'::jsonb);
  end if;
  if v_receipt.status <> 'processing' then
    raise exception 'Media review operation is not in a retryable state'
      using errcode = '55000';
  end if;

  -- The legacy implementation remains the canonical source-validation and
  -- review writer during this migration. It is private-by-privilege: only this
  -- SECURITY DEFINER compatibility command can invoke it.
  v_result := public.studio2_review_media_assets_legacy_impl(
    p_edition_id,
    p_reviews,
    v_reason
  );

  update public.studio2_operation_receipts
  set status = 'succeeded',
      result = coalesce(v_result, '[]'::jsonb),
      error_code = null,
      error_metadata = null,
      completed_at = now(),
      updated_at = now()
  where operation_id = v_operation_id;

  return coalesce(v_result, '[]'::jsonb);
end
$review$;

revoke all on function public.studio2_review_media_assets(uuid, jsonb, text)
  from public, anon;
grant execute on function public.studio2_review_media_assets(uuid, jsonb, text)
  to authenticated, service_role;

create or replace function private.v3_emit_media_review_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_edition_id uuid;
  v_item jsonb;
  v_review_id uuid;
  v_asset_key text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'media.review' then
    return new;
  end if;

  begin
    v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed media review operation has invalid edition provenance'
      using errcode = '23514';
  end;

  if v_edition_id is null
     or jsonb_typeof(new.result) <> 'array'
     or jsonb_array_length(new.result) < 1 then
    raise exception 'Completed media review operation lacks event provenance'
      using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(new.result)
  loop
    begin
      v_review_id := nullif(v_item ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed media review contains invalid review provenance'
        using errcode = '23514';
    end;
    v_asset_key := nullif(btrim(coalesce(v_item ->> 'assetKey', '')), '');

    if v_review_id is null
       or v_asset_key is null
       or not exists (
         select 1
         from public.studio2_media_asset_reviews review_row
         where review_row.id = v_review_id
           and review_row.edition_id = v_edition_id
           and review_row.asset_key = v_asset_key
           and review_row.decision = v_item ->> 'decision'
       ) then
      raise exception 'Completed media review does not match canonical review evidence'
        using errcode = '23514';
    end if;

    perform private.v3_emit_domain_event(
      'media.reviewed',
      'media_review',
      v_review_id::text,
      0,
      new.operation_id,
      v_edition_id,
      null,
      jsonb_strip_nulls(jsonb_build_object(
        'reviewId', v_review_id,
        'assetKey', v_asset_key,
        'assetType', v_item ->> 'assetType',
        'countryId', v_item -> 'countryId',
        'entryId', v_item -> 'entryId',
        'decision', v_item ->> 'decision'
      )),
      1,
      array['media.tasks']::text[]
    );
  end loop;

  return new;
end
$emit$;

revoke all on function private.v3_emit_media_review_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_media_review_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_media_review_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_media_review_operation_event();

create or replace function public.studio2_process_media_domain_event(
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
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'media.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Media domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null or v_event.event_type <> 'media.reviewed' then
    raise exception 'Media consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Media domain event delivery was not found'
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
    raise exception 'Media domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
  v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
  v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
  v_metadata := jsonb_build_object(
    'effect', 'media-task-reconciliation',
    'editionId', v_event.edition_id,
    'taskNotificationsChanged', v_task_notifications,
    'staleTaskNotificationsPruned', v_pruned_notifications
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_media_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_media_domain_event(uuid, text, text)
  to service_role;

commit;
