begin;

-- TG13 Ethics Committee: private cases and explicit configurable membership.
-- UNITY Charter does not yet determine committee appointment size/procedure:
-- this migration seeds NO members and grants NO automatic appointment rights.
do $migration$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg13.ethics-case-intake',1,'forward_fix_only',false,null,
      'Private Ethics Committee intake, durable evidence and explicit roster, refusing assignment to an empty unconfigured committee.'
    );
  end if;
end $migration$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.ethics.case.file','world','File private ethics case','Submit an ethics allegation for a currently controlled Terra Solaris country.','operate'),
  ('world.ethics.case.manage','world','Manage ethics cases','Review and assign cases in explicit UNITY Ethics scope.','approve'),
  ('world.ethics.member.configure','world','Configure Ethics Committee roster','Explicit Charter-authorized committee member appointment.','administer'),
  ('world.ethics.evidence.append','world','Append Ethics evidence','Submit immutable private case evidence if party or authorized reviewer.','operate'),
  ('world.ethics.findings.record','world','Record Ethics findings','Record committee findings without automatically imposing sanctions.','approve')
on conflict(key) do nothing;
insert into public.world_country_controller_capabilities(capability)
values ('world.ethics.case.file')
on conflict do nothing;

create table public.world_ethics_committee_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid not null references public.world_organization_organs(id) on delete restrict,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  user_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  appointment_reference text not null,
  appointed_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_ethics_membership_duration check(ended_at is null or ended_at > started_at),
  constraint world_ethics_membership_ref check(length(btrim(appointment_reference)) between 10 and 500),
  constraint world_ethics_membership_revision check(revision >= 1)
);
create unique index world_ethics_committee_one_active_member_uidx
  on public.world_ethics_committee_memberships(organ_id,person_id) where ended_at is null;
create index world_ethics_committee_actor_idx
  on public.world_ethics_committee_memberships(user_id,organ_id,ended_at);

create table public.world_ethics_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid not null references public.world_organization_organs(id) on delete restrict,
  reporting_country_id uuid not null references public.countries(id) on delete restrict,
  subject_country_id uuid references public.countries(id) on delete restrict,
  subject_person_id uuid references public.delegation_people(id) on delete restrict,
  allegation text not null,
  status text not null default 'filed',
  visibility text not null default 'private',
  filed_by_user_id uuid not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  concluded_at timestamptz,
  revision bigint not null default 1,
  constraint world_ethics_subject_present check(subject_country_id is not null or subject_person_id is not null),
  constraint world_ethics_allegation_check check(length(btrim(allegation)) between 20 and 10000),
  constraint world_ethics_status_check check(
    status in ('filed','assigned','under_review','findings_prepared','concluded','archived')
  ),
  constraint world_ethics_visibility_check check(visibility in ('private','public')),
  constraint world_ethics_revision_check check(revision >= 1)
);
create index world_ethics_cases_org_idx on public.world_ethics_cases(organization_id,status,opened_at desc);
create index world_ethics_cases_reporter_idx on public.world_ethics_cases(reporting_country_id,opened_at desc);

create table public.world_ethics_case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_ethics_cases(id) on delete restrict,
  member_id uuid not null references public.world_ethics_committee_memberships(id) on delete restrict,
  assigned_by_user_id uuid not null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  operation_id uuid not null unique,
  unique(case_id,member_id),
  constraint world_ethics_assignment_duration check(ended_at is null or ended_at >= assigned_at)
);
create unique index world_ethics_assignment_one_active_uidx
  on public.world_ethics_case_assignments(case_id) where ended_at is null;

create table public.world_ethics_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_ethics_cases(id) on delete restrict,
  evidence_type text not null default 'statement',
  statement_text text not null,
  recorded_by_user_id uuid not null,
  operation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint world_ethics_evidence_type_check check(evidence_type='statement'),
  constraint world_ethics_evidence_body_check check(length(btrim(statement_text)) between 20 and 12000)
);
create index world_ethics_evidence_case_idx on public.world_ethics_case_evidence(case_id,created_at);

create table public.world_ethics_case_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_ethics_cases(id) on delete restrict,
  action text not null,
  from_state text,
  to_state text not null,
  subject_person_id uuid references public.delegation_people(id) on delete restrict,
  actor_user_id uuid not null,
  operation_id uuid not null unique,
  revision bigint not null,
  recorded_at timestamptz not null default now(),
  unique(case_id,revision),
  constraint world_ethics_case_history_revision check(revision >= 1)
);

create function private.world_ethics_evidence_immutable()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
  raise exception using errcode='42501',message='IMMUTABLE_ETHICS_RECORD';
end $immutable$;
revoke all on function private.world_ethics_evidence_immutable()
from public,anon,authenticated,service_role;
create trigger world_ethics_evidence_no_rewrite
before update or delete on public.world_ethics_case_evidence
for each row execute function private.world_ethics_evidence_immutable();
create trigger world_ethics_history_no_rewrite
before update or delete on public.world_ethics_case_history
for each row execute function private.world_ethics_evidence_immutable();

alter table public.world_ethics_committee_memberships enable row level security;
alter table public.world_ethics_cases enable row level security;
alter table public.world_ethics_case_assignments enable row level security;
alter table public.world_ethics_case_evidence enable row level security;
alter table public.world_ethics_case_history enable row level security;

revoke all on public.world_ethics_committee_memberships,public.world_ethics_cases,
public.world_ethics_case_assignments,public.world_ethics_case_evidence,
public.world_ethics_case_history from public,anon,authenticated,service_role;
grant select on public.world_ethics_committee_memberships,public.world_ethics_cases,
public.world_ethics_case_assignments,public.world_ethics_case_evidence,
public.world_ethics_case_history to authenticated,service_role;

-- Definer helper avoids RLS recursion among member, case, assignment and evidence.
create function private.world_ethics_can_read_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $read$
  select coalesce(auth.uid() is not null and exists (
    select 1 from public.world_ethics_cases c where c.id=p_case_id
    and (
      exists(select 1 from public.country_accounts ca
        where ca.user_id=auth.uid() and ca.status='active'
          and ca.country_id=c.reporting_country_id)
      or exists (
        select 1 from public.world_ethics_case_assignments a
        join public.world_ethics_committee_memberships m on m.id=a.member_id
        where a.case_id=c.id and a.ended_at is null
          and m.ended_at is null and m.started_at <= now()
          and m.user_id=auth.uid()
      )
      or public.world_access_allowed(
        'world.ethics.case.manage',c.organization_id,null,c.organ_id,'ethics',c.id
      )
    )
  ),false)
$read$;
revoke all on function private.world_ethics_can_read_case(uuid)
from public,anon,authenticated;
grant execute on function private.world_ethics_can_read_case(uuid)
to authenticated,service_role;

create policy world_ethics_cases_private_read
on public.world_ethics_cases for select to authenticated
using(private.world_ethics_can_read_case(id));
create policy world_ethics_evidence_private_read
on public.world_ethics_case_evidence for select to authenticated
using(private.world_ethics_can_read_case(case_id));
create policy world_ethics_history_private_read
on public.world_ethics_case_history for select to authenticated
using(private.world_ethics_can_read_case(case_id));
create policy world_ethics_assignments_private_read
on public.world_ethics_case_assignments for select to authenticated
using(private.world_ethics_can_read_case(case_id));
create policy world_ethics_roster_scoped_read
on public.world_ethics_committee_memberships for select to authenticated
using(
  user_id=auth.uid()
  or public.world_access_allowed(
    'world.ethics.case.manage',organization_id,null,organ_id,null,null
  )
  or public.world_access_allowed(
    'world.ethics.member.configure',organization_id,null,organ_id,null,null
  )
);

create function public.world_file_ethics_case_v1(
  p_organization_id uuid,
  p_reporting_country_id uuid,
  p_subject_country_id uuid,
  p_subject_person_id uuid,
  p_allegation text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $file$
declare
  v_organ_id uuid;
  v_body text := nullif(btrim(coalesce(p_allegation,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_case_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or not public.world_access_allowed(
    'world.ethics.case.file',p_organization_id,p_reporting_country_id,
    null,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_reporting_country_id is null or p_organization_id is null
    or (p_subject_country_id is null and p_subject_person_id is null)
    or v_body is null or length(v_body) not between 20 and 10000
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select organ.id into v_organ_id
  from public.world_organization_organs organ
  join public.world_organizations o on o.id=organ.organization_id
  where o.id=p_organization_id and o.slug='unity'
    and o.status in ('active','recognized')
    and organ.slug='ethics-committee' and organ.status='active';
  if v_organ_id is null
    or (p_subject_country_id is not null and not exists (
      select 1 from public.countries where id=p_subject_country_id))
    or (p_subject_person_id is not null and not exists (
      select 1 from public.delegation_people where id=p_subject_person_id)) then
    raise exception using errcode='23514',message='ETHICS_UNAVAILABLE';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.ethics.case.file','R2',
    jsonb_build_object('organizationId',p_organization_id,
      'countryId',p_reporting_country_id,'organId',v_organ_id,'subjectType','world_ethics_case'),
    jsonb_build_object('reportingCountryId',p_reporting_country_id,
      'subjectCountryId',p_subject_country_id,'subjectPersonId',p_subject_person_id,
      'allegation',v_body)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  perform 1 from public.country_accounts ca
  where ca.user_id=auth.uid() and ca.country_id=p_reporting_country_id and ca.status='active'
  for share;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  insert into public.world_ethics_cases(
    organization_id,organ_id,reporting_country_id,subject_country_id,
    subject_person_id,allegation,filed_by_user_id
  ) values (
    p_organization_id,v_organ_id,p_reporting_country_id,p_subject_country_id,
    p_subject_person_id,v_body,auth.uid()
  ) returning id into v_case_id;
  insert into public.world_ethics_case_history(
    case_id,action,to_state,actor_user_id,operation_id,revision
  ) values(v_case_id,'filed','filed',auth.uid(),v_operation_id,1);
  perform private.v3_emit_domain_event(
    'world.ethics.case_filed','world_ethics_case',v_case_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('caseId',v_case_id,'organizationId',p_organization_id,
      'reportingCountryId',p_reporting_country_id,'revision',1),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'caseId',v_case_id,'state','filed',
    'revision',1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $file$;

-- Only a constitutionally explicitly scoped configure capability may install
-- a roster member. No implicit Secretary-General -> committee appointment rule.
create function public.world_configure_ethics_member_v1(
  p_organization_id uuid,
  p_person_id uuid,
  p_user_id uuid,
  p_appointment_reference text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $configure$
declare
  v_organ_id uuid;
  v_reference text := nullif(btrim(coalesce(p_appointment_reference,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_member_id uuid;
  v_receipt jsonb;
begin
  select organ.id into v_organ_id
  from public.world_organization_organs organ
  join public.world_organizations o on o.id=organ.organization_id
  where o.id=p_organization_id and o.slug='unity'
    and organ.slug='ethics-committee' and organ.status='active';
  if auth.uid() is null or v_organ_id is null or not public.world_access_allowed(
    'world.ethics.member.configure',p_organization_id,null,v_organ_id,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_person_id is null or v_reference is null or length(v_reference) not between 10 and 500
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
    or not exists(select 1 from public.delegation_people where id=p_person_id) then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.ethics.member.configure','R2',
    jsonb_build_object('organizationId',p_organization_id,'organId',v_organ_id,
      'subjectType','world_ethics_committee_member'),
    jsonb_build_object('personId',p_person_id,'userId',p_user_id,
      'appointmentReference',v_reference)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  insert into public.world_ethics_committee_memberships(
    organization_id,organ_id,person_id,user_id,appointment_reference,appointed_by_user_id
  ) values (
    p_organization_id,v_organ_id,p_person_id,p_user_id,v_reference,auth.uid()
  ) returning id into v_member_id;
  perform private.v3_emit_domain_event(
    'world.ethics.member_configured','world_ethics_member',v_member_id::text,
    1,v_operation_id,null,null,
    jsonb_build_object('memberId',v_member_id,'organizationId',p_organization_id,
      'organId',v_organ_id),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'memberId',v_member_id,
    'revision',1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $configure$;

create function public.world_assign_ethics_case_v1(
  p_case_id uuid,
  p_member_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $assign$
declare
  v_case public.world_ethics_cases%rowtype;
  v_member public.world_ethics_committee_memberships%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or p_case_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_member_id is null or p_expected_revision is null or p_expected_revision<1
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select * into v_case from public.world_ethics_cases where id=p_case_id;
  if not found or not public.world_access_allowed(
    'world.ethics.case.manage',v_case.organization_id,null,v_case.organ_id,'ethics',v_case.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.ethics.case.assign','R2',
    jsonb_build_object('organizationId',v_case.organization_id,'organId',v_case.organ_id,
      'subjectType','world_ethics_case','subjectId',p_case_id),
    jsonb_build_object('caseId',p_case_id,'memberId',p_member_id,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select * into v_case from public.world_ethics_cases where id=p_case_id for update;
  if v_case.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_case.status <> 'filed' then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;
  -- Nonempty active committee is an absolute invariant; never auto-create.
  if not exists(
    select 1 from public.world_ethics_committee_memberships committee
    where committee.organ_id=v_case.organ_id and committee.organization_id=v_case.organization_id
      and committee.started_at<=now() and committee.ended_at is null
  ) then
    raise exception using errcode='23514',message='COMMITTEE_NOT_CONFIGURED';
  end if;
  select * into v_member from public.world_ethics_committee_memberships committee
  where committee.id=p_member_id and committee.organ_id=v_case.organ_id
    and committee.organization_id=v_case.organization_id
    and committee.started_at<=now() and committee.ended_at is null
  for share;
  if not found then
    raise exception using errcode='23514',message='MEMBER_NOT_ACTIVE';
  end if;

  insert into public.world_ethics_case_assignments(
    case_id,member_id,assigned_by_user_id,operation_id
  ) values(p_case_id,p_member_id,auth.uid(),v_operation_id);
  update public.world_ethics_cases
  set status='assigned',revision=revision+1,updated_at=now()
  where id=p_case_id;
  insert into public.world_ethics_case_history(
    case_id,action,from_state,to_state,subject_person_id,
    actor_user_id,operation_id,revision
  ) values (
    p_case_id,'assigned',v_case.status,'assigned',v_member.person_id,
    auth.uid(),v_operation_id,v_case.revision+1
  );
  perform private.v3_emit_domain_event(
    'world.ethics.case_assigned','world_ethics_case',p_case_id::text,
    v_case.revision+1,v_operation_id,null,null,
    jsonb_build_object('caseId',p_case_id,'memberId',p_member_id,
      'organizationId',v_case.organization_id,'revision',v_case.revision+1),
    1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'caseId',p_case_id,'state','assigned',
    'revision',v_case.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $assign$;

create function public.world_append_ethics_evidence_v1(
  p_case_id uuid,
  p_statement text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $evidence$
declare
  v_case public.world_ethics_cases%rowtype;
  v_statement text := nullif(btrim(coalesce(p_statement,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_evidence_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or p_case_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if v_statement is null or length(v_statement) not between 20 and 12000
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select * into v_case from public.world_ethics_cases where id=p_case_id;
  if not found or not (
    exists(select 1 from public.country_accounts ca
      where ca.user_id=auth.uid() and ca.status='active'
        and ca.country_id=v_case.reporting_country_id)
    or public.world_access_allowed(
      'world.ethics.evidence.append',v_case.organization_id,null,v_case.organ_id,'ethics',p_case_id
    )
    or public.world_access_allowed(
      'world.ethics.case.manage',v_case.organization_id,null,v_case.organ_id,'ethics',p_case_id
    )
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.ethics.evidence.append','R2',
    jsonb_build_object('organizationId',v_case.organization_id,
      'organId',v_case.organ_id,'subjectType','world_ethics_case','subjectId',p_case_id),
    jsonb_build_object('caseId',p_case_id,'statement',v_statement)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  select * into v_case from public.world_ethics_cases where id=p_case_id for update;
  if v_case.status in ('concluded','archived') then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;
  insert into public.world_ethics_case_evidence(
    case_id,statement_text,recorded_by_user_id,operation_id
  ) values (p_case_id,v_statement,auth.uid(),v_operation_id)
  returning id into v_evidence_id;
  perform private.v3_emit_domain_event(
    'world.ethics.evidence_added','world_ethics_case',p_case_id::text,
    v_case.revision,v_operation_id,null,null,
    jsonb_build_object('caseId',p_case_id,'evidenceId',v_evidence_id,
      'organizationId',v_case.organization_id,'revision',v_case.revision),
    1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'caseId',p_case_id,
    'evidenceId',v_evidence_id,'revision',v_case.revision,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $evidence$;

revoke all on function public.world_file_ethics_case_v1(
  uuid,uuid,uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.world_configure_ethics_member_v1(
  uuid,uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.world_assign_ethics_case_v1(
  uuid,uuid,bigint,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.world_append_ethics_evidence_v1(
  uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.world_file_ethics_case_v1(
  uuid,uuid,uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.world_configure_ethics_member_v1(
  uuid,uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.world_assign_ethics_case_v1(
  uuid,uuid,bigint,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.world_append_ethics_evidence_v1(
  uuid,text,uuid,text,uuid) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
