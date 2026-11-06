begin;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg14.hearings-orders',1,'forward_fix_only',false,null,
   'Official UNITY Court hearings with append-only state history and SG-issued immutable procedural orders.'
  );
 end if;
end $contract$;

create table public.world_court_hearings(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 format text not null,
 location_note text,
 status text not null default 'scheduled',
 held_summary text,
 cancellation_reason text,
 scheduled_by_user_id uuid not null,
 decided_by_user_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision bigint not null default 1,
 scheduled_operation_id uuid not null unique,
 decision_operation_id uuid unique,
 constraint court_hearing_time_valid check(ends_at>starts_at),
 constraint court_hearing_format_check check(format in ('written','video','in_person','hybrid')),
 constraint court_hearing_status_check check(status in ('scheduled','held','cancelled')),
 constraint court_hearing_revision_check check(revision between 1 and 2),
 constraint court_hearing_location_length check(length(coalesce(location_note,''))<=500),
 constraint court_hearing_final_reason check(
   (status='scheduled' and held_summary is null and cancellation_reason is null
     and decision_operation_id is null and decided_by_user_id is null)
   or (status='held' and length(btrim(coalesce(held_summary,''))) between 10 and 5000
     and cancellation_reason is null and decision_operation_id is not null
     and decided_by_user_id is not null)
   or (status='cancelled' and length(btrim(coalesce(cancellation_reason,''))) between 10 and 5000
     and held_summary is null and decision_operation_id is not null
     and decided_by_user_id is not null)
 )
);
create index world_court_hearings_case_idx
 on public.world_court_hearings(case_id,starts_at,created_at);

create table public.world_court_hearing_events(
 id uuid primary key default gen_random_uuid(),
 hearing_id uuid not null references public.world_court_hearings(id) on delete restrict,
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 from_state text,
 to_state text not null check(to_state in ('scheduled','held','cancelled')),
 reason text,
 actor_user_id uuid not null,
 operation_id uuid not null unique,
 case_revision bigint not null,
 hearing_revision bigint not null,
 recorded_at timestamptz not null default now(),
 unique(hearing_id,hearing_revision),
 unique(case_id,case_revision),
 constraint court_hearing_event_revision check(hearing_revision between 1 and 2)
);

create table public.world_court_orders(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 order_number integer not null check(order_number>0),
 title text not null check(length(btrim(title)) between 6 and 200),
 body text not null check(length(btrim(body)) between 20 and 12000),
 effective_at timestamptz,
 judge_person_id uuid not null references public.delegation_people(id) on delete restrict,
 issued_by_user_id uuid not null,
 published_at timestamptz not null default now(),
 publicly_listed boolean not null default false,
 case_revision bigint not null,
 operation_id uuid not null unique,
 unique(case_id,order_number),
 unique(case_id,case_revision)
);
create index world_court_orders_case_idx
 on public.world_court_orders(case_id,published_at desc);

create function private.world_court_order_event_immutable()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
 raise exception using errcode='42501',message='IMMUTABLE_COURT_EVENT';
end $immutable$;
revoke all on function private.world_court_order_event_immutable()
 from public,anon,authenticated,service_role;
create trigger world_court_hearing_events_immutable
 before update or delete on public.world_court_hearing_events
 for each row execute function private.world_court_order_event_immutable();
create trigger world_court_orders_immutable
 before update or delete on public.world_court_orders
 for each row execute function private.world_court_order_event_immutable();

alter table public.world_court_hearings enable row level security;
alter table public.world_court_hearing_events enable row level security;
alter table public.world_court_orders enable row level security;
revoke all on public.world_court_hearings,public.world_court_hearing_events,
 public.world_court_orders from public,anon,authenticated,service_role;
grant select on public.world_court_hearings,public.world_court_hearing_events,
 public.world_court_orders to authenticated,service_role;

create policy court_hearings_private_read
on public.world_court_hearings for select to authenticated
using(exists(select 1 from public.world_court_cases c where c.id=case_id));
create policy court_hearing_events_private_read
on public.world_court_hearing_events for select to authenticated
using(exists(select 1 from public.world_court_cases c where c.id=case_id));
create policy court_orders_private_read
on public.world_court_orders for select to authenticated
using(exists(select 1 from public.world_court_cases c where c.id=case_id));

-- Public orders are a specific official publication, never a projection of
-- a private hearing, location, evidence or participant login.
create function public.world_court_public_orders_v1(p_case_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $projection$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',ord.id,'caseId',ord.case_id,'orderNumber',ord.order_number,
  'title',ord.title,'body',ord.body,'effectiveAt',ord.effective_at,
  'publishedAt',ord.published_at
 ) order by ord.order_number),'[]'::jsonb)
 from (
  select ord.id,ord.case_id,ord.order_number,ord.title,ord.body,
    ord.effective_at,ord.published_at
  from public.world_court_orders ord
  join public.world_court_cases c on c.id=ord.case_id
  join public.world_organizations org on org.id=c.organization_id
  where ord.case_id=p_case_id and ord.publicly_listed
   and c.public_metadata @> '{"listed":true}'::jsonb
   and org.slug='unity' and org.public_visibility='public'
   and org.status in ('active','recognized')
   and public.studio2_feature_enabled('terra_world_public',null) is true
  order by ord.order_number desc,ord.id
  limit 50
 ) ord
$projection$;
revoke all on function public.world_court_public_orders_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_court_public_orders_v1(uuid)
 to anon,authenticated,service_role;

create function public.world_schedule_court_hearing_v1(
 p_case_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,
 p_format text,p_location_note text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $schedule$
declare
 v_case public.world_court_cases%rowtype;
 v_location text:=nullif(btrim(coalesce(p_location_note,'')),'');
 v_claim jsonb;v_op uuid;v_id uuid;v_result jsonb;
begin
 if auth.uid() is null or p_case_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_expected_revision is null or p_expected_revision<1
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
  or p_starts_at is null or p_ends_at is null
  or p_ends_at<=p_starts_at
  or p_ends_at-p_starts_at>interval '14 days'
  or p_format not in ('written','video','in_person','hybrid')
  or length(coalesce(v_location,''))>500 then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id;
 if not found or not public.world_access_allowed('world.court.manage',
  v_case.organization_id,null,null,'court',v_case.id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.hearing.schedule','R2',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',p_case_id),
  jsonb_build_object('caseId',p_case_id,'startsAt',p_starts_at,
   'endsAt',p_ends_at,'format',p_format,'locationNote',v_location,
   'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id for update;
 if v_case.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 -- A duplicate completed schedule must replay even after its original start.
 -- New schedules still require a future start at the case-lock boundary.
 if p_starts_at<=now() then
  raise exception using errcode='23514',message='HEARING_START_IN_PAST';
 end if;
 if not public.world_access_allowed('world.court.manage',
   v_case.organization_id,null,null,'court',v_case.id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_case.status not in ('proceedings','hearing') or
  exists(select 1 from public.world_court_hearings h
   where h.case_id=p_case_id and h.status='scheduled'
     and h.starts_at < p_ends_at and h.ends_at > p_starts_at) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 insert into public.world_court_hearings(
  case_id,starts_at,ends_at,format,location_note,scheduled_by_user_id,scheduled_operation_id
 ) values(p_case_id,p_starts_at,p_ends_at,p_format,v_location,auth.uid(),v_op)
 returning id into v_id;
 insert into public.world_court_hearing_events(
  hearing_id,case_id,from_state,to_state,reason,actor_user_id,
  operation_id,case_revision,hearing_revision
 ) values(v_id,p_case_id,null,'scheduled',null,auth.uid(),v_op,v_case.revision+1,1);
 update public.world_court_cases
  set revision=revision+1,updated_at=now() where id=p_case_id;
 perform private.v3_emit_domain_event(
  'world.court.hearing_scheduled','world_court_case',p_case_id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',p_case_id,'hearingId',v_id,'revision',v_case.revision+1),
  1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',p_case_id,'identifier',v_case.identifier,
  'hearingId',v_id,'revision',v_case.revision+1,'status',v_case.status,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $schedule$;

create function public.world_decide_court_hearing_v1(
 p_hearing_id uuid,p_target_state text,p_reason text,p_expected_case_revision bigint,
 p_expected_hearing_revision bigint,p_operation_id uuid,p_idempotency_key text,
 p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $decide$
declare
 v_case public.world_court_cases%rowtype;
 v_hearing public.world_court_hearings%rowtype;
 v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
 v_claim jsonb;v_op uuid;v_result jsonb;
begin
 if auth.uid() is null or p_hearing_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_target_state not in ('held','cancelled') or v_reason is null
  or length(v_reason) not between 10 and 5000
  or p_expected_case_revision is null or p_expected_case_revision<1
  or p_expected_hearing_revision is null or p_expected_hearing_revision<1
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_hearing from public.world_court_hearings where id=p_hearing_id;
 if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 select * into v_case from public.world_court_cases where id=v_hearing.case_id;
 if not found or not public.world_access_allowed('world.court.manage',
  v_case.organization_id,null,null,'court',v_case.id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.hearing.decide','R2',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',v_case.id),
  jsonb_build_object('hearingId',p_hearing_id,'targetState',p_target_state,
   'reason',v_reason,'caseRevision',p_expected_case_revision,
   'hearingRevision',p_expected_hearing_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=v_hearing.case_id for update;
 select * into v_hearing from public.world_court_hearings where id=p_hearing_id for update;
 if v_case.revision is distinct from p_expected_case_revision
  or v_hearing.revision is distinct from p_expected_hearing_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 if not public.world_access_allowed('world.court.manage',
   v_case.organization_id,null,null,'court',v_case.id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_hearing.status<>'scheduled'
  or v_case.status in ('decided','closed','archived')
  or (p_target_state='held' and now()<v_hearing.starts_at) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 update public.world_court_hearings set
  status=p_target_state,revision=revision+1,updated_at=now(),
  decided_by_user_id=auth.uid(),decision_operation_id=v_op,
  held_summary=case when p_target_state='held' then v_reason else null end,
  cancellation_reason=case when p_target_state='cancelled' then v_reason else null end
 where id=p_hearing_id;
 insert into public.world_court_hearing_events(
  hearing_id,case_id,from_state,to_state,reason,actor_user_id,
  operation_id,case_revision,hearing_revision
 ) values(p_hearing_id,v_case.id,'scheduled',p_target_state,v_reason,auth.uid(),
  v_op,v_case.revision+1,v_hearing.revision+1);
 update public.world_court_cases set
  revision=revision+1,updated_at=now() where id=v_case.id;
 perform private.v3_emit_domain_event(
  'world.court.hearing_concluded','world_court_case',v_case.id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',v_case.id,'hearingId',p_hearing_id,
    'status',p_target_state,'revision',v_case.revision+1),
  1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',v_case.id,'identifier',v_case.identifier,
  'hearingId',p_hearing_id,'hearingRevision',v_hearing.revision+1,
  'revision',v_case.revision+1,'status',v_case.status,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $decide$;

create function public.world_issue_court_order_v1(
 p_case_id uuid,p_title text,p_body text,p_effective_at timestamptz,
 p_publicly_listed boolean,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $order$
declare
 v_case public.world_court_cases%rowtype;
 v_title text:=nullif(btrim(coalesce(p_title,'')),'');
 v_body text:=nullif(btrim(coalesce(p_body,'')),'');
 v_person uuid;v_claim jsonb;v_op uuid;v_id uuid;v_number integer;v_result jsonb;
begin
 if auth.uid() is null or p_case_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_title is null or length(v_title) not between 6 and 200
  or v_body is null or length(v_body) not between 20 and 12000
  or p_publicly_listed is null or p_expected_revision is null or p_expected_revision<1
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id;
 if not found or private.world_current_court_judge_person(v_case.organization_id) is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.order.publish','R3',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',p_case_id),
  jsonb_build_object('caseId',p_case_id,'title',v_title,'body',v_body,
   'effectiveAt',p_effective_at,'publiclyListed',p_publicly_listed,
   'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id for update;
 if v_case.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 select term.holder_person_id into v_person
 from public.world_office_terms term
 join public.world_organization_offices office on office.id=term.office_id
 join public.world_organizations org on org.id=office.organization_id
 where org.id=v_case.organization_id and org.slug='unity'
  and office.slug='secretary-general' and office.active
  and term.holder_user_id=auth.uid() and term.status='active'
  and term.started_at<=now() and term.actual_end_at is null
 for share;
 if v_person is null or not public.world_access_allowed('world.court.judge',
   v_case.organization_id,null,null,null,null) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_case.status not in ('preliminary_review','response_pending',
   'proceedings','hearing','judgment_pending','decided','reconsideration_requested',
   'reconsideration') then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 select coalesce(max(ord.order_number),0)+1 into v_number
 from public.world_court_orders ord where ord.case_id=p_case_id;
 insert into public.world_court_orders(
  case_id,order_number,title,body,effective_at,judge_person_id,
  issued_by_user_id,publicly_listed,case_revision,operation_id
 ) values(p_case_id,v_number,v_title,v_body,p_effective_at,v_person,
  auth.uid(),p_publicly_listed,v_case.revision+1,v_op)
 returning id into v_id;
 update public.world_court_cases set
  revision=revision+1,updated_at=now(),
  public_metadata=case when p_publicly_listed
   then jsonb_set(public_metadata,'{listed}','true'::jsonb,true)
   else public_metadata end
 where id=p_case_id;
 perform private.v3_emit_domain_event(
  'world.court.order_published','world_court_case',p_case_id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',p_case_id,'orderId',v_id,'orderNumber',v_number,
   'publiclyListed',p_publicly_listed,'revision',v_case.revision+1),
  1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',p_case_id,'identifier',v_case.identifier,
  'orderId',v_id,'orderNumber',v_number,'revision',v_case.revision+1,
  'status',v_case.status,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $order$;

revoke all on function public.world_schedule_court_hearing_v1(uuid,timestamptz,timestamptz,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_decide_court_hearing_v1(uuid,text,text,bigint,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_issue_court_order_v1(uuid,text,text,timestamptz,boolean,bigint,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.world_schedule_court_hearing_v1(uuid,timestamptz,timestamptz,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_decide_court_hearing_v1(uuid,text,text,bigint,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_issue_court_order_v1(uuid,text,text,timestamptz,boolean,bigint,uuid,text,uuid)
 to authenticated,service_role;

notify pgrst,'reload schema';
commit;
