begin;

-- TG9: executive procedural/scheduling decisions only. Assembly adoption,
-- appointments, membership execution, recognition and judgments remain with
-- their own canonical command owners. This record cannot enact those actions.
insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.decision.publish','world','Issue an executive procedural decision','Publish a non-legislative procedural or scheduling decision in an active office.','approve'),
  ('world.decision.correct','world','Correct an executive procedural decision','Publish an attributed correction without rewriting the prior official text.','approve')
on conflict(key) do nothing;

insert into public.world_office_capabilities(office_id,capability)
select office_row.id, c.capability
from public.world_organization_offices office_row
join public.world_organizations org on org.id = office_row.organization_id
cross join (values ('world.decision.publish'),('world.decision.correct')) c(capability)
where (org.slug='guard' and office_row.slug in ('chairperson','deputy-chairperson'))
   or (org.slug='unity' and office_row.slug in ('secretary-general','deputy-secretary-general'))
on conflict do nothing;

create table public.world_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  -- This slice only issues executive decisions (not an assembly measure).
  organ_id uuid references public.world_organization_organs(id) on delete restrict,
  issuer_office_id uuid not null references public.world_organization_offices(id) on delete restrict,
  issuer_person_id uuid not null references public.delegation_people(id) on delete restrict,
  identifier text not null unique,
  decision_kind text not null check(decision_kind in ('procedural','scheduling')),
  current_version_id uuid,
  current_revision bigint not null default 1 check(current_revision > 0),
  status text not null default 'published' check(status in ('published','superseded')),
  visibility text not null default 'public' check(visibility in ('public','members','private')),
  effective_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint world_executive_decision_no_assembly_origin check(organ_id is null)
);

create table public.world_decision_versions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.world_decisions(id) on delete restrict,
  version_number bigint not null check(version_number > 0),
  title text not null check(length(btrim(title)) between 1 and 220),
  body text not null check(length(btrim(body)) between 1 and 50000),
  correction_reason text,
  published_at timestamptz not null default now(),
  unique(decision_id,version_number),
  unique(decision_id,id),
  constraint world_decision_versions_correction_required check(
    (version_number=1 and correction_reason is null)
    or (version_number>1 and length(btrim(coalesce(correction_reason,''))) between 5 and 2000)
  )
);
alter table public.world_decisions
  add constraint world_decision_current_version_same_decision_fk
  foreign key(id,current_version_id) references public.world_decision_versions(decision_id,id)
  on delete restrict;

create function private.world_prevent_decision_version_rewrite()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
  raise exception using errcode='42501', message='PUBLISHED_DECISION_VERSION_IMMUTABLE';
end
$immutable$;
create trigger world_decision_versions_immutable before update or delete
on public.world_decision_versions for each row
execute function private.world_prevent_decision_version_rewrite();

create index world_decisions_public_org_idx
on public.world_decisions(organization_id,published_at desc,id)
where status='published' and visibility='public';
create index world_decision_versions_history_idx
on public.world_decision_versions(decision_id,version_number desc);

alter table public.world_decisions enable row level security;
alter table public.world_decision_versions enable row level security;
revoke all on public.world_decisions,public.world_decision_versions
  from public,anon,authenticated,service_role;
grant select on public.world_decisions,public.world_decision_versions
  to anon,authenticated,service_role;

create policy world_decisions_public_read on public.world_decisions
for select to anon,authenticated using (
  public.studio2_feature_enabled('terra_world_public',null) is true
  and status='published' and visibility='public'
  and exists(
    select 1 from public.world_organizations org
    where org.id=organization_id
      and org.public_visibility='public'
      and org.status in ('recognized','active','suspended','historical')
  )
);

create policy world_decision_versions_public_read on public.world_decision_versions
for select to anon,authenticated using(
  public.studio2_feature_enabled('terra_world_public',null) is true
  and exists (
    select 1 from public.world_decisions d
    join public.world_organizations org on org.id=d.organization_id
    where d.id=decision_id and d.status='published' and d.visibility='public'
      and org.public_visibility='public'
      and org.status in ('recognized','active','suspended','historical')
  )
);

create function public.world_issue_executive_decision_v1(
  p_organization_id uuid,
  p_decision_id uuid,
  p_issuing_office_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_effective_at timestamptz,
  p_correction_reason text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $issue$
declare
  v_actor uuid := auth.uid();
  v_office_person uuid;
  v_decision public.world_decisions%rowtype;
  v_organization public.world_organizations%rowtype;
  v_decision_id uuid;
  v_version_id uuid;
  v_revision bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if v_actor is null or p_organization_id is null or p_issuing_office_id is null
     or p_expected_revision is null or p_operation_id is null
     or nullif(btrim(p_idempotency_key),'') is null
     or p_kind not in ('procedural','scheduling')
     or p_title is null or length(btrim(p_title)) not between 1 and 220
     or p_body is null or length(btrim(p_body)) not between 1 and 50000 then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  -- Serialize official publication against changes to org publishability.
  select * into v_organization
  from public.world_organizations where id=p_organization_id
  for share;
  if not found or v_organization.status not in ('recognized','active')
     or v_organization.public_visibility<>'public' then
    raise exception using errcode='23514',message='ORGANIZATION_NOT_PUBLISHABLE';
  end if;

  if not public.world_access_allowed(
    case when p_decision_id is null then 'world.decision.publish'
      else 'world.decision.correct' end,
    p_organization_id,null,null,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  -- A scoped direct grant by itself is insufficient: a decision must be
  -- attributable to a genuine current executive officeholder.
  select term.holder_person_id into v_office_person
  from public.world_organization_offices office_row
  join public.world_office_terms term on term.office_id=office_row.id
  join public.world_office_capabilities cap on cap.office_id=office_row.id
  where office_row.id=p_issuing_office_id
    and office_row.organization_id=p_organization_id and office_row.active
    and cap.capability=case when p_decision_id is null
      then 'world.decision.publish' else 'world.decision.correct' end
    and term.holder_user_id=v_actor
    and term.status='active'
    and term.started_at<=now() and term.actual_end_at is null
  limit 1 for share of term,office_row;
  if v_office_person is null then
    raise exception using errcode='42501',message='CURRENT_OFFICE_TERM_REQUIRED';
  end if;

  if p_decision_id is null then
    if p_expected_revision<>0 or p_correction_reason is not null then
      raise exception using errcode='22023',message='EXPECTED_REVISION_REQUIRED';
    end if;
  elsif p_expected_revision<1
     or length(btrim(coalesce(p_correction_reason,''))) not between 5 and 2000 then
    raise exception using errcode='22023',message='CORRECTION_REASON_REQUIRED';
  end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,
    coalesce(p_correlation_id,p_operation_id),
    case when p_decision_id is null then 'world.decision.publish'
      else 'world.decision.correct' end,'R2',
    jsonb_build_object('organizationId',p_organization_id,
      'decisionId',p_decision_id,'subjectType','world_decision'),
    jsonb_build_object('organizationId',p_organization_id,
      'decisionId',p_decision_id,'issuingOfficeId',p_issuing_office_id,
      'kind',p_kind,'title',p_title,'body',p_body,
      'effectiveAt',p_effective_at,'correctionReason',p_correction_reason,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  if p_decision_id is null then
    v_decision_id:=gen_random_uuid();
    insert into public.world_decisions(
      id,organization_id,organ_id,issuer_office_id,issuer_person_id,
      identifier,decision_kind,effective_at,status,visibility,current_revision
    ) values(
      v_decision_id,p_organization_id,null,p_issuing_office_id,v_office_person,
      v_organization.slug||'/EXEC/'||v_decision_id::text,
      p_kind,p_effective_at,'published','public',1
    );
    v_revision:=1;
  else
    select * into v_decision from public.world_decisions
    where id=p_decision_id and organization_id=p_organization_id for update;
    if not found or v_decision.status<>'published'
       or v_decision.visibility<>'public'
       or v_decision.current_revision<>p_expected_revision
       or v_decision.issuer_office_id<>p_issuing_office_id
       or v_decision.decision_kind<>p_kind
       or v_decision.effective_at is distinct from p_effective_at then
      raise exception using errcode='40001',message='STATE_CHANGED';
    end if;
    v_decision_id:=p_decision_id;
    v_revision:=p_expected_revision+1;
  end if;

  insert into public.world_decision_versions(
    decision_id,version_number,title,body,correction_reason
  ) values(
    v_decision_id,v_revision,btrim(p_title),btrim(p_body),
    case when v_revision=1 then null else btrim(p_correction_reason) end
  ) returning id into v_version_id;
  update public.world_decisions
  set current_version_id=v_version_id,current_revision=v_revision
  where id=v_decision_id;

  perform private.v3_emit_domain_event(
    case when v_revision=1 then 'world.decision.published'
      else 'world.decision.corrected' end,
    'world_decision',v_decision_id::text,v_revision,v_operation_id,
    null,null,
    jsonb_build_object('organizationId',p_organization_id,
      'decisionId',v_decision_id,'versionId',v_version_id,
      'revision',v_revision,'kind',p_kind,'published',true,'visibility','public'),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object(
    'ok',true,'decisionId',v_decision_id,'versionId',v_version_id,
    'identifier',v_organization.slug||'/EXEC/'||v_decision_id::text,
    'revision',v_revision,'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$issue$;
revoke all on function public.world_issue_executive_decision_v1(
  uuid,uuid,uuid,text,text,text,timestamptz,text,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_issue_executive_decision_v1(
  uuid,uuid,uuid,text,text,text,timestamptz,text,bigint,uuid,text,uuid
) to authenticated,service_role;

create function public.world_public_executive_decisions_v1(
  p_organization_slug text,p_limit integer default 20
) returns jsonb language sql stable security invoker set search_path=pg_catalog
as $list$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'identifier',r.identifier,'organizationSlug',r.slug,
  'decisionKind',r.decision_kind,'publishedAt',r.published_at,
  'effectiveAt',r.effective_at,'revision',r.current_revision,
  'title',r.title,'excerpt',r.excerpt,
  'corrected',r.current_revision>1
 ) order by r.published_at desc,r.id desc),'[]'::jsonb)
 from (
  select d.id,d.identifier,org.slug,d.decision_kind,d.published_at,
    d.effective_at,d.current_revision,v.title,left(v.body,320) as excerpt
  from public.world_decisions d
  join public.world_organizations org on org.id=d.organization_id
  join public.world_decision_versions v on v.id=d.current_version_id
  where public.studio2_feature_enabled('terra_world_public',null) is true
    and org.slug=lower(btrim(p_organization_slug))
    and org.public_visibility='public'
    and org.status in ('recognized','active','suspended','historical')
    and d.visibility='public' and d.status='published'
  order by d.published_at desc,d.id desc
  limit least(greatest(coalesce(p_limit,20),1),30)
 ) r
$list$;
revoke all on function public.world_public_executive_decisions_v1(text,integer)
from public,anon,authenticated;
grant execute on function public.world_public_executive_decisions_v1(text,integer)
to anon,authenticated,service_role;

create function public.world_public_executive_decision_history_v1(p_decision_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog
as $detail$
 select jsonb_build_object(
   'id',d.id,'identifier',d.identifier,'organizationSlug',org.slug,
   'decisionKind',d.decision_kind,'effectiveAt',d.effective_at,
   'publishedAt',d.published_at,'revision',d.current_revision,
   'versions',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',v.id,'revision',v.version_number,
       'title',v.title,'body',v.body,
       'correctionReason',v.correction_reason,'publishedAt',v.published_at
     ) order by v.version_number desc)
     from public.world_decision_versions v where v.decision_id=d.id
   ),'[]'::jsonb)
 )
 from public.world_decisions d
 join public.world_organizations org on org.id=d.organization_id
 where public.studio2_feature_enabled('terra_world_public',null) is true
   and d.id=p_decision_id and d.status='published'
   and d.visibility='public' and org.public_visibility='public'
   and org.status in ('recognized','active','suspended','historical')
$detail$;
revoke all on function public.world_public_executive_decision_history_v1(uuid)
from public,anon,authenticated;
grant execute on function public.world_public_executive_decision_history_v1(uuid)
to anon,authenticated,service_role;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg9.executive-procedural-decisions',1,'forward_fix_only',false,null,
   'Immutable attributed executive procedural/scheduling decisions only; does not execute law, elections, appointments, recognition or Court judgments.'
  );
 end if;
end
$contract$;
notify pgrst,'reload schema';
commit;
