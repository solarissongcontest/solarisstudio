begin;

-- TG13 GUARD non-compliance inquiry. No sanction, membership suspension or
-- expulsion may be executed by these commands; TG9/TG8 remain sole authorities.
do $migration$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg13.guard-noncompliance-inquiry',1,'forward_fix_only',false,null,
   'Record GUARD Chairperson inquiries, timed country responses, immutable official review, without executing sanctions.'
  );
 end if;
end $migration$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
 ('world.inquiry.open','world','Open GUARD inquiry','Current authorized GUARD Chairperson opens a formal non-compliance inquiry.','operate'),
 ('world.inquiry.respond','world','Respond to GUARD inquiry','Current country controller submits its official inquiry response.','operate'),
 ('world.inquiry.review','world','Review GUARD inquiry','Current authorized GUARD Chairperson records review and a nonbinding recommendation.','approve')
on conflict(key) do nothing;

insert into public.world_country_controller_capabilities(capability)
values ('world.inquiry.respond')
on conflict do nothing;

-- This is capability-based office assignment, NOT the UI checking an office title.
-- The TG2 server access resolver additionally requires an effective active term.
insert into public.world_office_capabilities(office_id,capability)
select office.id,cap.key
from public.world_organization_offices office
join public.world_organizations org on org.id=office.organization_id
cross join (values('world.inquiry.open'),('world.inquiry.review')) cap(key)
where org.slug='guard' and office.slug='chairperson'
on conflict do nothing;

create table public.world_guard_inquiries(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.world_organizations(id) on delete restrict,
 target_country_id uuid not null references public.countries(id) on delete restrict,
 allegation text not null,
 source_reference text not null,
 response_due_at timestamptz not null,
 opened_at timestamptz not null default now(),
 opened_by_user_id uuid not null,
 status text not null default 'awaiting_response',
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint world_guard_inquiry_text_check check (
  length(btrim(allegation)) between 20 and 8000 and
  length(btrim(source_reference)) between 10 and 500
 ),
 constraint world_guard_inquiry_deadline_check check(response_due_at > opened_at),
 constraint world_guard_inquiry_status_check check(status in ('awaiting_response','response_received','reviewed')),
 constraint world_guard_inquiry_revision_check check(revision>=1)
);
create index world_guard_inquiry_target_idx
 on public.world_guard_inquiries(target_country_id,opened_at desc);
create index world_guard_inquiry_org_idx
 on public.world_guard_inquiries(organization_id,status,opened_at desc);

create table public.world_guard_inquiry_responses(
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null unique references public.world_guard_inquiries(id) on delete restrict,
 responding_country_id uuid not null references public.countries(id) on delete restrict,
 response_text text not null,
 submitted_at timestamptz not null default now(),
 was_late boolean not null,
 submitted_by_user_id uuid not null,
 case_revision bigint not null,
 operation_id uuid not null unique,
 constraint world_guard_inquiry_response_text_check check(length(btrim(response_text)) between 20 and 12000),
 constraint world_guard_inquiry_response_revision_check check(case_revision>1)
);

create table public.world_guard_inquiry_reviews(
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null unique references public.world_guard_inquiries(id) on delete restrict,
 decision_kind text not null,
 proposed_action text,
 findings text not null,
 reviewed_at timestamptz not null default now(),
 reviewed_by_user_id uuid not null,
 chair_person_id uuid not null references public.delegation_people(id) on delete restrict,
 case_revision bigint not null,
 operation_id uuid not null unique,
 constraint world_guard_review_kind_check check(decision_kind in ('no_action','recommend_action')),
 constraint world_guard_review_proposal_check check(
  (decision_kind='no_action' and proposed_action is null) or
  (decision_kind='recommend_action' and proposed_action in (
   'warning','censure','voting_suspension','assistance_freeze'
  ))
 ),
 constraint world_guard_review_findings_check check(length(btrim(findings)) between 20 and 8000)
);

create table public.world_guard_inquiry_history(
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.world_guard_inquiries(id) on delete restrict,
 action text not null,
 from_state text,
 to_state text not null,
 actor_user_id uuid not null,
 operation_id uuid not null unique,
 revision bigint not null,
 recorded_at timestamptz not null default now(),
 unique(inquiry_id,revision),
 constraint world_guard_inquiry_history_revision_check check(revision>=1),
 constraint world_guard_inquiry_history_to_state_check check(
  to_state in ('awaiting_response','response_received','reviewed')
 )
);

create function private.world_guard_inquiry_immutable()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
 raise exception using errcode='42501',message='IMMUTABLE_GUARD_INQUIRY_RECORD';
end $immutable$;
revoke all on function private.world_guard_inquiry_immutable()
 from public,anon,authenticated,service_role;
create trigger world_guard_inquiry_responses_immutable
 before update or delete on public.world_guard_inquiry_responses
 for each row execute function private.world_guard_inquiry_immutable();
create trigger world_guard_inquiry_reviews_immutable
 before update or delete on public.world_guard_inquiry_reviews
 for each row execute function private.world_guard_inquiry_immutable();
create trigger world_guard_inquiry_history_immutable
 before update or delete on public.world_guard_inquiry_history
 for each row execute function private.world_guard_inquiry_immutable();

alter table public.world_guard_inquiries enable row level security;
alter table public.world_guard_inquiry_responses enable row level security;
alter table public.world_guard_inquiry_reviews enable row level security;
alter table public.world_guard_inquiry_history enable row level security;
revoke all on public.world_guard_inquiries,public.world_guard_inquiry_responses,
 public.world_guard_inquiry_reviews,public.world_guard_inquiry_history
 from public,anon,authenticated,service_role;
grant select on public.world_guard_inquiries,public.world_guard_inquiry_responses,
 public.world_guard_inquiry_reviews,public.world_guard_inquiry_history
 to authenticated,service_role;

-- Canonical effective current Chairperson with both real office authority
-- AND governed organization capability. A title in the browser is never proof.
create function private.world_current_guard_inquiry_chair(p_organization_id uuid,p_capability text)
returns uuid language sql stable security definer set search_path=pg_catalog
as $chair$
 select term.holder_person_id
 from public.world_office_terms term
 join public.world_organization_offices office on office.id=term.office_id
 join public.world_organizations org on org.id=office.organization_id
 where org.id=p_organization_id and org.slug='guard'
  and org.status in ('active','recognized')
  and office.slug='chairperson' and office.active
  and term.holder_user_id=auth.uid()
  and term.status='active' and term.started_at<=now()
  and term.actual_end_at is null
  and public.world_access_allowed(p_capability,p_organization_id,null,null,null,null)
 order by term.started_at desc limit 1
$chair$;
revoke all on function private.world_current_guard_inquiry_chair(uuid,text)
 from public,anon,authenticated,service_role;

create function public.world_guard_inquiry_can_open_v1(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $can$
 select coalesce(private.world_current_guard_inquiry_chair(
  p_organization_id,'world.inquiry.open') is not null,false)
$can$;
revoke all on function public.world_guard_inquiry_can_open_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_guard_inquiry_can_open_v1(uuid)
 to authenticated,service_role;

create function public.world_guard_inquiry_can_review_v1(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $canreview$
 select coalesce(private.world_current_guard_inquiry_chair(
  p_organization_id,'world.inquiry.review') is not null,false)
$canreview$;
revoke all on function public.world_guard_inquiry_can_review_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_guard_inquiry_can_review_v1(uuid)
 to authenticated,service_role;

create policy world_guard_inquiry_private_read on public.world_guard_inquiries
for select to authenticated using (
 exists (select 1 from public.country_accounts ca
  where ca.user_id=auth.uid() and ca.status='active'
   and ca.country_id=target_country_id)
 or public.world_guard_inquiry_can_review_v1(organization_id)
);
create policy world_guard_inquiry_responses_private_read on public.world_guard_inquiry_responses
for select to authenticated using (
 exists (select 1 from public.world_guard_inquiries i where i.id=inquiry_id)
);
create policy world_guard_inquiry_reviews_private_read on public.world_guard_inquiry_reviews
for select to authenticated using (
 exists (select 1 from public.world_guard_inquiries i where i.id=inquiry_id)
);
create policy world_guard_inquiry_history_private_read on public.world_guard_inquiry_history
for select to authenticated using (
 exists (select 1 from public.world_guard_inquiries i where i.id=inquiry_id)
);

-- New inquiry. Validates holder under a row lock after claiming an R2 operation.
create function public.world_open_guard_inquiry_v1(
 p_organization_id uuid,p_target_country_id uuid,p_allegation text,
 p_source_reference text,p_response_due_at timestamptz,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $open$
declare
 v_actor_person uuid;
 v_allegation text:=nullif(btrim(coalesce(p_allegation,'')),'');
 v_source text:=nullif(btrim(coalesce(p_source_reference,'')),'');
 v_claim jsonb;v_op uuid;v_id uuid;v_result jsonb;
begin
 if auth.uid() is null or private.world_current_guard_inquiry_chair(
  p_organization_id,'world.inquiry.open') is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_target_country_id is null or p_response_due_at is null
  or v_allegation is null or length(v_allegation) not between 20 and 8000
  or v_source is null or length(v_source) not between 10 and 500
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 if not exists (select 1 from public.countries c where c.id=p_target_country_id) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.inquiry.open','R2',
  jsonb_build_object('organizationId',p_organization_id,'countryId',p_target_country_id,
   'subjectType','world_guard_inquiry'),
  jsonb_build_object('targetCountryId',p_target_country_id,'allegation',v_allegation,
   'sourceReference',v_source,'responseDueAt',p_response_due_at)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 -- Only a NEW inquiry is required to have a future deadline; a replay of an
 -- already recorded inquiry must remain recoverable even after that deadline.
 if p_response_due_at <= now() then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select term.holder_person_id into v_actor_person
 from public.world_office_terms term
 join public.world_organization_offices office on office.id=term.office_id
 where office.organization_id=p_organization_id and office.slug='chairperson'
  and office.active and term.status='active' and term.started_at<=now()
  and term.actual_end_at is null and term.holder_user_id=auth.uid()
 for share of term;
 if v_actor_person is null or private.world_current_guard_inquiry_chair(
  p_organization_id,'world.inquiry.open') is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 insert into public.world_guard_inquiries(
  organization_id,target_country_id,allegation,source_reference,
  response_due_at,opened_by_user_id
 ) values(p_organization_id,p_target_country_id,v_allegation,v_source,
   p_response_due_at,auth.uid()) returning id into v_id;
 insert into public.world_guard_inquiry_history(
  inquiry_id,action,from_state,to_state,actor_user_id,operation_id,revision
 ) values(v_id,'opened',null,'awaiting_response',auth.uid(),v_op,1);
 perform private.v3_emit_domain_event(
  'world.guard_inquiry.opened','world_guard_inquiry',v_id::text,1,v_op,
  null,null,
  jsonb_build_object('inquiryId',v_id,'organizationId',p_organization_id,
   'targetCountryId',p_target_country_id,'revision',1),
  1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'inquiryId',v_id,
  'status','awaiting_response','revision',1,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $open$;

-- Late responses before the official review remain on record; no automatic
-- penalties or rights loss are inferred from deadline expiration.
create function public.world_respond_guard_inquiry_v1(
 p_inquiry_id uuid,p_response text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $respond$
declare
 v_inquiry public.world_guard_inquiries%rowtype;
 v_text text:=nullif(btrim(coalesce(p_response,'')),'');
 v_claim jsonb;v_op uuid;v_late boolean;v_result jsonb;
begin
 if auth.uid() is null or p_inquiry_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_text is null or length(v_text) not between 20 and 12000
  or p_expected_revision is null or p_expected_revision<1
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_inquiry from public.world_guard_inquiries where id=p_inquiry_id;
 if not found or not public.world_access_allowed(
  'world.inquiry.respond',v_inquiry.organization_id,v_inquiry.target_country_id,
  null,'guard_inquiry',p_inquiry_id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.inquiry.respond','R2',
  jsonb_build_object('organizationId',v_inquiry.organization_id,
   'countryId',v_inquiry.target_country_id,
   'subjectType','world_guard_inquiry','subjectId',p_inquiry_id),
  jsonb_build_object('inquiryId',p_inquiry_id,'response',v_text,
   'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_inquiry from public.world_guard_inquiries where id=p_inquiry_id for update;
 if v_inquiry.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 if v_inquiry.status<>'awaiting_response'
  or exists(select 1 from public.world_guard_inquiry_responses r where r.inquiry_id=p_inquiry_id) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 perform 1 from public.country_accounts ca
 where ca.country_id=v_inquiry.target_country_id and ca.user_id=auth.uid()
   and ca.status='active'
 for share;
 if not found or not public.world_access_allowed(
  'world.inquiry.respond',v_inquiry.organization_id,v_inquiry.target_country_id,
  null,'guard_inquiry',p_inquiry_id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_late:=now()>v_inquiry.response_due_at;
 insert into public.world_guard_inquiry_responses(
  inquiry_id,responding_country_id,response_text,was_late,
  submitted_by_user_id,case_revision,operation_id
 ) values(p_inquiry_id,v_inquiry.target_country_id,v_text,
  v_late,auth.uid(),v_inquiry.revision+1,v_op);
 update public.world_guard_inquiries
  set status='response_received',revision=revision+1,updated_at=now()
 where id=p_inquiry_id;
 insert into public.world_guard_inquiry_history(
  inquiry_id,action,from_state,to_state,actor_user_id,operation_id,revision
 ) values(p_inquiry_id,'responded',v_inquiry.status,'response_received',
  auth.uid(),v_op,v_inquiry.revision+1);
 perform private.v3_emit_domain_event(
  'world.guard_inquiry.responded','world_guard_inquiry',p_inquiry_id::text,
  v_inquiry.revision+1,v_op,null,null,
  jsonb_build_object('inquiryId',p_inquiry_id,'organizationId',v_inquiry.organization_id,
   'targetCountryId',v_inquiry.target_country_id,'wasLate',v_late,
   'revision',v_inquiry.revision+1),1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'inquiryId',p_inquiry_id,
  'status','response_received','wasLate',v_late,
  'revision',v_inquiry.revision+1,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $respond$;

-- Reviewing an unanswered case is allowed only AFTER its response deadline.
-- Review can propose but can NEVER execute a sanction or change membership.
create function public.world_review_guard_inquiry_v1(
 p_inquiry_id uuid,p_decision_kind text,p_proposed_action text,
 p_findings text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $review$
declare
 v_inquiry public.world_guard_inquiries%rowtype;
 v_person uuid;v_findings text:=nullif(btrim(coalesce(p_findings,'')),'');
 v_claim jsonb;v_op uuid;v_result jsonb;
begin
 if auth.uid() is null or p_inquiry_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_decision_kind is null or p_decision_kind not in ('no_action','recommend_action')
  or (p_decision_kind='no_action' and p_proposed_action is not null)
  or (p_decision_kind='recommend_action' and (
    p_proposed_action is null or p_proposed_action not in (
      'warning','censure','voting_suspension','assistance_freeze'
    )))
  or v_findings is null or length(v_findings) not between 20 and 8000
  or p_expected_revision is null or p_expected_revision<1
  or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_inquiry from public.world_guard_inquiries where id=p_inquiry_id;
 if not found or private.world_current_guard_inquiry_chair(
   v_inquiry.organization_id,'world.inquiry.review') is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.inquiry.review','R2',
  jsonb_build_object('organizationId',v_inquiry.organization_id,
   'subjectType','world_guard_inquiry','subjectId',p_inquiry_id),
  jsonb_build_object('inquiryId',p_inquiry_id,'decisionKind',p_decision_kind,
   'proposedAction',p_proposed_action,'findings',v_findings,
   'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_inquiry from public.world_guard_inquiries where id=p_inquiry_id for update;
 if v_inquiry.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 if v_inquiry.status not in ('awaiting_response','response_received')
  or (v_inquiry.status='awaiting_response' and now()<v_inquiry.response_due_at) then
  raise exception using errcode='23514',message='RESPONSE_WINDOW_OPEN';
 end if;
 select term.holder_person_id into v_person
 from public.world_office_terms term
 join public.world_organization_offices office on office.id=term.office_id
 where office.organization_id=v_inquiry.organization_id and office.slug='chairperson'
  and office.active and term.status='active' and term.started_at<=now()
  and term.actual_end_at is null and term.holder_user_id=auth.uid()
 for share of term;
 if v_person is null or private.world_current_guard_inquiry_chair(
  v_inquiry.organization_id,'world.inquiry.review') is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 insert into public.world_guard_inquiry_reviews(
  inquiry_id,decision_kind,proposed_action,findings,
  reviewed_by_user_id,chair_person_id,case_revision,operation_id
 ) values(p_inquiry_id,p_decision_kind,p_proposed_action,v_findings,
  auth.uid(),v_person,v_inquiry.revision+1,v_op);
 update public.world_guard_inquiries set status='reviewed',
  revision=revision+1,updated_at=now() where id=p_inquiry_id;
 insert into public.world_guard_inquiry_history(
  inquiry_id,action,from_state,to_state,actor_user_id,operation_id,revision
 ) values(p_inquiry_id,'reviewed',v_inquiry.status,'reviewed',
  auth.uid(),v_op,v_inquiry.revision+1);
 perform private.v3_emit_domain_event(
  'world.guard_inquiry.reviewed','world_guard_inquiry',p_inquiry_id::text,
  v_inquiry.revision+1,v_op,null,null,
  jsonb_build_object('inquiryId',p_inquiry_id,'organizationId',v_inquiry.organization_id,
   'targetCountryId',v_inquiry.target_country_id,'revision',v_inquiry.revision+1),
  1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'inquiryId',p_inquiry_id,
  'status','reviewed','revision',v_inquiry.revision+1,'operationId',v_op,
  'recommendationOnly',true);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $review$;

revoke all on function public.world_guard_inquiry_can_open_v1(uuid)
 from public,anon;
revoke all on function public.world_open_guard_inquiry_v1(uuid,uuid,text,text,timestamptz,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_respond_guard_inquiry_v1(uuid,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_review_guard_inquiry_v1(uuid,text,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.world_open_guard_inquiry_v1(uuid,uuid,text,text,timestamptz,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_respond_guard_inquiry_v1(uuid,text,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_review_guard_inquiry_v1(uuid,text,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;

notify pgrst,'reload schema';
commit;
