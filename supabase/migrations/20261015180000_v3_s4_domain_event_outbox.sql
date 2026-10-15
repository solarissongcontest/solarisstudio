begin;

-- System V3 S4: canonical DomainEvent + transactional outbox foundation.
--
-- S4 deliberately provides infrastructure only. S5 will migrate each domain
-- mutation and its declared consequence consumers onto this contract. Keeping
-- that boundary explicit prevents the existence of an event table from being
-- mistaken for proof that cross-system consequences are already event-backed.

create table private.v3_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version bigint not null,
  operation_id uuid not null references public.studio2_operation_receipts(operation_id) on delete restrict,
  correlation_id uuid not null,
  edition_id uuid references public.editions(id) on delete restrict,
  show_id uuid references public.shows(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  constraint v3_domain_events_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'),
  constraint v3_domain_events_aggregate_type_check
    check (aggregate_type ~ '^[a-z][a-z0-9_-]*$'),
  constraint v3_domain_events_aggregate_id_check
    check (length(aggregate_id) between 1 and 240),
  constraint v3_domain_events_aggregate_version_check
    check (aggregate_version >= 0),
  constraint v3_domain_events_payload_check
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  constraint v3_domain_events_schema_version_check
    check (schema_version >= 1),
  constraint v3_domain_events_operation_fact_unique
    unique (operation_id, event_type, aggregate_type, aggregate_id, aggregate_version)
);

create index v3_domain_events_correlation_time_idx
  on private.v3_domain_events (correlation_id, occurred_at, id);
create index v3_domain_events_aggregate_idx
  on private.v3_domain_events (aggregate_type, aggregate_id, aggregate_version desc);
create index v3_domain_events_scope_time_idx
  on private.v3_domain_events (edition_id, show_id, occurred_at desc);

create table private.v3_domain_event_outbox (
  event_id uuid not null references private.v3_domain_events(id) on delete restrict,
  consumer_key text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_metadata jsonb,
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, consumer_key),
  constraint v3_domain_event_outbox_consumer_check
    check (consumer_key ~ '^[a-z][a-z0-9_.:-]{0,159}$'),
  constraint v3_domain_event_outbox_status_check
    check (status in ('pending', 'processing', 'completed', 'dead_letter')),
  constraint v3_domain_event_outbox_attempt_check
    check (attempt_count >= 0),
  constraint v3_domain_event_outbox_error_code_check
    check (last_error_code is null or length(last_error_code) between 1 and 160),
  constraint v3_domain_event_outbox_error_metadata_check
    check (
      last_error_metadata is null
      or (
        jsonb_typeof(last_error_metadata) = 'object'
        and pg_column_size(last_error_metadata) <= 8192
      )
    ),
  constraint v3_domain_event_outbox_lifecycle_check
    check (
      (
        status = 'pending'
        and lease_owner is null
        and lease_expires_at is null
        and completed_at is null
        and dead_lettered_at is null
      )
      or (
        status = 'processing'
        and nullif(btrim(lease_owner), '') is not null
        and lease_expires_at is not null
        and completed_at is null
        and dead_lettered_at is null
      )
      or (
        status = 'completed'
        and lease_owner is null
        and lease_expires_at is null
        and completed_at is not null
        and dead_lettered_at is null
      )
      or (
        status = 'dead_letter'
        and lease_owner is null
        and lease_expires_at is null
        and completed_at is null
        and dead_lettered_at is not null
      )
    )
);

create index v3_domain_event_outbox_claim_idx
  on private.v3_domain_event_outbox (consumer_key, status, available_at, lease_expires_at, created_at);
create index v3_domain_event_outbox_dead_letter_idx
  on private.v3_domain_event_outbox (consumer_key, dead_lettered_at desc)
  where status = 'dead_letter';

create table private.v3_domain_event_consumer_receipts (
  event_id uuid not null references private.v3_domain_events(id) on delete restrict,
  consumer_key text not null,
  completed_at timestamptz not null default now(),
  result_metadata jsonb not null default '{}'::jsonb,
  primary key (event_id, consumer_key),
  constraint v3_domain_event_consumer_receipts_consumer_check
    check (consumer_key ~ '^[a-z][a-z0-9_.:-]{0,159}$'),
  constraint v3_domain_event_consumer_receipts_result_check
    check (
      jsonb_typeof(result_metadata) = 'object'
      and pg_column_size(result_metadata) <= 8192
    )
);

revoke all on table private.v3_domain_events from public, anon, authenticated;
revoke all on table private.v3_domain_event_outbox from public, anon, authenticated;
revoke all on table private.v3_domain_event_consumer_receipts from public, anon, authenticated;

create or replace function private.v3_reject_domain_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $reject$
begin
  raise exception 'Canonical domain events are immutable' using errcode = '55000';
end
$reject$;

create trigger v3_domain_events_immutable
before update or delete on private.v3_domain_events
for each row execute function private.v3_reject_domain_event_mutation();

create or replace function private.v3_reject_domain_event_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $reject$
begin
  raise exception 'Domain event consumer receipts are immutable' using errcode = '55000';
end
$reject$;

create trigger v3_domain_event_consumer_receipts_immutable
before update or delete on private.v3_domain_event_consumer_receipts
for each row execute function private.v3_reject_domain_event_receipt_mutation();

revoke all on function private.v3_reject_domain_event_mutation()
  from public, anon, authenticated;
revoke all on function private.v3_reject_domain_event_receipt_mutation()
  from public, anon, authenticated;

create or replace function private.v3_emit_domain_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_aggregate_version bigint,
  p_operation_id uuid,
  p_edition_id uuid default null,
  p_show_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_schema_version integer default 1,
  p_consumers text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $emit$
declare
  v_receipt public.studio2_operation_receipts;
  v_event private.v3_domain_events;
  v_event_id uuid := gen_random_uuid();
  v_edition_id uuid := p_edition_id;
  v_show_edition_id uuid;
  v_consumer text;
  v_consumers text[];
begin
  if p_operation_id is null then
    raise exception 'Domain event operation is required' using errcode = '22023';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
  for share;

  if v_receipt.operation_id is null then
    raise exception 'Domain event operation does not exist' using errcode = '23503';
  end if;
  if v_receipt.status not in ('processing', 'succeeded') then
    raise exception 'Domain events may only describe a completing or completed operation'
      using errcode = '55000';
  end if;

  if nullif(btrim(coalesce(p_event_type, '')), '') is null
     or p_event_type !~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$' then
    raise exception 'Domain event type is invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_aggregate_type, '')), '') is null
     or p_aggregate_type !~ '^[a-z][a-z0-9_-]*$' then
    raise exception 'Domain event aggregate type is invalid' using errcode = '22023';
  end if;
  if length(coalesce(p_aggregate_id, '')) not between 1 and 240 then
    raise exception 'Domain event aggregate id is invalid' using errcode = '22023';
  end if;
  if p_aggregate_version is null or p_aggregate_version < 0 then
    raise exception 'Domain event aggregate version is invalid' using errcode = '22023';
  end if;
  if p_schema_version is null or p_schema_version < 1 then
    raise exception 'Domain event schema version is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 65536 then
    raise exception 'Domain event payload must be a bounded JSON object' using errcode = '22023';
  end if;

  if p_show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = p_show_id;
    if v_show_edition_id is null then
      raise exception 'Domain event show does not exist' using errcode = '23503';
    end if;
    if v_edition_id is not null and v_edition_id is distinct from v_show_edition_id then
      raise exception 'Domain event show and edition scope disagree' using errcode = '23514';
    end if;
    v_edition_id := v_show_edition_id;
  elsif v_edition_id is not null
        and not exists (select 1 from public.editions where id = v_edition_id) then
    raise exception 'Domain event edition does not exist' using errcode = '23503';
  end if;

  select coalesce(array_agg(consumer order by consumer), array[]::text[])
  into v_consumers
  from (
    select distinct btrim(raw_consumer) as consumer
    from unnest(coalesce(p_consumers, array[]::text[])) raw_consumer
    where nullif(btrim(raw_consumer), '') is not null
  ) normalized;

  if exists (
    select 1
    from unnest(v_consumers) consumer
    where consumer !~ '^[a-z][a-z0-9_.:-]{0,159}$'
  ) then
    raise exception 'Domain event consumer key is invalid' using errcode = '22023';
  end if;

  insert into private.v3_domain_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    aggregate_version,
    operation_id,
    correlation_id,
    edition_id,
    show_id,
    actor_id,
    payload,
    schema_version
  ) values (
    v_event_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    p_aggregate_version,
    p_operation_id,
    v_receipt.correlation_id,
    v_edition_id,
    p_show_id,
    v_receipt.actor_id,
    coalesce(p_payload, '{}'::jsonb),
    p_schema_version
  )
  on conflict (operation_id, event_type, aggregate_type, aggregate_id, aggregate_version)
  do nothing;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.operation_id = p_operation_id
    and event_row.event_type = p_event_type
    and event_row.aggregate_type = p_aggregate_type
    and event_row.aggregate_id = p_aggregate_id
    and event_row.aggregate_version = p_aggregate_version;

  if v_event.id is null then
    raise exception 'Canonical domain event could not be persisted' using errcode = 'P0001';
  end if;

  if v_event.correlation_id is distinct from v_receipt.correlation_id
     or v_event.edition_id is distinct from v_edition_id
     or v_event.show_id is distinct from p_show_id
     or v_event.actor_id is distinct from v_receipt.actor_id
     or v_event.payload is distinct from coalesce(p_payload, '{}'::jsonb)
     or v_event.schema_version is distinct from p_schema_version then
    raise exception 'IDEMPOTENCY_CONFLICT: canonical domain event semantics changed'
      using errcode = 'P0001';
  end if;

  foreach v_consumer in array v_consumers loop
    insert into private.v3_domain_event_outbox (event_id, consumer_key)
    values (v_event.id, v_consumer)
    on conflict (event_id, consumer_key) do nothing;
  end loop;

  return v_event.id;
end
$emit$;

revoke all on function private.v3_emit_domain_event(
  text, text, text, bigint, uuid, uuid, uuid, jsonb, integer, text[]
) from public, anon, authenticated;

create or replace function public.studio2_claim_domain_event_deliveries(
  p_consumer_key text,
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 60
)
returns table (
  event_id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id text,
  aggregate_version bigint,
  operation_id uuid,
  correlation_id uuid,
  edition_id uuid,
  show_id uuid,
  actor_id uuid,
  occurred_at timestamptz,
  payload jsonb,
  schema_version integer,
  attempt_count integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $claim$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_consumer_key is null
     or p_consumer_key !~ '^[a-z][a-z0-9_.:-]{0,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160
     or p_limit not between 1 and 100
     or p_lease_seconds not between 5 and 3600 then
    raise exception 'Invalid domain event claim parameters' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select delivery.event_id, delivery.consumer_key
    from private.v3_domain_event_outbox delivery
    where delivery.consumer_key = p_consumer_key
      and (
        (delivery.status = 'pending' and delivery.available_at <= now())
        or (
          delivery.status = 'processing'
          and delivery.lease_expires_at <= now()
        )
      )
      and not exists (
        select 1
        from private.v3_domain_event_consumer_receipts consumed
        where consumed.event_id = delivery.event_id
          and consumed.consumer_key = delivery.consumer_key
      )
    order by delivery.available_at, delivery.created_at, delivery.event_id
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.v3_domain_event_outbox delivery
    set status = 'processing',
        attempt_count = delivery.attempt_count + 1,
        lease_owner = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidates candidate
    where delivery.event_id = candidate.event_id
      and delivery.consumer_key = candidate.consumer_key
    returning delivery.*
  )
  select event_row.id,
         event_row.event_type,
         event_row.aggregate_type,
         event_row.aggregate_id,
         event_row.aggregate_version,
         event_row.operation_id,
         event_row.correlation_id,
         event_row.edition_id,
         event_row.show_id,
         event_row.actor_id,
         event_row.occurred_at,
         event_row.payload,
         event_row.schema_version,
         claimed.attempt_count,
         claimed.lease_expires_at
  from claimed
  join private.v3_domain_events event_row on event_row.id = claimed.event_id
  order by event_row.occurred_at, event_row.id;
end
$claim$;

revoke all on function public.studio2_claim_domain_event_deliveries(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_claim_domain_event_deliveries(text, text, integer, integer)
  to service_role;

create or replace function public.studio2_complete_domain_event_delivery(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text,
  p_result_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $complete$
declare
  v_delivery private.v3_domain_event_outbox;
  v_replayed boolean := false;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key is null
     or p_consumer_key !~ '^[a-z][a-z0-9_.:-]{0,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or jsonb_typeof(coalesce(p_result_metadata, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_result_metadata, '{}'::jsonb)) > 8192 then
    raise exception 'Invalid domain event completion parameters' using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Domain event delivery was not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from private.v3_domain_event_consumer_receipts consumed
    where consumed.event_id = p_event_id
      and consumed.consumer_key = p_consumer_key
  ) then
    v_replayed := true;
  else
    if v_delivery.status <> 'processing'
       or v_delivery.lease_owner is distinct from p_worker_id
       or v_delivery.lease_expires_at <= now() then
      raise exception 'Domain event delivery lease is no longer owned by this worker'
        using errcode = '40001';
    end if;

    insert into private.v3_domain_event_consumer_receipts (
      event_id, consumer_key, result_metadata
    ) values (
      p_event_id, p_consumer_key, coalesce(p_result_metadata, '{}'::jsonb)
    );
  end if;

  update private.v3_domain_event_outbox
  set status = 'completed',
      lease_owner = null,
      lease_expires_at = null,
      completed_at = coalesce(completed_at, now()),
      dead_lettered_at = null,
      updated_at = now()
  where event_id = p_event_id
    and consumer_key = p_consumer_key;

  return jsonb_build_object(
    'ok', true,
    'replayed', v_replayed,
    'eventId', p_event_id,
    'consumerKey', p_consumer_key,
    'status', 'completed'
  );
end
$complete$;

revoke all on function public.studio2_complete_domain_event_delivery(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.studio2_complete_domain_event_delivery(uuid, text, text, jsonb)
  to service_role;

create or replace function public.studio2_fail_domain_event_delivery(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text,
  p_error_code text,
  p_error_metadata jsonb default '{}'::jsonb,
  p_retry_after_seconds integer default 30,
  p_max_attempts integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fail$
declare
  v_delivery private.v3_domain_event_outbox;
  v_dead_letter boolean;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key is null
     or p_consumer_key !~ '^[a-z][a-z0-9_.:-]{0,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or nullif(btrim(coalesce(p_error_code, '')), '') is null
     or length(p_error_code) > 160
     or jsonb_typeof(coalesce(p_error_metadata, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_error_metadata, '{}'::jsonb)) > 8192
     or p_retry_after_seconds not between 0 and 86400
     or p_max_attempts not between 1 and 100 then
    raise exception 'Invalid domain event failure parameters' using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Domain event delivery was not found' using errcode = 'P0002';
  end if;
  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  v_dead_letter := v_delivery.attempt_count >= p_max_attempts;

  update private.v3_domain_event_outbox
  set status = case when v_dead_letter then 'dead_letter' else 'pending' end,
      available_at = case
        when v_dead_letter then available_at
        else now() + make_interval(secs => p_retry_after_seconds)
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = btrim(p_error_code),
      last_error_metadata = coalesce(p_error_metadata, '{}'::jsonb),
      completed_at = null,
      dead_lettered_at = case when v_dead_letter then now() else null end,
      updated_at = now()
  where event_id = p_event_id
    and consumer_key = p_consumer_key;

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'consumerKey', p_consumer_key,
    'status', case when v_dead_letter then 'dead_letter' else 'pending' end,
    'attemptCount', v_delivery.attempt_count
  );
end
$fail$;

revoke all on function public.studio2_fail_domain_event_delivery(uuid, text, text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_fail_domain_event_delivery(uuid, text, text, text, jsonb, integer, integer)
  to service_role;

create or replace function public.studio2_requeue_dead_letter_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_reset_attempts boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $requeue$
declare
  v_changed integer;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key is null
     or p_consumer_key !~ '^[a-z][a-z0-9_.:-]{0,159}$' then
    raise exception 'Invalid dead-letter replay parameters' using errcode = '22023';
  end if;

  update private.v3_domain_event_outbox
  set status = 'pending',
      attempt_count = case when p_reset_attempts then 0 else attempt_count end,
      available_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      completed_at = null,
      dead_lettered_at = null,
      updated_at = now()
  where event_id = p_event_id
    and consumer_key = p_consumer_key
    and status = 'dead_letter';

  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Dead-letter domain event delivery was not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'consumerKey', p_consumer_key,
    'status', 'pending'
  );
end
$requeue$;

revoke all on function public.studio2_requeue_dead_letter_domain_event(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.studio2_requeue_dead_letter_domain_event(uuid, text, boolean)
  to service_role;

comment on table private.v3_domain_events is
  'Immutable canonical DomainEvent facts. S5 commands emit through private.v3_emit_domain_event inside the same transaction as canonical mutation and operation receipt.';
comment on table private.v3_domain_event_outbox is
  'Per-consumer transactional outbox delivery state with retry leases and dead-letter lifecycle.';
comment on table private.v3_domain_event_consumer_receipts is
  'Immutable consumer idempotency receipts keyed by canonical event and consumer.';

commit;
