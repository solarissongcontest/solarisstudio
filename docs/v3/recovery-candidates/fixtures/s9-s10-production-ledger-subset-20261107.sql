-- LOCAL ONLY. Synthetic PG17 ledger schema derived from read-only production
-- pg_attribute and catalog checks (2026-11-07), NOT a hosted DB dump.
-- Reproduces S9/S10 referenced columns and status/RLS shape, not unrelated
-- foreign keys, every index/policy, historical rows or user information.
begin;
create schema private authorization postgres;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
 grant execute on functions to anon, authenticated, service_role;
create function private.studio2_request_is_service_role()
returns boolean language sql stable set search_path=pg_catalog as $body$
 select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$body$;
revoke all on function private.studio2_request_is_service_role()
 from public, anon, authenticated, service_role;

-- A deliberately narrow authority-model stub for fake local users.
-- Real studio2_access_allowed has richer delegated-capability semantics.
create or replace function public.studio2_access_allowed(
 p_capability text, p_edition_id uuid, p_require_fresh boolean
) returns boolean language sql stable security invoker
set search_path=pg_catalog as $body$
 select p_capability='system.read' AND
  coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
$body$;

create table public.studio2_operation_receipts(
 operation_id uuid primary key, actor_id uuid, idempotency_key text not null,
 command text not null, risk_class text not null,
 scope jsonb not null default '{}'::jsonb,
 status text not null default 'processing',
 result jsonb, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), actor_session_id text,
 auth_freshness_evidence jsonb, correlation_id uuid not null,
 request_fingerprint text not null, completed_at timestamptz,
 error_code text,error_metadata jsonb
);
alter table public.studio2_operation_receipts enable row level security;
grant all on public.studio2_operation_receipts to service_role;

create table private.v3_domain_events(
 id uuid primary key default gen_random_uuid(),
 event_type text not null, aggregate_type text not null,
 aggregate_id text not null, aggregate_version bigint not null,
 operation_id uuid not null, correlation_id uuid not null,
 edition_id uuid, show_id uuid, actor_id uuid,
 occurred_at timestamptz not null default now(),
 payload jsonb not null default '{}'::jsonb,
 schema_version integer not null default 1
);
create table private.v3_domain_event_outbox(
 event_id uuid not null references private.v3_domain_events(id),
 consumer_key text not null, status text not null default 'pending',
 attempt_count integer not null default 0,
 available_at timestamptz not null default now(),
 lease_owner text,lease_expires_at timestamptz,
 last_error_code text,last_error_metadata jsonb,
 completed_at timestamptz,dead_lettered_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(event_id,consumer_key)
);

-- Local-only canaries prove S9/S10 never publish payload, result or metadata.
insert into public.studio2_operation_receipts
 (operation_id,idempotency_key,command,risk_class,status,scope,
  result,correlation_id,request_fingerprint,error_metadata,
  created_at,updated_at,completed_at)
values
 ('11111111-1111-4111-8111-111111111111','local-idem-1','local.command','R1',
  'succeeded','{}','{"privateMark":"CANARY_SECRET_RESULT"}',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),null,now()-interval '5 minutes',now(),now()-interval '3 minutes'),
 ('22222222-2222-4222-8222-222222222222','local-idem-2','local.command','R1',
  'failed','{}',null,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',repeat('b',64),
  '{"privateMark":"CANARY_SECRET_METADATA"}',now()-interval '4 minutes',now(),now()-interval '2 minutes');
update public.studio2_operation_receipts
 set error_code='VERSION_CONFLICT'
 where operation_id='22222222-2222-4222-8222-222222222222';

insert into private.v3_domain_events
(id,event_type,aggregate_type,aggregate_id,aggregate_version,operation_id,correlation_id,payload,occurred_at)
values
('33333333-3333-4333-8333-333333333333','local.changed','local',
 'local_aggregate',1,'11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '{"privateMark":"CANARY_SECRET_EVENT"}',now()-interval '3 minutes');

insert into private.v3_domain_event_outbox
(event_id,consumer_key,status,attempt_count,available_at,completed_at,created_at)
values
('33333333-3333-4333-8333-333333333333','local.consumer','completed',1,
now()-interval '3 minutes',now()-interval '1 minute',now()-interval '3 minutes');
commit;
