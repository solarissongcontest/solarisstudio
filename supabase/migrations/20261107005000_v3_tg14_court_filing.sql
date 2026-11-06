begin;

-- TG14 Court intake slice. This is the existing UNITY Court, not a duplicate
-- legal authority or a replacement for TG4 documents / TG8 certified votes.
do $migration$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg14.court-filing',1,'forward_fix_only',false,null,
      'Official UNITY International Terra Solaris Court filing, parties, response and private immutable pleading history.'
    );
  end if;
end $migration$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.court.file','world','File Court case','File a Terra Solaris Court case for a currently controlled country.','operate'),
  ('world.court.respond','world','Respond to Court filing','File an official response for the currently controlled respondent country.','operate'),
  ('world.court.manage','world','Manage Court proceedings','Manage Court intake and procedural records under explicit institutional authority.','approve'),
  ('world.court.judge','world','Issue Court judgment','Issue judgments as the constitutionally authorized Secretary-General.','approve')
on conflict (key) do nothing;
insert into public.world_country_controller_capabilities(capability)
values ('world.court.file'),('world.court.respond')
on conflict do nothing;

-- Only the canonical UNITY Secretary-General office is preconfigured as the
-- Court's judicial authority. An unfilled/expired office term confers no rights.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id, cap.key
from public.world_organization_offices office_row
join public.world_organizations organization_row
  on organization_row.id = office_row.organization_id
cross join (values ('world.court.manage'),('world.court.judge')) cap(key)
where organization_row.slug = 'unity' and office_row.slug = 'secretary-general'
on conflict do nothing;

-- Court is one UNITY organ, not a new competing world organization.
insert into public.world_organization_organs(
  organization_id,slug,name,short_name,type,description,visibility,status,sort_order
)
select o.id,'international-terra-solaris-court',
  'International Terra Solaris Court','ITSC','court',
  'Formal judicial organ with judgments issued under the current UNITY Court canon.',
  'public','active',30
from public.world_organizations o where o.slug = 'unity'
on conflict (organization_id,slug) do nothing;

create sequence public.world_court_identifier_seq as bigint start with 1;

create table public.world_court_cases (
  id uuid primary key default gen_random_uuid(),
  identifier text not null unique,
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  applicant_country_id uuid not null references public.countries(id) on delete restrict,
  respondent_country_id uuid not null references public.countries(id) on delete restrict,
  claim text not null,
  legal_basis text not null,
  requested_remedy text not null,
  status text not null default 'filed',
  filed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  filed_by_user_id uuid not null,
  presiding_person_id uuid references public.delegation_people(id) on delete restrict,
  public_metadata jsonb not null default '{"listed":false}'::jsonb,
  proceedings_visibility text not null default 'private',
  revision bigint not null default 1,
  constraint world_court_distinct_parties check (applicant_country_id <> respondent_country_id),
  constraint world_court_claim_length check (length(btrim(claim)) between 20 and 12000),
  constraint world_court_basis_length check (length(btrim(legal_basis)) between 10 and 10000),
  constraint world_court_remedy_length check (length(btrim(requested_remedy)) between 10 and 10000),
  constraint world_court_state_check check (
    status in ('filed','preliminary_review','response_pending','proceedings',
      'hearing','judgment_pending','decided','reconsideration_requested',
      'reconsideration','closed','archived')
  ),
  constraint world_court_visibility_check check (proceedings_visibility in ('private','public')),
  constraint world_court_public_metadata_object check (jsonb_typeof(public_metadata) = 'object'),
  constraint world_court_revision_positive check (revision >= 1)
);

create index world_court_cases_applicant_idx
  on public.world_court_cases(applicant_country_id,filed_at desc);
create index world_court_cases_respondent_idx
  on public.world_court_cases(respondent_country_id,filed_at desc);
create index world_court_cases_status_idx
  on public.world_court_cases(organization_id,status,filed_at desc);

create table public.world_court_parties (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_court_cases(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  party_role text not null,
  recorded_at timestamptz not null default now(),
  unique (case_id,party_role),
  unique (case_id,country_id),
  constraint world_court_party_role_check check (party_role in ('applicant','respondent'))
);

create table public.world_court_filings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_court_cases(id) on delete restrict,
  party_country_id uuid not null references public.countries(id) on delete restrict,
  filing_type text not null,
  body text not null,
  legal_basis text,
  requested_remedy text,
  filed_by_user_id uuid not null,
  operation_id uuid not null unique,
  case_revision bigint not null,
  filed_at timestamptz not null default now(),
  unique (case_id,case_revision),
  constraint world_court_filing_type_check check (
    filing_type in ('claim','response','additional_submission','reconsideration_request')
  ),
  constraint world_court_filing_body_check check (length(btrim(body)) between 20 and 12000),
  constraint world_court_filing_revision_check check (case_revision >= 1)
);
create unique index world_court_first_claim_uidx on public.world_court_filings(case_id)
  where filing_type = 'claim';
create unique index world_court_first_response_uidx on public.world_court_filings(case_id)
  where filing_type = 'response';
create index world_court_filings_case_idx
  on public.world_court_filings(case_id,filed_at,case_revision);

create function private.world_court_filing_immutable()
returns trigger language plpgsql security invoker set search_path = pg_catalog
as $immutable$
begin
  raise exception using errcode = '42501', message = 'IMMUTABLE_COURT_FILING';
end $immutable$;
revoke all on function private.world_court_filing_immutable()
  from public,anon,authenticated,service_role;
create trigger world_court_filings_append_only
before update or delete on public.world_court_filings
for each row execute function private.world_court_filing_immutable();

alter table public.world_court_cases enable row level security;
alter table public.world_court_parties enable row level security;
alter table public.world_court_filings enable row level security;
revoke all on public.world_court_cases,public.world_court_parties,
  public.world_court_filings from public,anon,authenticated,service_role;
grant select on public.world_court_cases,public.world_court_parties,
  public.world_court_filings to authenticated,service_role;

-- No anonymous Court docket leaks via raw tables. Private claims and filings
-- are never projected to public anonymous readers.
create policy world_court_participant_read on public.world_court_cases
for select to authenticated using (
  exists (
    select 1 from public.country_accounts ca
    where ca.user_id = auth.uid() and ca.status = 'active'
      and ca.country_id in (applicant_country_id,respondent_country_id)
  )
  or public.world_access_allowed(
    'world.court.manage',organization_id,null,null,'court',id
  )
);
create policy world_court_parties_protected on public.world_court_parties
for select to authenticated using (
  exists (select 1 from public.world_court_cases case_row
    where case_row.id = case_id)
);
create policy world_court_filings_protected on public.world_court_filings
for select to authenticated using (
  exists (select 1 from public.world_court_cases case_row
    where case_row.id = case_id)
);

-- The public docket contains identifiers, parties and statuses ONLY, and only
-- if the Court has explicitly marked the case listed in a later governed review.
-- No claim, evidence, legal reasoning, login or pleading can leak here.
create function public.world_court_public_docket_v1(p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $docket$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',listed.id,'identifier',listed.identifier,
    'applicantCountryId',listed.applicant_country_id,
    'respondentCountryId',listed.respondent_country_id,
    'status',listed.status,'filedAt',listed.filed_at
  ) order by listed.filed_at desc), '[]'::jsonb)
  from (
    select c.id,c.identifier,c.applicant_country_id,c.respondent_country_id,
      c.status,c.filed_at
    from public.world_court_cases c
    join public.world_organizations o on o.id = c.organization_id
    where o.slug = 'unity' and o.public_visibility = 'public'
      and o.status in ('active','recognized')
      and c.public_metadata @> '{"listed":true}'::jsonb
    order by c.filed_at desc,c.id
    limit least(greatest(coalesce(p_limit,20),1),50)
  ) listed
$docket$;
revoke all on function public.world_court_public_docket_v1(integer)
  from public,anon,authenticated;
grant execute on function public.world_court_public_docket_v1(integer)
  to anon,authenticated,service_role;

create function public.world_file_court_case_v1(
  p_organization_id uuid,
  p_applicant_country_id uuid,
  p_respondent_country_id uuid,
  p_claim text,
  p_legal_basis text,
  p_requested_remedy text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $file$
declare
  v_claim text := nullif(btrim(coalesce(p_claim,'')),'');
  v_basis text := nullif(btrim(coalesce(p_legal_basis,'')),'');
  v_remedy text := nullif(btrim(coalesce(p_requested_remedy,'')),'');
  v_organization public.world_organizations%rowtype;
  v_operation_claim jsonb;
  v_operation_id uuid;
  v_case_id uuid;
  v_identifier text;
  v_receipt jsonb;
begin
  if auth.uid() is null or not public.world_access_allowed(
    'world.court.file',p_organization_id,p_applicant_country_id,null,null,null
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_organization_id is null or p_applicant_country_id is null
    or p_respondent_country_id is null
    or p_applicant_country_id = p_respondent_country_id
    or v_claim is null or length(v_claim) not between 20 and 12000
    or v_basis is null or length(v_basis) not between 10 and 10000
    or v_remedy is null or length(v_remedy) not between 10 and 10000
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  select * into v_organization from public.world_organizations o
  where o.id = p_organization_id and o.slug = 'unity'
    and o.status in ('active','recognized');
  if not found or not exists (
    select 1 from public.countries c where c.id = p_respondent_country_id
  ) then
    raise exception using errcode = '23514', message = 'COURT_UNAVAILABLE';
  end if;

  v_operation_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.court.file','R2',
    jsonb_build_object('organizationId',p_organization_id,
      'countryId',p_applicant_country_id,'subjectType','world_court_case'),
    jsonb_build_object('organizationId',p_organization_id,
      'applicantCountryId',p_applicant_country_id,
      'respondentCountryId',p_respondent_country_id,
      'claim',v_claim,'legalBasis',v_basis,'requestedRemedy',v_remedy)
  );
  v_operation_id := (v_operation_claim ->> 'operationId')::uuid;
  if coalesce((v_operation_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Tie filing to current country authority, not a cached client role.
  perform 1 from public.country_accounts ca
  where ca.country_id = p_applicant_country_id
    and ca.user_id = auth.uid() and ca.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_identifier := 'ITSC-' || lpad(nextval('public.world_court_identifier_seq')::text,6,'0');
  insert into public.world_court_cases(
    identifier,organization_id,applicant_country_id,respondent_country_id,
    claim,legal_basis,requested_remedy,filed_by_user_id
  ) values (
    v_identifier,p_organization_id,p_applicant_country_id,p_respondent_country_id,
    v_claim,v_basis,v_remedy,auth.uid()
  ) returning id into v_case_id;

  insert into public.world_court_parties(case_id,country_id,party_role)
  values (v_case_id,p_applicant_country_id,'applicant'),
         (v_case_id,p_respondent_country_id,'respondent');
  insert into public.world_court_filings(
    case_id,party_country_id,filing_type,body,legal_basis,requested_remedy,
    filed_by_user_id,operation_id,case_revision
  ) values (
    v_case_id,p_applicant_country_id,'claim',v_claim,v_basis,v_remedy,
    auth.uid(),v_operation_id,1
  );

  perform private.v3_emit_domain_event(
    'world.court.filed','world_court_case',v_case_id::text,1,v_operation_id,
    null,null,
    jsonb_build_object('caseId',v_case_id,'organizationId',p_organization_id,
      'applicantCountryId',p_applicant_country_id,
      'respondentCountryId',p_respondent_country_id,'revision',1),
    1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'caseId',v_case_id,
    'identifier',v_identifier,'status','filed','revision',1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $file$;

create function public.world_respond_to_court_case_v1(
  p_case_id uuid,
  p_response text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $respond$
declare
  v_case public.world_court_cases%rowtype;
  v_response text := nullif(btrim(coalesce(p_response,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or p_case_id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_response is null or length(v_response) not between 20 and 12000
    or p_expected_revision is null or p_expected_revision < 1
    or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  select * into v_case from public.world_court_cases where id = p_case_id;
  if not found or not public.world_access_allowed(
    'world.court.respond',v_case.organization_id,v_case.respondent_country_id,
    null,'court',v_case.id
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.court.respond','R2',
    jsonb_build_object('organizationId',v_case.organization_id,
      'countryId',v_case.respondent_country_id,'subjectType','world_court_case',
      'subjectId',v_case.id),
    jsonb_build_object('caseId',p_case_id,'response',v_response,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select * into v_case from public.world_court_cases where id = p_case_id for update;
  if v_case.revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if v_case.status not in ('filed','preliminary_review','response_pending')
    or exists (
      select 1 from public.world_court_filings filing
      where filing.case_id = p_case_id and filing.filing_type = 'response'
    ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  -- Explicit lock prevents old country controllers replying after a transfer.
  perform 1 from public.country_accounts ca
  where ca.country_id = v_case.respondent_country_id
    and ca.user_id = auth.uid() and ca.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  insert into public.world_court_filings(
    case_id,party_country_id,filing_type,body,filed_by_user_id,operation_id,case_revision
  ) values (
    v_case.id,v_case.respondent_country_id,'response',v_response,
    auth.uid(),v_operation_id,v_case.revision+1
  );
  update public.world_court_cases
    set revision=revision+1,updated_at=now()
  where id = v_case.id;

  perform private.v3_emit_domain_event(
    'world.court.response_filed','world_court_case',v_case.id::text,
    v_case.revision+1,v_operation_id,null,null,
    jsonb_build_object('caseId',v_case.id,'organizationId',v_case.organization_id,
      'respondentCountryId',v_case.respondent_country_id,'revision',v_case.revision+1),
    1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'caseId',v_case.id,
    'identifier',v_case.identifier,'status',v_case.status,
    'revision',v_case.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $respond$;

revoke all on function public.world_file_court_case_v1(uuid,uuid,uuid,text,text,text,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.world_respond_to_court_case_v1(uuid,text,bigint,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.world_file_court_case_v1(uuid,uuid,uuid,text,text,text,uuid,text,uuid)
  to authenticated,service_role;
grant execute on function public.world_respond_to_court_case_v1(uuid,text,bigint,uuid,text,uuid)
  to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
