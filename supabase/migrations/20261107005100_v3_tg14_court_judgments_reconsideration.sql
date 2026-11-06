begin;
-- TG14 continuation: Court proceedings, SG-issued immutable judgments and
-- limited party reconsideration. Requires TG14 filing migration 20261107005000.
do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg14.judgment-reconsideration',1,'forward_fix_only',false,null,
   'Immutable Secretary-General Court judgments with preserved reconsideration history, procedural state and official publication.'
  );
 end if;
end $contract$;

create table public.world_court_proceeding_actions (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 from_state text not null, to_state text not null,
 reason text not null,
 actor_user_id uuid not null,
 operation_id uuid not null unique,
 case_revision bigint not null,
 recorded_at timestamptz not null default now(),
 unique(case_id,case_revision),
 constraint court_action_reason_check check (length(btrim(reason)) between 10 and 3000)
);

create table public.world_court_judgments (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 judgment_number integer not null,
 kind text not null,
 prior_judgment_id uuid references public.world_court_judgments(id) on delete restrict,
 findings text not null, reasoning text not null,
 orders text not null, remedies text not null,
 related_filing_ids uuid[] not null default '{}'::uuid[],
 judge_person_id uuid not null references public.delegation_people(id) on delete restrict,
 issued_by_user_id uuid not null,
 publicly_listed boolean not null default false,
 published_at timestamptz not null default now(),
 operation_id uuid not null unique,
 case_revision bigint not null,
 unique(case_id,judgment_number),
 unique(case_id,case_revision),
 constraint court_judgment_number_positive check (judgment_number > 0),
 constraint court_judgment_kind_check check(kind in ('original','revised')),
 constraint court_judgment_kind_link_check check (
   (kind='original' and judgment_number=1 and prior_judgment_id is null)
   or (kind='revised' and judgment_number>1 and prior_judgment_id is not null)
 ),
 constraint court_judgment_text_length check (
   length(btrim(findings)) between 20 and 12000
   and length(btrim(reasoning)) between 20 and 20000
   and length(btrim(orders)) between 10 and 12000
   and length(btrim(remedies)) between 10 and 12000
 ),
 constraint court_judgment_filing_limit check (cardinality(related_filing_ids) <= 100)
);
create unique index world_court_original_judgment_uidx on public.world_court_judgments(case_id)
 where kind='original';
create index world_court_judgments_published_idx
 on public.world_court_judgments(case_id,published_at desc);

create table public.world_court_reconsiderations (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 judgment_id uuid not null references public.world_court_judgments(id) on delete restrict,
 party_country_id uuid not null references public.countries(id) on delete restrict,
 grounds text not null,
 filed_by_user_id uuid not null,
 filed_at timestamptz not null default now(),
 operation_id uuid not null unique,
 case_revision bigint not null,
 unique(judgment_id,party_country_id),
 unique(case_id,case_revision),
 constraint court_reconsideration_grounds_length check (length(btrim(grounds)) between 30 and 12000)
);

create table public.world_court_reconsideration_decisions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.world_court_reconsiderations(id) on delete restrict,
 case_id uuid not null references public.world_court_cases(id) on delete restrict,
 decision text not null check(decision in ('accepted','rejected')),
 reason text not null check(length(btrim(reason)) between 10 and 12000),
 judge_person_id uuid not null references public.delegation_people(id) on delete restrict,
 issued_by_user_id uuid not null,
 decided_at timestamptz not null default now(),
 operation_id uuid not null unique,
 case_revision bigint not null,
 unique(case_id,case_revision)
);

-- No retroactive edit, delete or judicial rewrite, even by service_role.
create function private.world_court_published_record_immutable()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
 raise exception using errcode='42501',message='IMMUTABLE_COURT_RECORD';
end $immutable$;
revoke all on function private.world_court_published_record_immutable()
 from public,anon,authenticated,service_role;
create trigger world_court_proceeding_actions_immutable
 before update or delete on public.world_court_proceeding_actions
 for each row execute function private.world_court_published_record_immutable();
create trigger world_court_judgments_immutable
 before update or delete on public.world_court_judgments
 for each row execute function private.world_court_published_record_immutable();
create trigger world_court_reconsiderations_immutable
 before update or delete on public.world_court_reconsiderations
 for each row execute function private.world_court_published_record_immutable();
create trigger world_court_reconsideration_decisions_immutable
 before update or delete on public.world_court_reconsideration_decisions
 for each row execute function private.world_court_published_record_immutable();

alter table public.world_court_proceeding_actions enable row level security;
alter table public.world_court_judgments enable row level security;
alter table public.world_court_reconsiderations enable row level security;
alter table public.world_court_reconsideration_decisions enable row level security;
revoke all on public.world_court_proceeding_actions,public.world_court_judgments,
 public.world_court_reconsiderations,public.world_court_reconsideration_decisions
 from public,anon,authenticated,service_role;
grant select on public.world_court_proceeding_actions,public.world_court_judgments,
 public.world_court_reconsiderations,public.world_court_reconsideration_decisions
 to authenticated,service_role;

create policy world_court_proceeding_actions_private
on public.world_court_proceeding_actions for select to authenticated
using (exists(select 1 from public.world_court_cases c where c.id=case_id));
create policy world_court_judgments_private
on public.world_court_judgments for select to authenticated
using (exists(select 1 from public.world_court_cases c where c.id=case_id));
create policy world_court_reconsiderations_private
on public.world_court_reconsiderations for select to authenticated
using (exists(select 1 from public.world_court_cases c where c.id=case_id));
create policy world_court_reconsideration_decisions_private
on public.world_court_reconsideration_decisions for select to authenticated
using (exists(select 1 from public.world_court_cases c where c.id=case_id));

-- Only the ACTIVE/effective UNITY Secretary-General holding the canonical
-- office term may rule. A bare scope grant / moderator flag cannot mint a judge.
create function private.world_current_court_judge_person(p_organization_id uuid)
returns uuid language sql stable security definer set search_path=pg_catalog
as $judge$
 select term.holder_person_id
 from public.world_office_terms term
 join public.world_organization_offices office on office.id=term.office_id
 join public.world_organizations org on org.id=office.organization_id
 where org.id=p_organization_id and org.slug='unity'
  and office.slug='secretary-general' and office.active
  and term.status='active' and term.started_at <= now()
  and term.actual_end_at is null and term.holder_user_id=auth.uid()
  and public.world_access_allowed('world.court.judge',p_organization_id,null,null,null,null)
 order by term.started_at desc limit 1
$judge$;
revoke all on function private.world_current_court_judge_person(uuid)
 from public,anon,authenticated,service_role;

create function public.world_court_judge_eligible_v1(p_case_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $eligible$
 select coalesce(exists (
  select 1 from public.world_court_cases c
  where c.id=p_case_id
   and private.world_current_court_judge_person(c.organization_id) is not null
 ),false)
$eligible$;
revoke all on function public.world_court_judge_eligible_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_court_judge_eligible_v1(uuid)
 to authenticated,service_role;

-- Public reader returns official published judgment text ONLY from an explicitly
-- listed public docket. It never returns private filings, judge login or evidence.
create function public.world_court_public_judgments_v1(p_case_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $public_judgments$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',j.id,'caseId',j.case_id,'judgmentNumber',j.judgment_number,
   'kind',j.kind,'findings',j.findings,'reasoning',j.reasoning,
   'orders',j.orders,'remedies',j.remedies,'publishedAt',j.published_at
 ) order by j.judgment_number asc),'[]'::jsonb)
 from public.world_court_judgments j
 join public.world_court_cases c on c.id=j.case_id
 join public.world_organizations o on o.id=c.organization_id
 where j.case_id=p_case_id and j.publicly_listed=true
  and c.public_metadata @> '{"listed":true}'::jsonb
  and o.slug='unity' and o.public_visibility='public'
  and o.status in ('active','recognized')
  and public.studio2_feature_enabled('terra_world_public',null) is true
$public_judgments$;
revoke all on function public.world_court_public_judgments_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_court_public_judgments_v1(uuid)
 to anon,authenticated,service_role;

-- Official procedural state transitions. Never invent "decided" without a
-- Secretary-General's separately published judgment.
create function public.world_advance_court_case_v1(
 p_case_id uuid,p_target_state text,p_reason text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $advance$
declare
 v_case public.world_court_cases%rowtype;
 v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
 v_claim jsonb;v_op uuid;v_result jsonb;
begin
 if auth.uid() is null or p_case_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_reason is null or length(v_reason) not between 10 and 3000
   or p_expected_revision is null or p_expected_revision<1
   or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
   or p_target_state not in ('preliminary_review','response_pending','proceedings','hearing',
    'judgment_pending','closed','archived') then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id;
 if not found or not public.world_access_allowed('world.court.manage',
  v_case.organization_id,null,null,'court',v_case.id) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.advance','R2',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',p_case_id),
  jsonb_build_object('caseId',p_case_id,'targetState',p_target_state,
   'reason',v_reason,'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id for update;
 if v_case.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 if not public.world_access_allowed('world.court.manage',
   v_case.organization_id,null,null,'court',v_case.id)
   or (p_target_state in ('closed','archived')
     and private.world_current_court_judge_person(v_case.organization_id) is null) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if not (
   (v_case.status='filed' and p_target_state='preliminary_review')
   or (v_case.status='preliminary_review' and p_target_state in ('response_pending','proceedings'))
   or (v_case.status='response_pending' and p_target_state='proceedings')
   or (v_case.status='proceedings' and p_target_state in ('hearing','judgment_pending'))
   or (v_case.status='hearing' and p_target_state in ('proceedings','judgment_pending'))
   or (v_case.status='judgment_pending' and p_target_state='proceedings')
   or (v_case.status='decided' and p_target_state='closed')
   or (v_case.status='closed' and p_target_state='archived')
 ) then
  raise exception using errcode='23514',message='INVALID_TRANSITION';
 end if;
 if p_target_state in ('closed','archived') and exists (
   select 1 from public.world_court_reconsiderations r
   where r.case_id=p_case_id
    and not exists(select 1 from public.world_court_reconsideration_decisions d where d.request_id=r.id)
 ) then
  raise exception using errcode='23514',message='RECONSIDERATION_PENDING';
 end if;
 update public.world_court_cases
  set status=p_target_state,revision=revision+1,updated_at=now()
  where id=p_case_id;
 insert into public.world_court_proceeding_actions(
  case_id,from_state,to_state,reason,actor_user_id,operation_id,case_revision
 ) values(p_case_id,v_case.status,p_target_state,v_reason,auth.uid(),v_op,v_case.revision+1);
 perform private.v3_emit_domain_event(
  'world.court.procedure_changed','world_court_case',p_case_id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',p_case_id,'status',p_target_state,
    'revision',v_case.revision+1),1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',p_case_id,'identifier',v_case.identifier,
  'status',p_target_state,'revision',v_case.revision+1,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $advance$;

create function public.world_issue_court_judgment_v1(
 p_case_id uuid,p_findings text,p_reasoning text,p_orders text,p_remedies text,
 p_publicly_listed boolean,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $issue$
declare
 v_case public.world_court_cases%rowtype;
 v_previous public.world_court_judgments%rowtype;
 v_person uuid;v_id uuid;v_number integer;
 v_claim jsonb;v_op uuid;v_result jsonb;
 v_findings text:=nullif(btrim(coalesce(p_findings,'')),'');
 v_reasoning text:=nullif(btrim(coalesce(p_reasoning,'')),'');
 v_orders text:=nullif(btrim(coalesce(p_orders,'')),'');
 v_remedies text:=nullif(btrim(coalesce(p_remedies,'')),'');
begin
 if auth.uid() is null or p_case_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_expected_revision is null or p_expected_revision<1
   or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
   or v_findings is null or length(v_findings) not between 20 and 12000
   or v_reasoning is null or length(v_reasoning) not between 20 and 20000
   or v_orders is null or length(v_orders) not between 10 and 12000
   or v_remedies is null or length(v_remedies) not between 10 and 12000
   or p_publicly_listed is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id;
 if not found or private.world_current_court_judge_person(v_case.organization_id) is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.judgment.publish','R3',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',p_case_id),
  jsonb_build_object('caseId',p_case_id,'findings',v_findings,'reasoning',v_reasoning,
   'orders',v_orders,'remedies',v_remedies,'publiclyListed',p_publicly_listed,
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
 -- Exact SG link: office title cannot be spoofed by ordinary scope grants.
 select t.holder_person_id into v_person
 from public.world_office_terms t
 join public.world_organization_offices office on office.id=t.office_id
 join public.world_organizations org on org.id=office.organization_id
 where org.id=v_case.organization_id and org.slug='unity'
  and office.slug='secretary-general' and office.active
  and t.holder_user_id=auth.uid() and t.status='active'
  and t.started_at<=now() and t.actual_end_at is null
 for share;
 if v_person is null or not public.world_access_allowed('world.court.judge',
   v_case.organization_id,null,null,null,null) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 select * into v_previous from public.world_court_judgments j
 where j.case_id=p_case_id order by j.judgment_number desc limit 1;
 if not (
   (v_case.status='judgment_pending' and v_previous.id is null)
   or (v_case.status='reconsideration' and v_previous.id is not null
    and exists (
     select 1 from public.world_court_reconsiderations r
     join public.world_court_reconsideration_decisions d on d.request_id=r.id
     where r.case_id=p_case_id and r.judgment_id=v_previous.id
       and d.decision='accepted'
    ) and not exists (
     select 1 from public.world_court_reconsiderations pending
     where pending.case_id=p_case_id and pending.judgment_id=v_previous.id
      and not exists (select 1 from public.world_court_reconsideration_decisions decided
       where decided.request_id=pending.id)
    ))
 ) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 v_number:=coalesce(v_previous.judgment_number,0)+1;
 insert into public.world_court_judgments(
  case_id,judgment_number,kind,prior_judgment_id,
  findings,reasoning,orders,remedies,related_filing_ids,judge_person_id,
  issued_by_user_id,publicly_listed,operation_id,case_revision
 ) values (
  p_case_id,v_number,case when v_number=1 then 'original' else 'revised' end,
  v_previous.id,v_findings,v_reasoning,v_orders,v_remedies,
  array(select f.id from public.world_court_filings f where f.case_id=p_case_id
   order by f.case_revision limit 100),
  v_person,auth.uid(),p_publicly_listed,v_op,v_case.revision+1
 ) returning id into v_id;
 update public.world_court_cases
 set status='decided',revision=revision+1,updated_at=now(),
  public_metadata=case when p_publicly_listed
   then jsonb_set(public_metadata,'{listed}','true'::jsonb,true)
   else public_metadata end
 where id=p_case_id;
 perform private.v3_emit_domain_event(
  'world.court.judgment_published','world_court_case',p_case_id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',p_case_id,'judgmentId',v_id,
   'judgmentNumber',v_number,'publiclyListed',p_publicly_listed,
   'revision',v_case.revision+1),1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',p_case_id,'identifier',v_case.identifier,
  'judgmentId',v_id,'judgmentNumber',v_number,'status','decided',
  'revision',v_case.revision+1,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $issue$;

create function public.world_request_court_reconsideration_v1(
 p_case_id uuid,p_judgment_id uuid,p_grounds text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $reconsider$
declare
 v_case public.world_court_cases%rowtype;
 v_judgment public.world_court_judgments%rowtype;
 v_country uuid;v_grounds text:=nullif(btrim(coalesce(p_grounds,'')),'');
 v_claim jsonb;v_op uuid;v_id uuid;v_result jsonb;
begin
 if auth.uid() is null or p_case_id is null or p_judgment_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_grounds is null or length(v_grounds) not between 30 and 12000
  or p_expected_revision is null or p_expected_revision<1 or p_operation_id is null
  or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id;
 if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 select ca.country_id into v_country from public.country_accounts ca
 where ca.user_id=auth.uid() and ca.status='active'
  and ca.country_id in (v_case.applicant_country_id,v_case.respondent_country_id);
 if v_country is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.reconsideration.request','R2',
  jsonb_build_object('organizationId',v_case.organization_id,
   'countryId',v_country,'subjectType','world_court_case','subjectId',p_case_id),
  jsonb_build_object('caseId',p_case_id,'judgmentId',p_judgment_id,
   'grounds',v_grounds,'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=p_case_id for update;
 if v_case.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 perform 1 from public.country_accounts ca
 where ca.user_id=auth.uid() and ca.status='active' and ca.country_id=v_country
 for share;
 if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 if v_case.status not in ('decided','reconsideration_requested')
    or not exists (
      select 1 from public.world_court_judgments j
      where j.id=p_judgment_id and j.case_id=p_case_id
       and j.judgment_number=(
        select max(latest.judgment_number) from public.world_court_judgments latest
        where latest.case_id=p_case_id
       )
    ) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 insert into public.world_court_reconsiderations(
  case_id,judgment_id,party_country_id,grounds,filed_by_user_id,
  operation_id,case_revision
 ) values(p_case_id,p_judgment_id,v_country,v_grounds,auth.uid(),
  v_op,v_case.revision+1) returning id into v_id;
 insert into public.world_court_filings(
   case_id,party_country_id,filing_type,body,filed_by_user_id,operation_id,case_revision
 ) values (
   p_case_id,v_country,'reconsideration_request',v_grounds,auth.uid(),v_op,v_case.revision+1
 );
 update public.world_court_cases
 set status='reconsideration_requested',revision=revision+1,updated_at=now()
 where id=p_case_id;
 perform private.v3_emit_domain_event(
  'world.court.reconsideration_requested','world_court_case',p_case_id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',p_case_id,'requestId',v_id,
   'judgmentId',p_judgment_id,'revision',v_case.revision+1),1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',p_case_id,
  'identifier',v_case.identifier,'requestId',v_id,'status','reconsideration_requested',
  'revision',v_case.revision+1,'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $reconsider$;

create function public.world_decide_court_reconsideration_v1(
 p_request_id uuid,p_decision text,p_reason text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $decision$
declare
 v_request public.world_court_reconsiderations%rowtype;
 v_case public.world_court_cases%rowtype;
 v_person uuid;v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
 v_claim jsonb;v_op uuid;v_result jsonb;v_status text;
begin
 if auth.uid() is null or p_request_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_decision is null or p_decision not in ('accepted','rejected')
  or v_reason is null or length(v_reason) not between 10 and 12000
  or p_expected_revision is null or p_expected_revision<1 or p_operation_id is null
  or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select * into v_request from public.world_court_reconsiderations where id=p_request_id;
 if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 select * into v_case from public.world_court_cases where id=v_request.case_id;
 if not found or private.world_current_court_judge_person(v_case.organization_id) is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 v_claim:=private.studio2_claim_operation(
  p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
  'world.court.reconsideration.decide','R3',
  jsonb_build_object('organizationId',v_case.organization_id,
   'subjectType','world_court_case','subjectId',v_case.id),
  jsonb_build_object('requestId',p_request_id,'decision',p_decision,
   'reason',v_reason,'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
  return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 select * into v_case from public.world_court_cases where id=v_request.case_id for update;
 if v_case.revision is distinct from p_expected_revision then
  raise exception using errcode='40001',message='VERSION_CONFLICT';
 end if;
 select t.holder_person_id into v_person
 from public.world_office_terms t
 join public.world_organization_offices office on office.id=t.office_id
 join public.world_organizations org on org.id=office.organization_id
 where org.id=v_case.organization_id and org.slug='unity'
  and office.slug='secretary-general' and office.active
  and t.holder_user_id=auth.uid() and t.status='active'
  and t.started_at<=now() and t.actual_end_at is null
 for share;
 if v_person is null or not public.world_access_allowed(
  'world.court.judge',v_case.organization_id,null,null,null,null) then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if v_case.status not in ('reconsideration_requested','reconsideration')
  or exists(select 1 from public.world_court_reconsideration_decisions d
    where d.request_id=p_request_id)
  or not exists(select 1 from public.world_court_judgments j
    where j.id=v_request.judgment_id and j.case_id=v_case.id) then
  raise exception using errcode='23514',message='STATE_CHANGED';
 end if;
 insert into public.world_court_reconsideration_decisions(
  request_id,case_id,decision,reason,judge_person_id,issued_by_user_id,
  operation_id,case_revision
 ) values(p_request_id,v_case.id,p_decision,v_reason,v_person,auth.uid(),
  v_op,v_case.revision+1);
 if p_decision='accepted' or v_case.status='reconsideration' then
  v_status:='reconsideration';
 elsif exists(
  select 1 from public.world_court_reconsiderations r
  where r.case_id=v_case.id and r.id<>p_request_id
   and not exists(select 1 from public.world_court_reconsideration_decisions d
    where d.request_id=r.id)
 ) then
  v_status:='reconsideration_requested';
 else
  v_status:='decided';
 end if;
 update public.world_court_cases
 set status=v_status,revision=revision+1,updated_at=now()
 where id=v_case.id;
 perform private.v3_emit_domain_event(
  'world.court.reconsideration_decided','world_court_case',v_case.id::text,
  v_case.revision+1,v_op,null,null,
  jsonb_build_object('caseId',v_case.id,'requestId',p_request_id,
   'decision',p_decision,'revision',v_case.revision+1),1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'caseId',v_case.id,'identifier',v_case.identifier,
  'requestId',p_request_id,'status',v_status,'revision',v_case.revision+1,
  'operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end $decision$;

revoke all on function public.world_advance_court_case_v1(uuid,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_issue_court_judgment_v1(uuid,text,text,text,text,boolean,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_request_court_reconsideration_v1(uuid,uuid,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.world_decide_court_reconsideration_v1(uuid,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.world_advance_court_case_v1(uuid,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_issue_court_judgment_v1(uuid,text,text,text,text,boolean,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_request_court_reconsideration_v1(uuid,uuid,text,bigint,uuid,text,uuid)
 to authenticated,service_role;
grant execute on function public.world_decide_court_reconsideration_v1(uuid,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;


-- Harden the inherited public docket when World public rollout is disabled;
-- public listed metadata alone is not a deployed rollout authorization.
create or replace function public.world_court_public_docket_v1(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $court_docket$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',listed.id,'identifier',listed.identifier,
   'applicantCountryId',listed.applicant_country_id,
   'respondentCountryId',listed.respondent_country_id,
   'status',listed.status,'filedAt',listed.filed_at
 ) order by listed.filed_at desc),'[]'::jsonb)
 from (
  select c.id,c.identifier,c.applicant_country_id,c.respondent_country_id,
   c.status,c.filed_at
  from public.world_court_cases c
  join public.world_organizations o on o.id=c.organization_id
  where o.slug='unity' and o.public_visibility='public'
   and o.status in ('active','recognized')
   and c.public_metadata @> '{"listed":true}'::jsonb
   and public.studio2_feature_enabled('terra_world_public',null) is true
  order by c.filed_at desc,c.id
  limit least(greatest(coalesce(p_limit,20),1),50)
 ) listed
$court_docket$;
revoke all on function public.world_court_public_docket_v1(integer)
 from public,anon,authenticated;
grant execute on function public.world_court_public_docket_v1(integer)
 to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
