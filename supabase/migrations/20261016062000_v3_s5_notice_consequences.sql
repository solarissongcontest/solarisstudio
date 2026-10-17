begin;

-- System V3 S5: bridge the existing Official Communications authority into the
-- S2 operation ledger + S4 DomainEvent/outbox contract without replacing the
-- canonical notice table or existing contest-event compatibility path.
--
-- Publishing now also materializes the canonical recipient-receipt projection
-- transactionally. The existing notification provider already consumes those
-- receipts, so the event consumer only asks that provider to evaluate delivery
-- candidates; it does not invent a second audience engine.

create or replace function private.v3_materialize_notice_recipients(
  p_notice_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $materialize$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_inserted integer := 0;
begin
  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;

  if v_notice.id is null then
    raise exception 'Notice not found' using errcode = 'P0002';
  end if;
  if v_notice.status <> 'published' or v_notice.sent_at is null then
    raise exception 'Only a published notice can materialize recipients'
      using errcode = '23514';
  end if;

  with candidate_users as (
    select account.user_id
    from public.country_accounts account
    where account.status = 'active'

    union

    select assignment.user_id
    from public.studio2_role_assignments assignment
    where assignment.expires_at is null or assignment.expires_at > now()

    union

    select grant_row.user_id
    from public.studio2_capability_grants grant_row
    where grant_row.expires_at is null or grant_row.expires_at > now()
  ), eligible as (
    select candidate.user_id
    from candidate_users candidate
    where private.studio2_user_can_receive_notice_as_recipient(
      candidate.user_id,
      v_notice.edition_id,
      v_notice.audience,
      v_notice.country_ids,
      v_notice.audience_group
    )
  )
  insert into public.studio2_notice_receipts (
    notice_id,
    recipient_user_id,
    delivered_at
  )
  select
    v_notice.id,
    eligible.user_id,
    v_notice.sent_at
  from eligible
  on conflict (notice_id, recipient_user_id)
  do update set delivered_at = coalesce(
    public.studio2_notice_receipts.delivered_at,
    excluded.delivered_at
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$materialize$;

revoke all on function private.v3_materialize_notice_recipients(uuid)
  from public, anon, authenticated;

create or replace function private.v3_notice_transition_operation_id(
  p_notice_id uuid,
  p_revision integer,
  p_status text,
  p_sent_at timestamptz,
  p_superseded_by_id uuid
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
  if p_notice_id is null or p_revision is null or p_revision < 1 then
    raise exception 'Notice transition identity is incomplete' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    case p_status
      when 'published' then 'notice.publish'
      when 'superseded' then 'notice.supersede'
      else 'notice.transition'
    end,
    'R2',
    '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'noticeId', p_notice_id,
      'revision', p_revision,
      'status', p_status,
      'sentAt', p_sent_at,
      'supersededById', p_superseded_by_id
    ))
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

revoke all on function private.v3_notice_transition_operation_id(
  uuid, integer, text, timestamptz, uuid
) from public, anon, authenticated;

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

drop trigger if exists v3_emit_notice_transition_event
  on public.studio2_official_notices;
create trigger v3_emit_notice_transition_event
after insert or update of status, sent_at, superseded_by_id
on public.studio2_official_notices
for each row
execute function private.v3_emit_notice_transition_event();

create or replace function public.studio2_process_notice_domain_event(
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
  v_candidates integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'notice.notifications'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Notice domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null or v_event.event_type <> 'notice.published' then
    raise exception 'Notice notification consumer only accepts notice.published'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Notice domain event delivery was not found'
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
    raise exception 'Notice domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  v_candidates := public.solaris_enqueue_app_notifications(now());
  v_metadata := jsonb_build_object(
    'effect', 'official-notification-evaluation',
    'editionId', v_event.edition_id,
    'noticeId', v_event.aggregate_id,
    'deliveryCandidatesInserted', v_candidates
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_notice_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_notice_domain_event(uuid, text, text)
  to service_role;

-- Backfill recipient receipts for currently published notices so the canonical
-- recipient projection no longer depends on a user opening the inbox first.
do $backfill$
declare
  v_notice record;
begin
  for v_notice in
    select notice.id
    from public.studio2_official_notices notice
    where notice.status = 'published'
      and notice.sent_at is not null
      and notice.archived_at is null
  loop
    perform private.v3_materialize_notice_recipients(v_notice.id);
  end loop;
end
$backfill$;

commit;
