begin;
-- WORLD-06 TG9: materialization of an official resolution ONLY from a
-- frozen TG8 certified passed vote. Never a second voting or tally engine.
insert into public.studio2_capabilities (key,domain,label,description,access_level)
values ('world.resolution.publish','world','Publish certified resolution',
        'Materialize adopted formal text from an immutable certified vote and source measure version.','approve')
on conflict (key) do nothing;

-- Executive institutional publisher permission, not global Organizer power.
-- Other institutions configure their own officer capabilities explicitly.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id,'world.resolution.publish'
from public.world_organization_offices office_row
join public.world_organizations org on org.id=office_row.organization_id
where (org.slug='guard' and office_row.slug in ('chairperson','deputy-chairperson'))
   or (org.slug='unity' and office_row.slug in ('secretary-general','deputy-secretary-general'))
on conflict do nothing;

create table public.world_resolutions (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 organization_id uuid not null references public.world_organizations(id) on delete restrict,
 organ_id uuid not null references public.world_organization_organs(id) on delete restrict,
 identifier text not null check(length(btrim(identifier)) between 6 and 180),
 source_measure_id uuid not null unique references public.world_measures(id) on delete restrict,
 adopted_version_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 180),
 text text not null check(length(btrim(text)) between 1 and 25000),
 adopted_at timestamptz not null,
 effective_at timestamptz,
 status text not null default 'adopted' check (
   status in ('adopted','effective','superseded','repealed','expired')
 ),
 vote_id uuid not null unique references public.world_votes(id) on delete restrict,
 certification_hash text not null check(certification_hash ~ '^[0-9a-f]{64}$'),
 revision bigint not null default 1 check(revision>=1),
 publication_operation_id uuid not null unique,
 created_at timestamptz not null default now(),
 constraint world_resolution_version_measure_fk
   foreign key(adopted_version_id,source_measure_id)
   references public.world_measure_versions(id,measure_id) on delete restrict,
 constraint world_resolution_effect_not_before_adoption_check
   check(effective_at is null or effective_at >= adopted_at),
 unique(organization_id,identifier)
);
create index world_resolutions_org_adopted_idx
 on public.world_resolutions(organization_id,adopted_at desc,id);

-- No direct DML, including service_role: the SECURITY DEFINER command below
-- is the only canonical new-resolution writer. In later TG9 slices, status
-- changes require a distinct governed, history-logged transition command.
alter table public.world_resolutions enable row level security;
revoke all on public.world_resolutions from public,anon,authenticated,service_role;
create function private.world_resolution_immutable_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
 raise exception using errcode='23514',message='IMMUTABLE_CERTIFIED_RESOLUTION';
end
$immutable$;
create trigger world_resolution_immutable
before update or delete on public.world_resolutions
for each row execute function private.world_resolution_immutable_v1();
revoke all on function private.world_resolution_immutable_v1()
from public,anon,authenticated,service_role;

create function public.world_materialize_certified_resolution_v1(
 p_vote_id uuid,p_expected_measure_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $materialize$
declare
 v_vote public.world_votes%rowtype;
 v_result public.world_vote_results%rowtype;
 v_measure public.world_measures%rowtype;
 v_version public.world_measure_versions%rowtype;
 v_claim jsonb;
 v_operation_id uuid;
 v_id uuid;
 v_identifier text;
 v_receipt jsonb;
begin
 if auth.uid() is null or p_vote_id is null or p_expected_measure_revision is null
    or p_operation_id is null or length(btrim(coalesce(p_idempotency_key,'')))<8
 then raise exception using errcode='22023',message='VALIDATION'; end if;

 -- TG8 authoritative availability, not a CSS or client-side gate.
 if not (
   coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false)
   and coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
 ) then raise exception using errcode='25006',message='VOTING_UNAVAILABLE'; end if;

 select * into v_vote from public.world_votes where id=p_vote_id for update;
 if v_vote.id is null or not public.world_access_allowed(
   'world.resolution.publish',v_vote.organization_id,null,v_vote.organ_id,null,null
 ) then raise exception using errcode='42501',message='RESOLUTION_AUTHORIZATION'; end if;

 -- A certified vote is the only lawful adoption source. Never reconstruct
 -- quorum, ballots or thresholds on the client or in a duplicate TG9 tally.
 if v_vote.status<>'certified' then
   raise exception using errcode='23514',message='VOTE_NOT_CERTIFIED'; end if;
 select * into v_result from public.world_vote_results
 where vote_id=p_vote_id;
 if v_result.vote_id is null
    or v_result.organization_id<>v_vote.organization_id
    or v_result.measure_id<>v_vote.measure_id
    or v_result.outcome<>'passed'
    or not v_result.quorum_met or not v_result.threshold_met
    or v_vote.certified_at is distinct from v_result.certified_at
 then raise exception using errcode='23514',message='VOTE_NOT_ADOPTED'; end if;

 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.resolution.publish','R2',
   jsonb_build_object('subjectType','world_resolution',
     'voteId',p_vote_id,'organizationId',v_vote.organization_id,
     'measureId',v_vote.measure_id),
   jsonb_build_object('voteId',p_vote_id,
     'expectedMeasureRevision',p_expected_measure_revision)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id) ||
     jsonb_build_object('replayed',true);
 end if;

 select * into v_measure from public.world_measures
 where id=v_vote.measure_id for update;
 if v_measure.id is null or v_measure.organization_id<>v_vote.organization_id
    or v_measure.organ_id<>v_vote.organ_id
    or v_measure.state<>'adopted'
    or v_measure.revision<>p_expected_measure_revision
    or v_measure.current_version_id<>v_vote.measure_version_id
    or v_measure.visibility<>'public'
    or v_measure.registered_at is null or v_measure.identifier is null
    or v_measure.measure_type not in ('draft_resolution','proposal','bill','motion')
 then raise exception using errcode='40001',message='MEASURE_STATE_CHANGED'; end if;
 if not exists(
   select 1 from public.world_organizations org
   join public.world_organization_organs organ on organ.organization_id=org.id
   where org.id=v_vote.organization_id and organ.id=v_vote.organ_id
     and org.status in ('active','recognized')
     and org.public_visibility='public'
     and organ.visibility='public' and organ.status='active'
 ) then raise exception using errcode='42501',message='ORGANIZATION_NOT_PUBLISHABLE'; end if;

 select * into v_version from public.world_measure_versions
 where id=v_vote.measure_version_id and measure_id=v_vote.measure_id;
 if v_version.id is null or v_version.publication_state<>'published' then
   raise exception using errcode='42501',message='SOURCE_VERSION_UNPUBLISHED'; end if;

 if exists(select 1 from public.world_resolutions r
           where r.vote_id=p_vote_id or r.source_measure_id=v_vote.measure_id) then
   raise exception using errcode='40001',message='RESOLUTION_ALREADY_MATERIALIZED'; end if;
 v_identifier:=v_measure.identifier||'/RES';
 insert into public.world_resolutions(
   organization_id,organ_id,identifier,source_measure_id,adopted_version_id,
   title,text,adopted_at,effective_at,status,vote_id,certification_hash,
   revision,publication_operation_id
 ) values(
   v_vote.organization_id,v_vote.organ_id,v_identifier,v_vote.measure_id,
   v_version.id,v_version.title,v_version.full_text,v_result.certified_at,
   null,'adopted',p_vote_id,v_result.result_hash,1,v_operation_id
 ) returning id into v_id;

 perform private.v3_emit_domain_event(
   'world.resolution.adopted','world_resolution',v_id::text,1,
   v_operation_id,null,null,jsonb_build_object(
     'organizationId',v_vote.organization_id,'organId',v_vote.organ_id,
     'resolutionId',v_id,'measureId',v_measure.id,'voteId',p_vote_id,
     'resultHash',v_result.result_hash,'adoptedAt',v_result.certified_at
   ),1,array[]::text[]
 );
 v_receipt:=jsonb_build_object('ok',true,'resolutionId',v_id,
   'voteId',p_vote_id,'sourceMeasureId',v_measure.id,'identifier',v_identifier,
   'status','adopted','revision',1,'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_receipt);
 return public.studio2_reconcile_operation(v_operation_id) ||
   jsonb_build_object('replayed',false);
end
$materialize$;
revoke all on function public.world_materialize_certified_resolution_v1(
 uuid,bigint,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.world_materialize_certified_resolution_v1(
 uuid,bigint,uuid,text,uuid) to authenticated,service_role;

-- Public official resolutions are read through this RPC, not raw table grants.
-- A later privacy or source publication change must immediately suppress them.
create function public.world_public_resolutions_v1(
 p_organization_slug text,p_limit integer default 20
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $public_list$
 select case when
   coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
   and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false)
   and coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
 then coalesce(jsonb_agg(jsonb_build_object(
   'id',rows.id,'identifier',rows.identifier,'title',rows.title,
   'organizationSlug',rows.slug,'organizationName',rows.short_name,
   'status',rows.status,'adoptedAt',rows.adopted_at,
   'voteId',rows.vote_id,'measureId',rows.source_measure_id,
   'resultHash',rows.certification_hash
 ) order by rows.adopted_at desc,rows.id desc),'[]'::jsonb)
 else '[]'::jsonb end
 from (
   select r.id,r.identifier,r.title,r.status,r.adopted_at,r.vote_id,
          r.source_measure_id,r.certification_hash,org.slug,org.short_name
   from public.world_resolutions r
   join public.world_organizations org on org.id=r.organization_id
   join public.world_organization_organs organ on organ.id=r.organ_id
     and organ.organization_id=org.id
   join public.world_measures m on m.id=r.source_measure_id
   join public.world_measure_versions v on v.id=r.adopted_version_id
     and v.measure_id=m.id
   join public.world_votes vote on vote.id=r.vote_id
   join public.world_vote_results result on result.vote_id=vote.id
   where org.slug=lower(btrim(p_organization_slug))
     and org.public_visibility='public'
     and org.status in ('active','recognized','suspended','historical')
     and organ.visibility='public'
     and m.visibility='public' and v.publication_state='published'
     and vote.status='certified' and result.outcome='passed'
     and result.result_hash=r.certification_hash
   order by r.adopted_at desc,r.id desc
   limit least(greatest(coalesce(p_limit,20),1),30)
 ) rows
$public_list$;
revoke all on function public.world_public_resolutions_v1(text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.world_public_resolutions_v1(text,integer)
 to anon,authenticated,service_role;

create function public.world_public_resolution_v1(p_resolution_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $public_detail$
 select case when
   coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
   and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false)
   and coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
 then (
   select jsonb_build_object(
     'id',r.id,'identifier',r.identifier,'title',r.title,'text',r.text,
     'organizationSlug',org.slug,'organizationName',org.short_name,
     'status',r.status,'adoptedAt',r.adopted_at,'effectiveAt',r.effective_at,
     'voteId',r.vote_id,'sourceMeasureId',r.source_measure_id,
     'adoptedVersionId',r.adopted_version_id,
     'sourceVersionHash',v.content_hash,'resultHash',r.certification_hash,
     'revision',r.revision
   )
   from public.world_resolutions r
   join public.world_organizations org on org.id=r.organization_id
   join public.world_organization_organs organ on organ.id=r.organ_id
     and organ.organization_id=org.id
   join public.world_measures m on m.id=r.source_measure_id
   join public.world_measure_versions v on v.id=r.adopted_version_id
     and v.measure_id=m.id
   join public.world_votes vote on vote.id=r.vote_id
   join public.world_vote_results result on result.vote_id=vote.id
   where r.id=p_resolution_id
     and org.public_visibility='public'
     and org.status in ('active','recognized','suspended','historical')
     and organ.visibility='public'
     and m.visibility='public' and v.publication_state='published'
     and vote.status='certified' and result.outcome='passed'
     and result.result_hash=r.certification_hash
 ) else null::jsonb end
$public_detail$;
revoke all on function public.world_public_resolution_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_public_resolution_v1(uuid)
 to anon,authenticated,service_role;


-- Private publisher preview. Source text is read from the frozen TG7 version,
-- never from a browser-supplied adoption. No ballot choices are included.
create function public.world_resolution_candidate_v1(p_vote_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $candidate$
declare
 v_vote public.world_votes%rowtype;
 v_measure public.world_measures%rowtype;
 v_version public.world_measure_versions%rowtype;
 v_result public.world_vote_results%rowtype;
begin
 if auth.uid() is null or p_vote_id is null
    or not coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false)
    or not coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
 then raise exception using errcode='42501',message='RESOLUTION_PREVIEW_UNAVAILABLE'; end if;
 select * into v_vote from public.world_votes where id=p_vote_id;
 if v_vote.id is null or not public.world_access_allowed(
   'world.resolution.publish',v_vote.organization_id,null,v_vote.organ_id,null,null)
 then raise exception using errcode='42501',message='RESOLUTION_AUTHORIZATION'; end if;
 select * into v_result from public.world_vote_results where vote_id=v_vote.id;
 select * into v_measure from public.world_measures where id=v_vote.measure_id;
 select * into v_version from public.world_measure_versions where id=v_vote.measure_version_id;
 if v_vote.status<>'certified' or v_result.vote_id is null
    or v_result.outcome<>'passed' or not v_result.quorum_met or not v_result.threshold_met
    or v_result.organization_id<>v_vote.organization_id
    or v_result.measure_id<>v_vote.measure_id
    or v_result.certified_at is distinct from v_vote.certified_at
    or v_measure.id is null or v_measure.state<>'adopted'
    or v_measure.organization_id<>v_vote.organization_id
    or v_measure.organ_id<>v_vote.organ_id
    or v_measure.current_version_id<>v_vote.measure_version_id
    or v_measure.visibility<>'public' or v_measure.identifier is null
    or v_measure.registered_at is null
    or v_measure.measure_type not in ('draft_resolution','proposal','bill','motion')
    or v_version.id is null or v_version.measure_id<>v_measure.id
    or v_version.publication_state<>'published'
    or exists(select 1 from public.world_resolutions r where r.vote_id=v_vote.id)
    or not exists (
       select 1 from public.world_organizations org
       join public.world_organization_organs organ on organ.organization_id=org.id
       where org.id=v_vote.organization_id and organ.id=v_vote.organ_id
         and org.status in ('active','recognized') and org.public_visibility='public'
         and organ.visibility='public' and organ.status='active'
    )
 then return null; end if;
 return jsonb_build_object(
   'voteId',v_vote.id,'measureId',v_measure.id,
   'identifier',v_measure.identifier||'/RES',
   'title',v_version.title,'text',v_version.full_text,
   'expectedMeasureRevision',v_measure.revision,
   'resultHash',v_result.result_hash,'certifiedAt',v_result.certified_at,
   'organizationId',v_vote.organization_id
 );
end
$candidate$;
revoke all on function public.world_resolution_candidate_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_resolution_candidate_v1(uuid)
 to authenticated,service_role;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg9.certified-resolutions',1,'forward_fix_only',false,null,
     'Materialize one immutable official adopted resolution from TG8 passed certification and frozen published TG7 measure version; no vote/tally duplication.'
   );
 end if;
end
$contract$;
notify pgrst,'reload schema';
commit;
