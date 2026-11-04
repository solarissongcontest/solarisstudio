begin;

-- TG7 first vertical slice: institutional measures, versioned submissions and
-- procedural registration. Depends on TG1/TG2 and TG6. Deliberately does NOT
-- certify votes, invent a legislature, schedule a debate, or adjudicate content.
insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
 ('world.measure.submit','world','Submit formal measure','Submit a measure on behalf of an eligible organization member country.','operate'),
 ('world.measure.register_external','world','Register external intake','Record formally received external proposals in scope.','approve'),
 ('world.measure.review_procedural','world','Procedural measure review','Check format and eligibility, return for correction or register a formal measure.','approve'),
 ('world.measure.schedule','world','Schedule measures','Place eligible registered measures onto an institutional agenda.','operate'),
 ('world.measure.withdraw','world','Withdraw measures','Withdraw an eligible sponsored measure with an auditable record.','operate'),
 ('world.amendment.submit','world','Submit measure amendment','Submit an amendment to a measure in the correct organization.','operate')
on conflict(key) do nothing;

-- Titles never grant privileges. These explicit office-capability rows are
-- limited to known GUARD/UNITY offices and do not cover future unions by name.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id, capability_row.capability
from public.world_organization_offices office_row
join public.world_organizations organization_row
  on organization_row.id=office_row.organization_id
join (values ('guard','chairperson'),('unity','secretary-general'))
  office_scope(organization_slug,office_slug)
  on organization_row.slug=office_scope.organization_slug
 and office_row.slug=office_scope.office_slug
cross join (values ('world.measure.review_procedural')) capability_row(capability)
on conflict do nothing;

-- A controlling country may submit only while it is an eligible member;
-- world_measure_submit_v1 rechecks both membership and organ in the database.
insert into public.world_country_controller_capabilities(capability)
values ('world.measure.submit')
on conflict do nothing;

-- Country code/topic code registries are data, not frontend switch statements.
-- Unknown constitutional GUARD topic codes are deliberately not fabricated.
create table public.world_measure_categories (
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  code text not null,
  label text not null,
  active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id,code),
  constraint world_measure_category_code_check check (code ~ '^[A-Z0-9]{2,12}$'),
  constraint world_measure_category_label_check check (length(btrim(label)) between 1 and 120),
  constraint world_measure_category_date_check check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create table public.world_measures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid not null,
  identifier text,
  measure_type text not null,
  title text not null,
  short_title text,
  sponsor_country_id uuid not null references public.countries(id) on delete restrict,
  category_code text,
  intake_id uuid,
  source_channel text not null default 'solaris',
  state text not null default 'submitted',
  current_version_id uuid,
  session_id uuid references public.world_sessions(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  registered_at timestamptz,
  concluded_at timestamptz,
  visibility text not null default 'members',
  procedural_note text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_measures_organ_fk foreign key(organ_id,organization_id)
    references public.world_organization_organs(id,organization_id) on delete restrict,
  constraint world_measures_category_fk foreign key(organization_id,category_code)
    references public.world_measure_categories(organization_id,code) on delete restrict,
  constraint world_measures_identifier_check check(identifier is null or length(btrim(identifier)) between 6 and 160),
  constraint world_measures_title_check check(length(btrim(title)) between 1 and 180),
  constraint world_measures_short_title_check check(short_title is null or length(btrim(short_title)) between 1 and 120),
  constraint world_measures_type_check check(measure_type in (
    'proposal','bill','motion','draft_resolution','membership_application',
    'membership_expulsion','charter_amendment','rule_amendment','union_recognition',
    'procedural_motion','sanction_motion','other'
  )),
  constraint world_measures_source_check check(source_channel in ('solaris','dm','instagram','other')),
  constraint world_measures_state_check check(state in (
    'draft','submitted','procedural_review','needs_correction','registered',
    'scheduled','under_debate','voting','adopted','rejected','withdrawn',
    'superseded','repealed','archived'
  )),
  constraint world_measures_visibility_check check(visibility in ('public','members','private')),
  constraint world_measures_registered_check check((state not in (
    'registered','scheduled','under_debate','voting','adopted','rejected',
    'superseded','repealed','archived'
  )) or (identifier is not null and registered_at is not null and current_version_id is not null)),
  constraint world_measures_revision_check check(revision >= 1),
  unique(organization_id,identifier)
);
create index world_measures_org_state_idx
  on public.world_measures(organization_id,state,submitted_at desc);
create index world_measures_sponsor_idx
  on public.world_measures(sponsor_country_id,submitted_at desc);

create table public.world_measure_versions (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null references public.world_measures(id) on delete restrict,
  version_number integer not null,
  title text not null,
  full_text text not null,
  summary text,
  created_by_person_id uuid references public.delegation_people(id) on delete set null,
  created_at timestamptz not null default now(),
  reason text,
  supersedes_version_id uuid,
  content_hash text not null,
  publication_state text not null default 'draft',
  constraint world_measure_version_seq_check check(version_number > 0),
  constraint world_measure_version_title_check check(length(btrim(title)) between 1 and 180),
  constraint world_measure_version_body_check check(length(btrim(full_text)) between 1 and 25000),
  constraint world_measure_version_summary_check check(summary is null or length(summary) <= 2000),
  constraint world_measure_version_hash_check check(content_hash ~ '^[0-9a-f]{64}$'),
  constraint world_measure_version_publication_check check(publication_state in ('draft','published')),
  unique(measure_id,version_number),
  unique(id,measure_id),
  constraint world_measure_version_supersedes_fk
    foreign key(supersedes_version_id,measure_id)
    references public.world_measure_versions(id,measure_id) on delete restrict
);
create index world_measure_versions_history_idx
  on public.world_measure_versions(measure_id,version_number desc);

-- The current version must belong to the SAME measure, even for privileged
-- scripts. Forward FK is added after both canonical tables exist.
alter table public.world_measures
  add constraint world_measures_current_version_fk
    foreign key(current_version_id,id) references public.world_measure_versions(id,measure_id)
    on delete restrict deferrable initially deferred;

-- A registered identifier and the sponsor/institution identity are permanent.
-- No privileged repair script may silently rewrite historical attribution.
create or replace function public.world_measure_identity_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $measure_identity$
begin
 if (old.organization_id,old.organ_id,old.sponsor_country_id,
     old.measure_type,old.category_code) is distinct from
    (new.organization_id,new.organ_id,new.sponsor_country_id,
     new.measure_type,new.category_code)
 then raise exception using errcode='23514',message='IMMUTABLE_MEASURE_IDENTITY'; end if;
 if old.identifier is not null and old.identifier is distinct from new.identifier
 then raise exception using errcode='23514',message='IMMUTABLE_MEASURE_IDENTIFIER'; end if;
 if old.registered_at is not null and old.registered_at is distinct from new.registered_at
 then raise exception using errcode='23514',message='IMMUTABLE_MEASURE_REGISTRATION'; end if;
 return new;
end
$measure_identity$;
create trigger world_measure_identity_guard
before update on public.world_measures
for each row execute function public.world_measure_identity_guard_v1();

create or replace function public.world_measure_version_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $immutable$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='IMMUTABLE_MEASURE_VERSION';
  end if;
  -- Registration can publish an existing draft, but never rewrite its text,
  -- identity, provenance, content hash or version sequence.
  if old.publication_state='draft' and new.publication_state='published'
     and (to_jsonb(new) - 'publication_state') = (to_jsonb(old) - 'publication_state') then
    return new;
  end if;
  raise exception using errcode='23514',message='IMMUTABLE_MEASURE_VERSION';
end
$immutable$;
create trigger world_measure_version_immutable
before update or delete on public.world_measure_versions
for each row execute function public.world_measure_version_immutable_v1();

alter table public.world_measures enable row level security;
alter table public.world_measure_versions enable row level security;
alter table public.world_measure_categories enable row level security;
revoke all on public.world_measures,public.world_measure_versions,
  public.world_measure_categories from public,anon,authenticated,service_role;

-- Public read surfaces are allowlisted projections, never table-wide SELECT.
-- A record is public only after procedural registration AND publication.
create or replace function public.world_measure_public_list_v1(
  p_organization_slug text default null,p_limit integer default 30
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $measure_list$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'organizationSlug',o.slug,'organName',g.name,
  'identifier',m.identifier,'measureType',m.measure_type,
  'title',v.title,'summary',v.summary,'state',m.state,
  'sponsorCountryCode',c.short_code,'submittedAt',m.submitted_at,
  'registeredAt',m.registered_at,'revision',m.revision
 ) order by m.registered_at desc,m.id),'[]'::jsonb)
 from (
  select * from public.world_measures m
  where m.visibility='public'
    and m.registered_at is not null
    and m.state in ('registered','scheduled','under_debate','voting',
      'adopted','rejected','withdrawn','superseded','repealed','archived')
    and (p_organization_slug is null or exists (
      select 1 from public.world_organizations o2
      where o2.id=m.organization_id and o2.slug=lower(btrim(p_organization_slug))
    ))
  order by m.registered_at desc,m.id
  limit greatest(1,least(coalesce(p_limit,30),50))
 ) m
 join public.world_organizations o on o.id=m.organization_id
    and o.public_visibility='public'
 join public.world_organization_organs g on g.id=m.organ_id
    and g.organization_id=m.organization_id and g.visibility='public'
 join public.world_measure_versions v on v.id=m.current_version_id
    and v.measure_id=m.id and v.publication_state='published'
 join public.countries c on c.id=m.sponsor_country_id
$measure_list$;

create or replace function public.world_measure_public_detail_v1(p_measure_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $measure_detail$
 select jsonb_build_object(
  'id',m.id,'organizationSlug',o.slug,'organName',g.name,
  'identifier',m.identifier,'measureType',m.measure_type,'state',m.state,
  'sponsorCountryCode',c.short_code,'registeredAt',m.registered_at,
  'revision',m.revision,
  'currentVersion',jsonb_build_object('id',v.id,'number',v.version_number,
    'title',v.title,'text',v.full_text,'summary',v.summary,
    'contentHash',v.content_hash,'createdAt',v.created_at),
  'publishedHistory',coalesce((select jsonb_agg(jsonb_build_object(
    'id',old_version.id,'number',old_version.version_number,
    'title',old_version.title,'createdAt',old_version.created_at,
    'contentHash',old_version.content_hash
  ) order by old_version.version_number desc) from (
    select h.id,h.version_number,h.title,h.created_at,h.content_hash
    from public.world_measure_versions h
    where h.measure_id=m.id and h.publication_state='published'
    order by h.version_number desc limit 25
  ) old_version),'[]'::jsonb)
 )
 from public.world_measures m
 join public.world_organizations o on o.id=m.organization_id and o.public_visibility='public'
 join public.world_organization_organs g on g.id=m.organ_id
    and g.organization_id=m.organization_id and g.visibility='public'
 join public.world_measure_versions v on v.id=m.current_version_id
    and v.measure_id=m.id and v.publication_state='published'
 join public.countries c on c.id=m.sponsor_country_id
 where m.id=p_measure_id and m.visibility='public'
   and m.registered_at is not null
   and m.state in ('registered','scheduled','under_debate','voting',
      'adopted','rejected','withdrawn','superseded','repealed','archived')
$measure_detail$;

create or replace function public.world_measure_manage_v1(p_measure_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $measure_manage$
declare v_measure public.world_measures%rowtype;
begin
 select * into v_measure from public.world_measures where id=p_measure_id;
 if v_measure.id is null or not (
    public.world_access_allowed('world.measure.review_procedural',
      v_measure.organization_id,v_measure.sponsor_country_id,v_measure.organ_id,null,null)
    or public.world_access_allowed('world.measure.submit',
      v_measure.organization_id,v_measure.sponsor_country_id,v_measure.organ_id,null,null)
 ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 return jsonb_build_object('id',v_measure.id,'organizationId',v_measure.organization_id,
   'organId',v_measure.organ_id,'sponsorCountryId',v_measure.sponsor_country_id,
   'state',v_measure.state,'visibility',v_measure.visibility,
   'identifier',v_measure.identifier,'proceduralNote',v_measure.procedural_note,
   'revision',v_measure.revision,
   'versions',coalesce((select jsonb_agg(jsonb_build_object(
     'id',v.id,'number',v.version_number,'title',v.title,'text',v.full_text,
     'summary',v.summary,'publicationState',v.publication_state,
     'createdAt',v.created_at
   ) order by v.version_number desc)
   from public.world_measure_versions v where v.measure_id=v_measure.id),'[]'::jsonb));
end
$measure_manage$;

-- The first command produces a durable operation receipt and a versioned
-- draft. No user-controlled identifier or published record is minted here.
create or replace function public.world_measure_submit_v1(
 p_organization_id uuid,p_organ_id uuid,p_sponsor_country_id uuid,
 p_measure_type text,p_title text,p_full_text text,p_summary text,
 p_category_code text,p_operation_id uuid,p_idempotency_key text,
 p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $measure_submit$
declare
 v_claim jsonb;v_operation_id uuid;v_measure_id uuid;v_version_id uuid;
 v_result jsonb;
begin
 if not public.world_access_allowed('world.measure.submit',
   p_organization_id,p_sponsor_country_id,p_organ_id,null,null)
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 if p_measure_type is null or p_measure_type not in (
   'proposal','bill','motion','draft_resolution','membership_application',
   'membership_expulsion','charter_amendment','rule_amendment','union_recognition',
   'procedural_motion','sanction_motion','other')
   or nullif(btrim(p_title),'') is null or length(btrim(p_title)) > 180
   or nullif(btrim(p_full_text),'') is null or length(btrim(p_full_text)) > 25000
   or length(coalesce(p_summary,'')) > 2000
 then raise exception using errcode='22023',message='VALIDATION'; end if;
 -- Serialize against concurrent institutional changes; prove the country has
 -- active membership and the organ belongs to the same active organization.
 perform 1 from public.world_organization_organs g
 join public.world_organizations o on o.id=g.organization_id
 where g.id=p_organ_id and g.organization_id=p_organization_id
   and g.status='active' and o.status='active'
 for share of g;
 if not found then raise exception using errcode='23503',message='INVALID_ORGAN'; end if;
 perform 1 from public.world_organization_memberships membership
 where membership.organization_id=p_organization_id
   and membership.country_id=p_sponsor_country_id
   and membership.ended_at is null
   and membership.status='member'
 for share;
 if not found then raise exception using errcode='23514',message='SPONSOR_NOT_MEMBER'; end if;
 if p_category_code is not null and not exists (
   select 1 from public.world_measure_categories category
   where category.organization_id=p_organization_id
     and category.code=p_category_code and category.active
     and (category.effective_from is null or category.effective_from<=now())
     and (category.effective_to is null or category.effective_to>now())
 ) then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.measure.submit','R2',
   jsonb_build_object('organizationId',p_organization_id,
     'organId',p_organ_id,'countryId',p_sponsor_country_id,
     'subjectType','world_measure'),
   jsonb_build_object('measureType',p_measure_type,'title',btrim(p_title),
     'body',p_full_text,'summary',p_summary,'categoryCode',p_category_code)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',true);
 end if;
 insert into public.world_measures(
   organization_id,organ_id,sponsor_country_id,measure_type,title,
   category_code,source_channel,state,visibility
 ) values(p_organization_id,p_organ_id,p_sponsor_country_id,p_measure_type,
   btrim(p_title),p_category_code,'solaris','submitted','members')
 returning id into v_measure_id;
 insert into public.world_measure_versions(
   measure_id,version_number,title,full_text,summary,reason,content_hash
 ) values(v_measure_id,1,btrim(p_title),btrim(p_full_text),
   nullif(btrim(coalesce(p_summary,'')),''),'submission',
   encode(pg_catalog.sha256(pg_catalog.convert_to(
     btrim(p_title)||E'\n'||btrim(p_full_text)||E'\n'||
     coalesce(btrim(p_summary),''),'UTF8')),'hex'))
 returning id into v_version_id;
 update public.world_measures set current_version_id=v_version_id where id=v_measure_id;
 perform private.v3_emit_domain_event(
   'world.measure.submitted','world_measure',v_measure_id::text,1,
   v_operation_id,null,null,jsonb_build_object(
     'measureId',v_measure_id,'organizationId',p_organization_id,
     'organId',p_organ_id,'countryId',p_sponsor_country_id),1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'measureId',v_measure_id,
   'versionId',v_version_id,'state','submitted','revision',1,
   'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_result);
 return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',false);
end
$measure_submit$;

-- Only the procedural officer may register or return an intake. Political
-- disagreement is not a valid procedural rejection outcome. This command does
-- not accept a political veto/rejection state or a voting outcome.
create or replace function public.world_measure_review_v1(
 p_measure_id uuid,p_target_state text,p_identifier text,p_procedural_note text,
 p_expected_revision bigint,p_operation_id uuid,p_idempotency_key text,
 p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $measure_review$
declare
 v_measure public.world_measures%rowtype;v_claim jsonb;v_operation_id uuid;
 v_result jsonb;v_slug text;v_sponsor_code text;
begin
 select * into v_measure from public.world_measures where id=p_measure_id for update;
 if v_measure.id is null or not public.world_access_allowed(
   'world.measure.review_procedural',v_measure.organization_id,
   v_measure.sponsor_country_id,v_measure.organ_id,null,null)
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 if p_target_state is null or p_target_state not in
   ('procedural_review','needs_correction','registered')
 then raise exception using errcode='22023',message='VALIDATION'; end if;
 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.measure.review','R2',
   jsonb_build_object('measureId',p_measure_id,'subjectType','world_measure'),
   jsonb_build_object('targetState',p_target_state,'identifier',p_identifier,
     'proceduralNote',p_procedural_note,'expectedRevision',p_expected_revision)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',true);
 end if;
 if p_expected_revision is null or p_expected_revision<>v_measure.revision then
   raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
 if not (
   (v_measure.state='submitted' and p_target_state in ('procedural_review','needs_correction'))
   or (v_measure.state='procedural_review' and p_target_state in ('registered','needs_correction'))
 ) then raise exception using errcode='23514',message='STATE_CHANGED'; end if;
 if p_target_state='needs_correction' and
   (length(btrim(coalesce(p_procedural_note,'')))<8 or length(p_procedural_note)>500)
 then raise exception using errcode='22023',message='PROCEDURAL_NOTE_REQUIRED'; end if;
 if p_target_state='registered' then
   -- Eligibility and active organ status may have changed after submission.
   if not exists (select 1 from public.world_organization_memberships membership
      where membership.organization_id=v_measure.organization_id
        and membership.country_id=v_measure.sponsor_country_id
        and membership.ended_at is null and membership.status='member')
   then raise exception using errcode='23514',message='SPONSOR_NOT_MEMBER'; end if;
   if not exists (select 1 from public.world_organization_organs g
      join public.world_organizations o on o.id=g.organization_id
      where g.id=v_measure.organ_id and g.organization_id=v_measure.organization_id
        and g.status='active' and o.status='active')
   then raise exception using errcode='23514',message='INVALID_ORGAN'; end if;
   if v_measure.category_code is not null and not exists (
      select 1 from public.world_measure_categories category
      where category.organization_id=v_measure.organization_id
        and category.code=v_measure.category_code and category.active
        and (category.effective_from is null or category.effective_from<=now())
        and (category.effective_to is null or category.effective_to>now())
   ) then raise exception using errcode='22023',message='INVALID_CATEGORY'; end if;
   if nullif(btrim(p_identifier),'') is null or length(btrim(p_identifier))>160
   then raise exception using errcode='22023',message='IDENTIFIER_REQUIRED'; end if;
   select slug into v_slug from public.world_organizations where id=v_measure.organization_id;
   select upper(short_code) into v_sponsor_code from public.countries where id=v_measure.sponsor_country_id;
   if v_slug='guard' and (
     p_identifier !~ '^GAG\.[0-9]{4}\.[0-9]{1,6}\.[A-Z0-9]{2,12}\.[A-Z0-9]{2,12}\.[A-Za-z0-9][A-Za-z0-9 -]{0,70}$'
     or split_part(p_identifier,'.',4)<>v_sponsor_code
     or v_measure.category_code is null
     or split_part(p_identifier,'.',5)<>v_measure.category_code
   ) then raise exception using errcode='22023',message='INVALID_GAG_IDENTIFIER'; end if;
   update public.world_measure_versions
   set publication_state='published'
   where id=v_measure.current_version_id and measure_id=p_measure_id
     and publication_state='draft';
   if not found then raise exception using errcode='23514',message='VERSION_NOT_READY'; end if;
 end if;
 update public.world_measures set
   state=p_target_state,
   identifier=case when p_target_state='registered' then btrim(p_identifier) else identifier end,
   registered_at=case when p_target_state='registered' then now() else registered_at end,
   visibility=case when p_target_state='registered' then 'public' else visibility end,
   procedural_note=case when p_target_state='needs_correction' then btrim(p_procedural_note) else null end,
   revision=revision+1,updated_at=now()
 where id=p_measure_id;
 perform private.v3_emit_domain_event(
   case p_target_state when 'registered' then 'world.measure.registered'
     when 'needs_correction' then 'world.measure.correction_requested'
     else 'world.measure.review_started' end,
   'world_measure',p_measure_id::text,v_measure.revision+1,
   v_operation_id,null,null,jsonb_build_object(
     'measureId',p_measure_id,'from',v_measure.state,'to',p_target_state),
   1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'measureId',p_measure_id,
   'state',p_target_state,'revision',v_measure.revision+1,'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_result);
 return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',false);
end
$measure_review$;

-- A returned draft can be corrected without deleting or rewriting the original
-- submission. The immutable previous version survives the resubmission.
create or replace function public.world_measure_resubmit_v1(
 p_measure_id uuid,p_title text,p_full_text text,p_summary text,
 p_expected_revision bigint,p_operation_id uuid,p_idempotency_key text,
 p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $measure_resubmit$
declare
 v_measure public.world_measures%rowtype;v_claim jsonb;v_operation_id uuid;
 v_version_id uuid;v_version_number integer;v_result jsonb;
begin
 select * into v_measure from public.world_measures where id=p_measure_id for update;
 if v_measure.id is null or not public.world_access_allowed(
   'world.measure.submit',v_measure.organization_id,v_measure.sponsor_country_id,
   v_measure.organ_id,null,null)
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 if nullif(btrim(p_title),'') is null or length(btrim(p_title))>180 or
    nullif(btrim(p_full_text),'') is null or length(btrim(p_full_text))>25000 or
    length(coalesce(p_summary,''))>2000
 then raise exception using errcode='22023',message='VALIDATION'; end if;
 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.measure.resubmit','R2',
   jsonb_build_object('measureId',p_measure_id,'subjectType','world_measure'),
   jsonb_build_object('title',btrim(p_title),'body',p_full_text,
     'summary',p_summary,'expectedRevision',p_expected_revision)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',true);
 end if;
 if p_expected_revision is null or p_expected_revision<>v_measure.revision then
   raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
 if v_measure.state<>'needs_correction' then
   raise exception using errcode='23514',message='STATE_CHANGED'; end if;
 if not exists(select 1 from public.world_organization_memberships membership
   where membership.organization_id=v_measure.organization_id
     and membership.country_id=v_measure.sponsor_country_id
     and membership.ended_at is null and membership.status='member')
 then raise exception using errcode='23514',message='SPONSOR_NOT_MEMBER'; end if;
 select coalesce(max(version_number),0)+1 into v_version_number
 from public.world_measure_versions where measure_id=p_measure_id;
 insert into public.world_measure_versions(
   measure_id,version_number,title,full_text,summary,reason,
   supersedes_version_id,content_hash
 ) values(p_measure_id,v_version_number,btrim(p_title),btrim(p_full_text),
   nullif(btrim(coalesce(p_summary,'')),''),'procedural_correction',
   v_measure.current_version_id,
   encode(pg_catalog.sha256(pg_catalog.convert_to(
     btrim(p_title)||E'\n'||btrim(p_full_text)||E'\n'||
     coalesce(btrim(p_summary),''),'UTF8')),'hex'))
 returning id into v_version_id;
 update public.world_measures set current_version_id=v_version_id,
   title=btrim(p_title),state='submitted',procedural_note=null,
   revision=revision+1,updated_at=now()
 where id=p_measure_id;
 perform private.v3_emit_domain_event(
   'world.measure.resubmitted','world_measure',p_measure_id::text,
   v_measure.revision+1,v_operation_id,null,null,
   jsonb_build_object('measureId',p_measure_id,
     'versionId',v_version_id,'versionNumber',v_version_number),
   1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'measureId',p_measure_id,
   'versionId',v_version_id,'versionNumber',v_version_number,
   'state','submitted','revision',v_measure.revision+1,
   'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_result);
 return public.studio2_reconcile_operation(v_operation_id)||jsonb_build_object('replayed',false);
end
$measure_resubmit$;

revoke all on function public.world_measure_identity_guard_v1(),
  public.world_measure_version_immutable_v1(),
  public.world_measure_public_list_v1(text,integer),
  public.world_measure_public_detail_v1(uuid),
  public.world_measure_manage_v1(uuid),
  public.world_measure_submit_v1(uuid,uuid,uuid,text,text,text,text,text,uuid,text,uuid),
  public.world_measure_review_v1(uuid,text,text,text,bigint,uuid,text,uuid),
  public.world_measure_resubmit_v1(uuid,text,text,text,bigint,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.world_measure_public_list_v1(text,integer),
  public.world_measure_public_detail_v1(uuid) to anon,authenticated,service_role;
grant execute on function public.world_measure_manage_v1(uuid),
  public.world_measure_submit_v1(uuid,uuid,uuid,text,text,text,text,text,uuid,text,uuid),
  public.world_measure_review_v1(uuid,text,text,text,bigint,uuid,text,uuid),
  public.world_measure_resubmit_v1(uuid,text,text,text,bigint,uuid,text,uuid)
to authenticated;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg7.world-measure-submissions',1,'forward_fix_only',false,null,
     'Versioned institutional measures, member-authorized submission, procedural review and publication-only reads with immutable history.'
   );
 end if;
end
$contract$;

notify pgrst,'reload schema';
commit;

