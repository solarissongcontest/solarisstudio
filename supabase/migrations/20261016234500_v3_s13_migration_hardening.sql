begin;

-- System V3 S13: additive migration hardening foundation.
-- This migration adds compatibility signalling, resumable bounded backfill state,
-- migration contracts, and parity evidence. It does not execute a production
-- backfill or advance the application schema version by itself.

create table if not exists private.v3_migration_contracts (
  migration_key text primary key,
  schema_version integer not null check (schema_version >= 1),
  rollout_strategy text not null default 'expand-backfill-dual-compatible-switch-validate-contract'
    check (rollout_strategy = 'expand-backfill-dual-compatible-switch-validate-contract'),
  rollback_mode text not null check (rollback_mode in ('reversible', 'forward_fix_only')),
  destructive boolean not null default false,
  backfill_key text,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_migration_contract_key_format
    check (migration_key ~ '^[a-z][a-z0-9_.:-]{2,159}$'),
  constraint v3_migration_contract_backfill_key_format
    check (backfill_key is null or backfill_key ~ '^[a-z][a-z0-9_.:-]{2,159}$')
);

create table if not exists private.v3_schema_compatibility (
  singleton boolean primary key default true check (singleton),
  current_schema_version integer not null check (current_schema_version >= 1),
  min_client_schema_version integer not null check (min_client_schema_version >= 1),
  max_client_schema_version integer not null check (max_client_schema_version >= 1),
  phase text not null check (phase in ('expand', 'backfill', 'dual-compatible', 'switch', 'validate', 'contract')),
  migration_key text not null check (migration_key ~ '^[a-z][a-z0-9_.:-]{2,159}$'),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  updated_at timestamptz not null default now(),
  constraint v3_schema_compatibility_client_range
    check (min_client_schema_version <= max_client_schema_version),
  constraint v3_schema_compatibility_server_in_range
    check (current_schema_version between min_client_schema_version and max_client_schema_version)
);

create table if not exists private.v3_schema_compatibility_history (
  id bigint generated always as identity primary key,
  schema_version integer not null check (schema_version >= 1),
  phase text not null check (phase in ('expand', 'backfill', 'dual-compatible', 'switch', 'validate', 'contract')),
  migration_key text not null,
  before_state jsonb not null check (jsonb_typeof(before_state) = 'object' and pg_column_size(before_state) <= 8192),
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object' and pg_column_size(after_state) <= 8192),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  changed_at timestamptz not null default now()
);

create table if not exists private.v3_backfill_jobs (
  backfill_key text primary key,
  definition_version integer not null check (definition_version >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  cursor jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cursor) = 'object' and pg_column_size(cursor) <= 8192),
  batch_size integer not null check (batch_size between 1 and 1000),
  processed_count bigint not null default 0 check (processed_count >= 0),
  error_count bigint not null default 0 check (error_count >= 0),
  expected_count bigint check (expected_count is null or expected_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 120),
  started_at timestamptz,
  last_checkpoint_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_backfill_key_format
    check (backfill_key ~ '^[a-z][a-z0-9_.:-]{2,159}$'),
  constraint v3_backfill_lease_consistency
    check (
      (status = 'running' and lease_owner is not null and lease_expires_at is not null)
      or (status <> 'running' and lease_owner is null and lease_expires_at is null)
    )
);

create table if not exists private.v3_migration_parity_runs (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  migration_key text not null,
  backfill_key text references private.v3_backfill_jobs(backfill_key) on delete restrict,
  expected_count bigint not null check (expected_count >= 0),
  actual_count bigint not null check (actual_count >= 0),
  missing_count bigint not null default 0 check (missing_count >= 0),
  duplicate_count bigint not null default 0 check (duplicate_count >= 0),
  critical_query_failures integer not null default 0 check (critical_query_failures >= 0),
  passed boolean not null,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  recorded_at timestamptz not null default now(),
  constraint v3_migration_parity_key_format
    check (migration_key ~ '^[a-z][a-z0-9_.:-]{2,159}$')
);

create index if not exists v3_migration_parity_runs_key_time_idx
  on private.v3_migration_parity_runs (migration_key, sequence desc);
create index if not exists v3_backfill_jobs_status_idx
  on private.v3_backfill_jobs (status, updated_at);

insert into private.v3_schema_compatibility (
  singleton,
  current_schema_version,
  min_client_schema_version,
  max_client_schema_version,
  phase,
  migration_key,
  reason
) values (
  true,
  1,
  1,
  1,
  'expand',
  'baseline.v3',
  'Initial V3 compatibility contract; version changes require an explicit S13 migration contract.'
)
on conflict (singleton) do nothing;

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  reason
) values (
  'v3.s13.migration-hardening',
  1,
  'forward_fix_only',
  false,
  'Additive S13 framework. Removing it after dependent migrations exist is unsafe; repair forward instead.'
)
on conflict (migration_key) do nothing;

revoke all on table private.v3_migration_contracts from public, anon, authenticated;
revoke all on table private.v3_schema_compatibility from public, anon, authenticated;
revoke all on table private.v3_schema_compatibility_history from public, anon, authenticated;
revoke all on table private.v3_backfill_jobs from public, anon, authenticated;
revoke all on table private.v3_migration_parity_runs from public, anon, authenticated;

-- Service-role callers mutate S13 state only through the guarded security-definer
-- commands below. Direct table writes remain owner-only so migration invariants
-- cannot be bypassed by an application worker.

create or replace function public.v3_schema_compatibility(
  p_client_schema_version integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $compatibility$
declare
  v_state private.v3_schema_compatibility%rowtype;
  v_status text;
begin
  select * into v_state
  from private.v3_schema_compatibility
  where singleton = true;

  if v_state.singleton is null then
    raise exception 'V3 schema compatibility state is unavailable' using errcode = '55000';
  end if;

  if p_client_schema_version is null then
    v_status := 'unknown';
  elsif p_client_schema_version < 1 then
    raise exception 'Client schema version must be positive' using errcode = '22023';
  elsif p_client_schema_version < v_state.min_client_schema_version then
    v_status := 'upgrade_required';
  elsif p_client_schema_version > v_state.max_client_schema_version then
    v_status := 'server_upgrade_required';
  else
    v_status := 'compatible';
  end if;

  return jsonb_build_object(
    'serverSchemaVersion', v_state.current_schema_version,
    'minClientSchemaVersion', v_state.min_client_schema_version,
    'maxClientSchemaVersion', v_state.max_client_schema_version,
    'phase', v_state.phase,
    'migrationKey', v_state.migration_key,
    'status', v_status,
    'updatedAt', v_state.updated_at
  );
end
$compatibility$;

revoke all on function public.v3_schema_compatibility(integer) from public;
grant execute on function public.v3_schema_compatibility(integer)
  to anon, authenticated, service_role;

create or replace function public.v3_register_migration_contract(
  p_migration_key text,
  p_schema_version integer,
  p_rollback_mode text,
  p_destructive boolean,
  p_backfill_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $register$
declare
  v_existing private.v3_migration_contracts%rowtype;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_migration_key is null
     or p_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or p_schema_version is null or p_schema_version < 1
     or p_rollback_mode is null
     or p_rollback_mode not in ('reversible', 'forward_fix_only')
     or p_destructive is null
     or (p_backfill_key is not null and p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$')
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(p_reason) > 1000 then
    raise exception 'Invalid migration contract' using errcode = '22023';
  end if;

  select * into v_existing
  from private.v3_migration_contracts
  where migration_key = p_migration_key
  for update;

  if v_existing.migration_key is not null then
    if v_existing.schema_version is distinct from p_schema_version
       or v_existing.rollback_mode is distinct from p_rollback_mode
       or v_existing.destructive is distinct from p_destructive
       or v_existing.backfill_key is distinct from p_backfill_key
       or v_existing.reason is distinct from btrim(p_reason) then
      raise exception 'Migration contract semantic conflict' using errcode = '23505';
    end if;
  else
    insert into private.v3_migration_contracts (
      migration_key, schema_version, rollback_mode, destructive, backfill_key, reason
    ) values (
      p_migration_key, p_schema_version, p_rollback_mode, p_destructive, p_backfill_key, btrim(p_reason)
    );
  end if;

  return jsonb_build_object(
    'migrationKey', p_migration_key,
    'schemaVersion', p_schema_version,
    'rollbackMode', p_rollback_mode,
    'destructive', p_destructive,
    'backfillKey', p_backfill_key,
    'replayed', v_existing.migration_key is not null
  );
end
$register$;

revoke all on function public.v3_register_migration_contract(text, integer, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.v3_register_migration_contract(text, integer, text, boolean, text, text)
  to service_role;

create or replace function public.v3_claim_backfill(
  p_backfill_key text,
  p_definition_version integer,
  p_batch_size integer,
  p_worker_id text,
  p_lease_seconds integer default 300,
  p_expected_count bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $claim$
declare
  v_job private.v3_backfill_jobs%rowtype;
  v_now timestamptz := now();
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_backfill_key is null
     or p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or p_definition_version is null or p_definition_version < 1
     or p_batch_size is null or p_batch_size not between 1 and 1000
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160
     or p_lease_seconds is null or p_lease_seconds not between 5 and 3600
     or (p_expected_count is not null and p_expected_count < 0) then
    raise exception 'Invalid backfill claim parameters' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from private.v3_migration_contracts contract
    where contract.backfill_key = p_backfill_key
  ) then
    raise exception 'Backfill is not registered by a migration contract' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v3-backfill:' || p_backfill_key, 0));

  select * into v_job
  from private.v3_backfill_jobs
  where backfill_key = p_backfill_key
  for update;

  if v_job.backfill_key is null then
    insert into private.v3_backfill_jobs (
      backfill_key, definition_version, status, cursor, batch_size, expected_count
    ) values (
      p_backfill_key, p_definition_version, 'pending', '{}'::jsonb, p_batch_size, p_expected_count
    )
    returning * into v_job;
  end if;

  if v_job.definition_version is distinct from p_definition_version then
    raise exception 'Backfill definition version conflict' using errcode = '23505';
  end if;
  if v_job.expected_count is not null
     and p_expected_count is not null
     and v_job.expected_count is distinct from p_expected_count then
    raise exception 'Backfill expected-count conflict' using errcode = '23505';
  end if;
  if v_job.expected_count is null and p_expected_count is not null then
    update private.v3_backfill_jobs
    set expected_count = p_expected_count,
        updated_at = v_now
    where backfill_key = p_backfill_key
    returning * into v_job;
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object(
      'backfillKey', v_job.backfill_key,
      'status', v_job.status,
      'claimed', false,
      'replayed', true,
      'cursor', v_job.cursor,
      'batchSize', v_job.batch_size,
      'processedCount', v_job.processed_count,
      'expectedCount', v_job.expected_count
    );
  end if;

  if v_job.status = 'running'
     and v_job.lease_expires_at > v_now
     and v_job.lease_owner is distinct from p_worker_id then
    raise exception 'Backfill lease is owned by another worker' using errcode = '40001';
  end if;

  update private.v3_backfill_jobs
  set status = 'running',
      batch_size = p_batch_size,
      lease_owner = p_worker_id,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      started_at = coalesce(started_at, v_now),
      completed_at = null,
      updated_at = v_now
  where backfill_key = p_backfill_key
  returning * into v_job;

  return jsonb_build_object(
    'backfillKey', v_job.backfill_key,
    'status', v_job.status,
    'claimed', true,
    'replayed', false,
    'cursor', v_job.cursor,
    'batchSize', v_job.batch_size,
    'processedCount', v_job.processed_count,
    'errorCount', v_job.error_count,
    'expectedCount', v_job.expected_count,
    'leaseExpiresAt', v_job.lease_expires_at
  );
end
$claim$;

revoke all on function public.v3_claim_backfill(text, integer, integer, text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.v3_claim_backfill(text, integer, integer, text, integer, bigint)
  to service_role;

create or replace function public.v3_checkpoint_backfill(
  p_backfill_key text,
  p_worker_id text,
  p_next_cursor jsonb,
  p_processed_delta integer,
  p_error_delta integer default 0,
  p_last_error_code text default null,
  p_done boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $checkpoint$
declare
  v_job private.v3_backfill_jobs%rowtype;
  v_processed bigint;
  v_errors bigint;
  v_now timestamptz := now();
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_backfill_key is null
     or p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160
     or jsonb_typeof(coalesce(p_next_cursor, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_next_cursor, '{}'::jsonb)) > 8192
     or p_processed_delta is null or p_processed_delta < 0
     or p_error_delta is null or p_error_delta < 0
     or p_error_delta > p_processed_delta
     or (p_last_error_code is not null and length(p_last_error_code) not between 1 and 120)
     or p_done is null then
    raise exception 'Invalid backfill checkpoint parameters' using errcode = '22023';
  end if;

  select * into v_job
  from private.v3_backfill_jobs
  where backfill_key = p_backfill_key
  for update;

  if v_job.backfill_key is null then
    raise exception 'Backfill job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'running'
     or v_job.lease_owner is distinct from p_worker_id
     or v_job.lease_expires_at <= v_now then
    raise exception 'Backfill lease is no longer owned by this worker' using errcode = '40001';
  end if;
  if p_processed_delta > v_job.batch_size then
    raise exception 'Backfill checkpoint exceeds claimed batch size' using errcode = '22023';
  end if;

  v_processed := v_job.processed_count + p_processed_delta;
  v_errors := v_job.error_count + p_error_delta;

  if v_job.expected_count is not null and v_processed > v_job.expected_count then
    raise exception 'Backfill processed count exceeds expected count' using errcode = '23514';
  end if;
  if p_done and v_job.expected_count is not null and v_processed <> v_job.expected_count then
    raise exception 'Backfill cannot complete before expected count is reached' using errcode = '23514';
  end if;

  update private.v3_backfill_jobs
  set status = case when p_done then 'completed' else 'pending' end,
      cursor = coalesce(p_next_cursor, '{}'::jsonb),
      processed_count = v_processed,
      error_count = v_errors,
      last_error_code = p_last_error_code,
      lease_owner = null,
      lease_expires_at = null,
      last_checkpoint_at = v_now,
      completed_at = case when p_done then v_now else null end,
      updated_at = v_now
  where backfill_key = p_backfill_key
  returning * into v_job;

  return jsonb_build_object(
    'backfillKey', v_job.backfill_key,
    'status', v_job.status,
    'cursor', v_job.cursor,
    'processedCount', v_job.processed_count,
    'errorCount', v_job.error_count,
    'expectedCount', v_job.expected_count,
    'completedAt', v_job.completed_at
  );
end
$checkpoint$;

revoke all on function public.v3_checkpoint_backfill(text, text, jsonb, integer, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.v3_checkpoint_backfill(text, text, jsonb, integer, integer, text, boolean)
  to service_role;

create or replace function public.v3_fail_backfill(
  p_backfill_key text,
  p_worker_id text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fail$
declare
  v_job private.v3_backfill_jobs%rowtype;
  v_now timestamptz := now();
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_backfill_key is null
     or p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or nullif(btrim(coalesce(p_error_code, '')), '') is null
     or length(p_error_code) > 120 then
    raise exception 'Invalid backfill failure parameters' using errcode = '22023';
  end if;

  select * into v_job
  from private.v3_backfill_jobs
  where backfill_key = p_backfill_key
  for update;

  if v_job.backfill_key is null then
    raise exception 'Backfill job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'running'
     or v_job.lease_owner is distinct from p_worker_id
     or v_job.lease_expires_at <= v_now then
    raise exception 'Backfill lease is no longer owned by this worker' using errcode = '40001';
  end if;

  update private.v3_backfill_jobs
  set status = 'failed',
      error_count = error_count + 1,
      last_error_code = btrim(p_error_code),
      lease_owner = null,
      lease_expires_at = null,
      last_checkpoint_at = v_now,
      updated_at = v_now
  where backfill_key = p_backfill_key
  returning * into v_job;

  return jsonb_build_object(
    'backfillKey', v_job.backfill_key,
    'status', v_job.status,
    'errorCount', v_job.error_count,
    'lastErrorCode', v_job.last_error_code
  );
end
$fail$;

revoke all on function public.v3_fail_backfill(text, text, text)
  from public, anon, authenticated;
grant execute on function public.v3_fail_backfill(text, text, text)
  to service_role;

create or replace function public.v3_record_migration_parity(
  p_migration_key text,
  p_backfill_key text,
  p_expected_count bigint,
  p_actual_count bigint,
  p_missing_count bigint default 0,
  p_duplicate_count bigint default 0,
  p_critical_query_failures integer default 0,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $parity$
declare
  v_contract private.v3_migration_contracts%rowtype;
  v_backfill private.v3_backfill_jobs%rowtype;
  v_passed boolean;
  v_id uuid;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_migration_key is null
     or p_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or (p_backfill_key is not null and p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$')
     or p_expected_count is null or p_expected_count < 0
     or p_actual_count is null or p_actual_count < 0
     or p_missing_count is null or p_missing_count < 0
     or p_duplicate_count is null or p_duplicate_count < 0
     or p_critical_query_failures is null or p_critical_query_failures < 0
     or jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_details, '{}'::jsonb)) > 8192 then
    raise exception 'Invalid migration parity evidence' using errcode = '22023';
  end if;

  select * into v_contract
  from private.v3_migration_contracts contract
  where contract.migration_key = p_migration_key;

  if v_contract.migration_key is null then
    raise exception 'Migration contract not found' using errcode = 'P0002';
  end if;
  if v_contract.backfill_key is distinct from p_backfill_key then
    raise exception 'Parity backfill key does not match migration contract' using errcode = '23514';
  end if;

  if p_backfill_key is not null then
    select * into v_backfill
    from private.v3_backfill_jobs
    where backfill_key = p_backfill_key;
    if v_backfill.backfill_key is null then
      raise exception 'Backfill job not found for parity validation' using errcode = 'P0002';
    end if;
    if v_backfill.status <> 'completed' then
      raise exception 'Backfill must be completed before parity validation' using errcode = '55000';
    end if;
  end if;

  v_passed := p_expected_count = p_actual_count
    and p_missing_count = 0
    and p_duplicate_count = 0
    and p_critical_query_failures = 0;

  insert into private.v3_migration_parity_runs (
    migration_key,
    backfill_key,
    expected_count,
    actual_count,
    missing_count,
    duplicate_count,
    critical_query_failures,
    passed,
    details
  ) values (
    p_migration_key,
    p_backfill_key,
    p_expected_count,
    p_actual_count,
    p_missing_count,
    p_duplicate_count,
    p_critical_query_failures,
    v_passed,
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object(
    'parityRunId', v_id,
    'migrationKey', p_migration_key,
    'backfillKey', p_backfill_key,
    'expected', p_expected_count,
    'actual', p_actual_count,
    'missing', p_missing_count,
    'duplicates', p_duplicate_count,
    'criticalQueryFailures', p_critical_query_failures,
    'passed', v_passed
  );
end
$parity$;

revoke all on function public.v3_record_migration_parity(text, text, bigint, bigint, bigint, bigint, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.v3_record_migration_parity(text, text, bigint, bigint, bigint, bigint, integer, jsonb)
  to service_role;

create or replace function public.v3_set_schema_compatibility(
  p_current_schema_version integer,
  p_min_client_schema_version integer,
  p_max_client_schema_version integer,
  p_phase text,
  p_migration_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $set_compatibility$
declare
  v_current private.v3_schema_compatibility%rowtype;
  v_contract private.v3_migration_contracts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_current_phase_order integer;
  v_next_phase_order integer;
  v_parity_passed boolean := false;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_current_schema_version is null or p_current_schema_version < 1
     or p_min_client_schema_version is null or p_min_client_schema_version < 1
     or p_max_client_schema_version is null or p_max_client_schema_version < p_min_client_schema_version
     or p_current_schema_version not between p_min_client_schema_version and p_max_client_schema_version
     or p_phase is null
     or p_phase not in ('expand', 'backfill', 'dual-compatible', 'switch', 'validate', 'contract')
     or p_migration_key is null or p_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(p_reason) > 1000 then
    raise exception 'Invalid schema compatibility transition' using errcode = '22023';
  end if;

  select * into v_current
  from private.v3_schema_compatibility
  where singleton = true
  for update;

  if v_current.singleton is null then
    raise exception 'V3 schema compatibility state is unavailable' using errcode = '55000';
  end if;

  select * into v_contract
  from private.v3_migration_contracts
  where migration_key = p_migration_key;

  if v_contract.migration_key is null then
    raise exception 'Migration contract not found' using errcode = 'P0002';
  end if;
  if v_contract.schema_version is distinct from p_current_schema_version then
    raise exception 'Migration contract schema version mismatch' using errcode = '23514';
  end if;

  v_current_phase_order := case v_current.phase
    when 'expand' then 1 when 'backfill' then 2 when 'dual-compatible' then 3
    when 'switch' then 4 when 'validate' then 5 when 'contract' then 6 end;
  v_next_phase_order := case p_phase
    when 'expand' then 1 when 'backfill' then 2 when 'dual-compatible' then 3
    when 'switch' then 4 when 'validate' then 5 when 'contract' then 6 end;

  if p_current_schema_version = v_current.current_schema_version then
    if p_migration_key is distinct from v_current.migration_key then
      if v_current.migration_key <> 'baseline.v3' then
        raise exception 'Migration identity cannot change within one schema version' using errcode = '23514';
      end if;
      if p_phase <> 'expand' then
        raise exception 'A migration identity change must begin in expand phase' using errcode = '23514';
      end if;
    elsif v_next_phase_order < v_current_phase_order then
      raise exception 'Schema compatibility phase cannot move backwards' using errcode = '23514';
    elsif v_next_phase_order > v_current_phase_order + 1 then
      raise exception 'Schema compatibility phases cannot be skipped' using errcode = '23514';
    end if;
  elsif p_current_schema_version = v_current.current_schema_version + 1 then
    if p_phase <> 'expand' then
      raise exception 'A new schema version must begin in expand phase' using errcode = '23514';
    end if;
  else
    raise exception 'Schema compatibility versions must advance one version at a time' using errcode = '23514';
  end if;

  if p_phase = 'contract'
     and (p_min_client_schema_version <> p_current_schema_version
          or p_max_client_schema_version <> p_current_schema_version) then
    raise exception 'Contract phase requires retiring older/newer client schema versions' using errcode = '23514';
  end if;

  if v_next_phase_order >= 4 then
    select coalesce((
      select parity.passed
      from private.v3_migration_parity_runs parity
      where parity.migration_key = p_migration_key
      order by parity.sequence desc
      limit 1
    ), false)
    into v_parity_passed;
    if not v_parity_passed then
      raise exception 'Passing migration parity evidence is required before cutover' using errcode = '55000';
    end if;
  end if;

  v_before := jsonb_build_object(
    'serverSchemaVersion', v_current.current_schema_version,
    'minClientSchemaVersion', v_current.min_client_schema_version,
    'maxClientSchemaVersion', v_current.max_client_schema_version,
    'phase', v_current.phase,
    'migrationKey', v_current.migration_key
  );

  update private.v3_schema_compatibility
  set current_schema_version = p_current_schema_version,
      min_client_schema_version = p_min_client_schema_version,
      max_client_schema_version = p_max_client_schema_version,
      phase = p_phase,
      migration_key = p_migration_key,
      reason = btrim(p_reason),
      updated_at = now()
  where singleton = true
  returning jsonb_build_object(
    'serverSchemaVersion', current_schema_version,
    'minClientSchemaVersion', min_client_schema_version,
    'maxClientSchemaVersion', max_client_schema_version,
    'phase', phase,
    'migrationKey', migration_key,
    'updatedAt', updated_at
  ) into v_after;

  insert into private.v3_schema_compatibility_history (
    schema_version, phase, migration_key, before_state, after_state, reason
  ) values (
    p_current_schema_version, p_phase, p_migration_key, v_before, v_after, btrim(p_reason)
  );

  return v_after;
end
$set_compatibility$;

revoke all on function public.v3_set_schema_compatibility(integer, integer, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.v3_set_schema_compatibility(integer, integer, integer, text, text, text)
  to service_role;

comment on function public.v3_schema_compatibility(integer) is
  'S13 safe compatibility projection. Callers can distinguish compatible, upgrade-required and server-upgrade-required clients.';
comment on function public.v3_claim_backfill(text, integer, integer, text, integer, bigint) is
  'S13 service-only resumable bounded backfill lease. A checkpoint releases the lease so work yields between batches.';
comment on function public.v3_record_migration_parity(text, text, bigint, bigint, bigint, bigint, integer, jsonb) is
  'S13 service-only parity evidence. Cutover phases require the latest evidence for the migration to pass.';

notify pgrst, 'reload schema';

commit;
