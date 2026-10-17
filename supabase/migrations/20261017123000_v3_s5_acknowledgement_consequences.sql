begin;

-- System V3 S5: acknowledgement receipts are already the canonical participant
-- truth for required official notices. Preserve that mutation authority, make
-- the first acknowledgement immutable/idempotent, and bridge the committed
-- receipt transition into the shared S2 operation ledger + S4 DomainEvent model.
-- Existing historical acknowledgements are deliberately not backfilled as
-- events: S4 records completed facts observed after this boundary exists.

create or replace function private.v3_acknowledgement_operation_id(
  p_notice_id uuid,
  p_recipient_user_id uuid,
  p_notice_revision integer
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
  if p_notice_id is null
     or p_recipient_user_id is null
     or p_notice_revision is null
     or p_notice_revision < 1 then
    raise exception 'Acknowledgement transition identity is incomplete'
      using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'acknowledgement.record',
    'R0',
    jsonb_build_object('recipientUserId', p_recipient_user_id),
    jsonb_build_object(
      'noticeId', p_notice_id,
      'noticeRevision', p_notice_revision
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

revoke all on function private.v3_acknowledgement_operation_id(uuid, uuid, integer)
  from public, anon, authenticated;

-- Acknowledgement is a one-way receipt. Material notice changes must create a
-- new authoritative notice/version rather than rewriting the evidence that a
-- recipient acknowledged an older fact.
create or replace function private.v3_preserve_notice_acknowledgement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $preserve$
begin
  if old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
  end if;
  return new;
end
$preserve$;

revoke all on function private.v3_preserve_notice_acknowledgement()
  from public, anon, authenticated;

drop trigger if exists v3_preserve_notice_acknowledgement
  on public.studio2_notice_receipts;
create trigger v3_preserve_notice_acknowledgement
before update of acknowledged_at
on public.studio2_notice_receipts
for each row
execute function private.v3_preserve_notice_acknowledgement();

create or replace function private.v3_emit_notice_acknowledgement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $emit$
declare
  v_actor_id uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  -- Only the first durable acknowledgement is a new completed fact.
  if new.acknowledged_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.acknowledged_at is not null then
      return new;
    end if;
  end if;

  if v_actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;
  if v_actor_id is distinct from new.recipient_user_id then
    raise exception 'Acknowledgement actor does not own this receipt'
      using errcode = '42501';
  end if;

  select notice_row.*
  into v_notice
  from public.studio2_official_notices notice_row
  where notice_row.id = new.notice_id;

  if v_notice.id is null then
    raise exception 'Acknowledged notice no longer exists'
      using errcode = '23503';
  end if;
  if v_notice.status <> 'published'
     or v_notice.sent_at is null
     or v_notice.archived_at is not null
     or not v_notice.acknowledgement_required then
    raise exception 'Acknowledgement requires a live published notice that requests acknowledgement'
      using errcode = '23514';
  end if;

  v_operation_id := private.v3_acknowledgement_operation_id(
    v_notice.id,
    new.recipient_user_id,
    v_notice.revision
  );
  v_scope := jsonb_build_object('recipientUserId', new.recipient_user_id);
  v_request := jsonb_build_object(
    'noticeId', v_notice.id,
    'noticeRevision', v_notice.revision
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'acknowledgement.record',
    'R0',
    v_scope,
    v_request
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
    v_actor_id,
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    'acknowledgement.record',
    'R0',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'noticeId', v_notice.id,
      'noticeRevision', v_notice.revision,
      'acknowledgedAt', new.acknowledged_at
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
     or v_receipt.actor_id is distinct from v_actor_id
     or v_receipt.command is distinct from 'acknowledgement.record'
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Acknowledgement identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    'acknowledgement.recorded',
    'acknowledgement',
    v_operation_id::text,
    1,
    v_operation_id,
    v_notice.edition_id,
    null,
    jsonb_build_object(
      'noticeId', v_notice.id,
      'noticeRevision', v_notice.revision,
      'acknowledgedAt', new.acknowledged_at
    ),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_notice_acknowledgement_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_notice_acknowledgement_event
  on public.studio2_notice_receipts;
create trigger v3_emit_notice_acknowledgement_event
after insert or update
on public.studio2_notice_receipts
for each row
execute function private.v3_emit_notice_acknowledgement_event();

-- Keep the existing public RPC and strict recipient predicate as the single
-- participant write authority. Repeated calls now return the original receipt
-- unchanged instead of rewriting acknowledged_at or duplicating legacy events.
create or replace function public.studio2_acknowledge_notice(p_notice_id uuid)
returns public.studio2_notice_receipts
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $ack$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_receipt public.studio2_notice_receipts%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
    and status = 'published'
    and sent_at is not null
    and archived_at is null
    and 'delegation_inbox' = any(display_surfaces);

  if not found then
    raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002';
  end if;
  if not private.studio2_user_can_receive_notice_as_recipient(
    v_actor,
    v_notice.edition_id,
    v_notice.audience,
    v_notice.country_ids,
    v_notice.audience_group
  ) then
    raise exception 'Notice is not available to this recipient' using errcode = '42501';
  end if;
  if not v_notice.acknowledgement_required then
    raise exception 'This notice does not require acknowledgement' using errcode = '23514';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_notice_receipts receipt
  where receipt.notice_id = p_notice_id
    and receipt.recipient_user_id = v_actor
  for update;

  if v_receipt.acknowledged_at is not null then
    return v_receipt;
  end if;

  insert into public.studio2_notice_receipts (
    notice_id,
    recipient_user_id,
    delivered_at,
    opened_at,
    acknowledged_at
  ) values (
    p_notice_id,
    v_actor,
    now(),
    now(),
    now()
  )
  on conflict (notice_id, recipient_user_id)
  do update set
    delivered_at = coalesce(public.studio2_notice_receipts.delivered_at, excluded.delivered_at),
    opened_at = coalesce(public.studio2_notice_receipts.opened_at, excluded.opened_at),
    acknowledged_at = coalesce(public.studio2_notice_receipts.acknowledged_at, excluded.acknowledged_at)
  returning * into v_receipt;

  -- Preserve the legacy contest-event compatibility projection, but only for
  -- the first acknowledgement. Canonical V3 consumers use the DomainEvent.
  if v_notice.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
    ) values (
      v_notice.edition_id,
      'notice.acknowledged',
      v_actor,
      'notice',
      v_notice.id::text,
      jsonb_build_object('noticeId', v_notice.id)
    );
  end if;

  return v_receipt;
end
$ack$;

revoke all on function public.studio2_acknowledge_notice(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_acknowledge_notice(uuid)
  to authenticated, service_role;

comment on function public.studio2_acknowledge_notice(uuid) is
  'Records the first immutable recipient acknowledgement for a required published notice. Exact retries are semantic no-ops; S5 emits acknowledgement.recorded transactionally from the receipt transition.';

notify pgrst, 'reload schema';

commit;
