begin;

-- TG7 amendment proposal and withdrawal only. No implicit adoption,
-- substitution into an official measure or independent voting authority.
create or replace function public.world_submit_measure_amendment_v1(
 p_measure_id uuid,
 p_sponsor_country_id uuid,
 p_base_version_id uuid,
 p_current_text text,
 p_proposed_text text,
 p_reasoning text,
 p_expected_measure_revision bigint,
 p_operation_id uuid,
 p_idempotency_key text,
 p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $submit_amendment$
declare
 v_measure public.world_measures%rowtype;
 v_base public.world_measure_versions%rowtype;
 v_old text:=btrim(coalesce(p_current_text,''));
 v_new text:=btrim(coalesce(p_proposed_text,''));
 v_reason text:=btrim(coalesce(p_reasoning,''));
 v_claim jsonb;
 v_operation_id uuid;
 v_amendment_id uuid;
 v_hash text;
 v_result jsonb;
begin
 if not coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
 then raise exception using errcode='25006',message='WORLD_AMENDMENTS_DISABLED'; end if;
 if auth.uid() is null or p_measure_id is null or p_sponsor_country_id is null
   or p_base_version_id is null or p_operation_id is null
   or p_expected_measure_revision is null or p_expected_measure_revision<1
   or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
   or length(v_old) not between 1 and 5000
   or length(v_new) not between 1 and 5000
   or v_old=v_new or length(v_reason) not between 8 and 3000
 then raise exception using errcode='22023',message='INVALID_AMENDMENT'; end if;

 -- This first textual slice cannot invent TG4 structured-provision identity.
 -- A future TG4-compatible workflow may populate target_provision_id.
 select * into v_measure from public.world_measures
 where id=p_measure_id for share;
 if v_measure.id is null or not public.world_access_allowed(
   'world.amendment.submit',v_measure.organization_id,
   p_sponsor_country_id,v_measure.organ_id,null,null)
 then raise exception using errcode='42501',message='AMENDMENT_AUTHORIZATION'; end if;
 perform 1 from public.country_accounts controller
 where controller.country_id=p_sponsor_country_id and controller.user_id=auth.uid()
   and controller.status='active'
 for share;
 if not found then raise exception using errcode='42501',message='CURRENT_COUNTRY_AUTHORITY_REQUIRED'; end if;
 perform 1 from public.world_organization_memberships member
 where member.organization_id=v_measure.organization_id
   and member.country_id=p_sponsor_country_id
   and member.status='member' and member.joined_at<=now()
   and member.ended_at is null for share;
 if not found then raise exception using errcode='23514',message='AMENDMENT_SPONSOR_NOT_MEMBER'; end if;

 v_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(
   p_measure_id::text||E'\n'||p_base_version_id::text||E'\n'||
   v_old||E'\n'||v_new||E'\n'||v_reason,'UTF8')),'hex');
 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.amendment.submit','R2',
   jsonb_build_object('subjectType','world_measure','measureId',p_measure_id,
     'organizationId',v_measure.organization_id,'countryId',p_sponsor_country_id,
     'organId',v_measure.organ_id),
   jsonb_build_object('baseVersionId',p_base_version_id,'expectedRevision',
     p_expected_measure_revision,'currentText',v_old,
     'proposedText',v_new,'reasoning',v_reason,'contentHash',v_hash)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
 end if;

 if v_measure.revision<>p_expected_measure_revision
   or v_measure.state not in ('registered','scheduled','under_debate')
   or v_measure.registered_at is null
   or v_measure.current_version_id<>p_base_version_id
 then raise exception using errcode='40001',message='AMENDMENT_BASE_VERSION_CHANGED'; end if;
 select * into v_base from public.world_measure_versions
 where id=p_base_version_id and measure_id=p_measure_id
   and publication_state='published';
 if v_base.id is null
 then raise exception using errcode='23514',message='UNPUBLISHED_BASE_VERSION'; end if;

 -- Deterministic exact-text amendment: no ambiguous multiple matches.
 if strpos(v_base.full_text,v_old)=0
   or strpos(substr(v_base.full_text,
      strpos(v_base.full_text,v_old)+length(v_old)),v_old)>0
 then raise exception using errcode='22023',message='AMENDMENT_TARGET_NOT_UNIQUE'; end if;

 insert into public.world_measure_amendments(
   measure_id,organization_id,sponsor_country_id,base_version_id,
   current_text,proposed_text,reasoning,state,submitted_by_user_id,content_hash
 ) values(p_measure_id,v_measure.organization_id,p_sponsor_country_id,
   p_base_version_id,v_old,v_new,v_reason,'proposed',auth.uid(),v_hash)
 returning id into v_amendment_id;

 perform private.v3_emit_domain_event(
   'world.amendment.proposed','world_measure_amendment',v_amendment_id::text,1,
   v_operation_id,null,null,
   jsonb_build_object('amendmentId',v_amendment_id,
     'measureId',p_measure_id,'organizationId',v_measure.organization_id,
     'sponsorCountryId',p_sponsor_country_id,'baseVersionId',p_base_version_id),
   1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'amendmentId',v_amendment_id,
   'measureId',p_measure_id,'status','proposed','revision',1,
   'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_result);
 return public.studio2_reconcile_operation(v_operation_id)
   ||jsonb_build_object('replayed',false);
end $submit_amendment$;

create or replace function public.world_withdraw_measure_amendment_v1(
 p_amendment_id uuid,
 p_expected_amendment_revision bigint,
 p_operation_id uuid,
 p_idempotency_key text,
 p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $withdraw_amendment$
declare
 v_amendment public.world_measure_amendments%rowtype;
 v_measure public.world_measures%rowtype;
 v_claim jsonb;
 v_operation_id uuid;
 v_result jsonb;
begin
 if not coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
 then raise exception using errcode='25006',message='WORLD_AMENDMENTS_DISABLED'; end if;
 if auth.uid() is null or p_amendment_id is null or p_operation_id is null
   or p_expected_amendment_revision is null or p_expected_amendment_revision<1
   or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
 then raise exception using errcode='22023',message='INVALID_AMENDMENT_WITHDRAWAL'; end if;
 select * into v_amendment from public.world_measure_amendments
 where id=p_amendment_id for update;
 if v_amendment.id is null then
   raise exception using errcode='42501',message='AMENDMENT_NOT_ACCESSIBLE'; end if;
 select * into v_measure from public.world_measures
 where id=v_amendment.measure_id for share;
 if v_measure.id is null or not public.world_access_allowed(
   'world.amendment.submit',v_amendment.organization_id,
   v_amendment.sponsor_country_id,v_measure.organ_id,null,null)
 then raise exception using errcode='42501',message='WITHDRAW_NOT_AUTHORIZED'; end if;
 perform 1 from public.country_accounts controller
 where controller.country_id=v_amendment.sponsor_country_id
  and controller.user_id=auth.uid() and controller.status='active' for share;
 if not found then raise exception using errcode='42501',message='CURRENT_SPONSOR_REQUIRED'; end if;

 v_claim:=private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.amendment.withdraw','R2',
   jsonb_build_object('subjectType','world_measure_amendment',
     'amendmentId',p_amendment_id,'measureId',v_amendment.measure_id,
     'organizationId',v_amendment.organization_id,
     'countryId',v_amendment.sponsor_country_id),
   jsonb_build_object('expectedRevision',p_expected_amendment_revision)
 );
 v_operation_id:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
 end if;
 if v_amendment.revision<>p_expected_amendment_revision
   or v_amendment.state<>'proposed'
   or v_measure.state not in ('registered','scheduled','under_debate')
   or v_measure.current_version_id<>v_amendment.base_version_id
 then raise exception using errcode='40001',message='AMENDMENT_NO_LONGER_WITHDRAWABLE'; end if;
 update public.world_measure_amendments
 set state='withdrawn',revision=revision+1,withdrawn_at=now()
 where id=p_amendment_id and revision=p_expected_amendment_revision
   and state='proposed';
 if not found then raise exception using errcode='40001',message='AMENDMENT_VERSION_CONFLICT'; end if;
 perform private.v3_emit_domain_event(
   'world.amendment.withdrawn','world_measure_amendment',p_amendment_id::text,
   v_amendment.revision+1,v_operation_id,null,null,
   jsonb_build_object('amendmentId',p_amendment_id,
      'measureId',v_amendment.measure_id,
      'organizationId',v_amendment.organization_id),
   1,array[]::text[]
 );
 v_result:=jsonb_build_object('ok',true,'amendmentId',p_amendment_id,
   'measureId',v_amendment.measure_id,'status','withdrawn',
   'revision',v_amendment.revision+1,'operationId',v_operation_id);
 perform private.studio2_complete_operation(v_operation_id,v_result);
 return public.studio2_reconcile_operation(v_operation_id)
   ||jsonb_build_object('replayed',false);
end $withdraw_amendment$;

revoke all on function public.world_submit_measure_amendment_v1(
 uuid,uuid,uuid,text,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_submit_measure_amendment_v1(
 uuid,uuid,uuid,text,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;
revoke all on function public.world_withdraw_measure_amendment_v1(
 uuid,bigint,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.world_withdraw_measure_amendment_v1(
 uuid,bigint,uuid,text,uuid) to authenticated,service_role;

commit;
