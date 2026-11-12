-- CANDIDATE ONLY: separated local-only S9 index stage; never paste to hosted.
-- These are the EXACT three canonical S9 index definitions, installed with
-- CONCURRENTLY to avoid the long ACCESS EXCLUSIVE writer block of ordinary builds.
-- They must not run inside BEGIN/COMMIT, a Supabase wrapped migration,
-- or any production session without owner approval and verified lock budget.
-- On partial failure, index may remain INVALID: STOP and inspect manually.
-- This file is NOT an automatically tracked migration or release permission.

set lock_timeout = '5s';
set statement_timeout = '120s';
do $s9_index_preflight$
declare
  v_spec record;
begin
  for v_spec in
    select * from (values
      ('public.studio2_operation_receipts', 'created_at',
       'public.studio2_operation_receipts_created_at_idx'),
      ('private.v3_domain_events', 'occurred_at',
       'private.v3_domain_events_occurred_at_idx'),
      ('private.v3_domain_event_outbox', 'created_at',
       'private.v3_domain_event_outbox_created_at_idx')
    ) spec(table_identity,column_name,index_identity)
  loop
    if to_regclass(v_spec.table_identity) is null then
      raise exception 'S9 index stage blocked: ledger missing %',v_spec.table_identity;
    end if;
    if not exists(
      select 1 from pg_attribute
      where attrelid=to_regclass(v_spec.table_identity)
        and attname=v_spec.column_name and not attisdropped
    ) then
      raise exception 'S9 index stage blocked: required column missing %.%',
        v_spec.table_identity,v_spec.column_name;
    end if;
    if to_regclass(v_spec.index_identity) is not null then
      raise exception 'S9 index stage blocked: existing index/object %; reconcile first',
        v_spec.index_identity;
    end if;
  end loop;
end
$s9_index_preflight$;

create index concurrently studio2_operation_receipts_created_at_idx
  on public.studio2_operation_receipts (created_at desc);

create index concurrently v3_domain_events_occurred_at_idx
  on private.v3_domain_events (occurred_at desc, id);

create index concurrently v3_domain_event_outbox_created_at_idx
  on private.v3_domain_event_outbox (created_at desc, event_id, consumer_key);

do $s9_index_postcheck$
declare
  v_name text;
  v_count integer;
begin
  select count(*) into v_count
  from pg_index i
  join pg_class c on c.oid=i.indexrelid
  join pg_namespace n on n.oid=c.relnamespace
  where ((n.nspname='public' and c.relname='studio2_operation_receipts_created_at_idx')
    or (n.nspname='private' and c.relname in
     ('v3_domain_events_occurred_at_idx','v3_domain_event_outbox_created_at_idx')))
    and i.indisvalid and i.indisready;
  if v_count <> 3 then
    raise exception 'S9 index stage incomplete: % of 3 valid/ready',v_count;
  end if;
end
$s9_index_postcheck$;
reset lock_timeout;
reset statement_timeout;
