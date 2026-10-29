begin;
select public.v3_register_migration_contract('v3.televote.combined-source-authority',1,'forward_fix_only',false,null,'Atomic Combined participant, source and manual score edits with live scope, version CAS and replayable receipts.');
create function televoting.v3_manage_combined_sources(p_aggregation_id uuid,p_action text,p_payload jsonb,p_expected_version bigint,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare
 a televoting.televote_aggregations%rowtype; v_edition uuid; v_claim jsonb; v_result jsonb;
 v_source uuid; v_round uuid; v_target uuid; v_item record;
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_expected_version is null or p_expected_version<1 or p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or p_action is null or p_action not in ('participants','source','delete_source','values') then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into a from televoting.televote_aggregations where id=p_aggregation_id for update;
 if a.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=a.edition_id::text;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.manage_sources','R2',jsonb_build_object('aggregationId',p_aggregation_id,'action',p_action,'payload',p_payload,'expectedVersion',p_expected_version));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 if a.command_version<>p_expected_version then raise exception 'Combined inputs changed after review' using errcode='40001'; end if;
 if a.status not in ('draft','calculated') then raise exception 'Locked or published Combined inputs are immutable' using errcode='23514'; end if;
 if p_action='participants' then
  -- Linked canonical show lineups must use the existing reconciliation authority.
  if exists(select 1 from televoting.televote_aggregation_sources s join public.televoting_round_bindings b on b.remote_round_id=s.source_round_id::text where s.aggregation_id=a.id and s.enabled) then raise exception 'Participants are managed by the linked Solaris show' using errcode='23514'; end if;
  if jsonb_typeof(p_payload->'participants') is distinct from 'array' then raise exception 'VALIDATION' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'participants') c where jsonb_typeof(c)<>'string' or nullif(btrim(c#>>'{}'),'') is null) or (select count(*)<>count(distinct c) from jsonb_array_elements_text(p_payload->'participants') c) then raise exception 'Invalid or duplicate participant' using errcode='22023'; end if;
  delete from televoting.televote_aggregation_participants where aggregation_id=a.id;
  insert into televoting.televote_aggregation_participants(aggregation_id,country_code,display_order) select a.id,code,(ordinality-1)::integer from jsonb_array_elements_text(p_payload->'participants') with ordinality t(code,ordinality);
 elsif p_action='source' then
  v_source:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
  v_round:=(p_payload->>'roundId')::uuid; v_target:=(p_payload->>'correctionTargetSourceId')::uuid;
  if p_payload->>'id' is not null and not exists(select 1 from televoting.televote_aggregation_sources where id=v_source and aggregation_id=a.id) then raise exception 'Source scope mismatch' using errcode='42501'; end if;
  if v_round is not null and not exists(select 1 from televoting.rounds where id=v_round and (a.edition_id is null or edition_id=a.edition_id)) then raise exception 'Round scope mismatch' using errcode='42501'; end if;
  if v_target is not null and (v_target=v_source or not exists(select 1 from televoting.televote_aggregation_sources where id=v_target and aggregation_id=a.id)) then raise exception 'Correction scope mismatch' using errcode='42501'; end if;
  if nullif(btrim(p_payload->>'name'),'') is null or coalesce(p_payload->>'inputMode','') not in ('raw_results','converted_points','activity_points','correction') or coalesce(p_payload->>'correctionScope','final') not in ('final','source') or (p_payload->>'weight')::numeric<0 or (p_payload->>'weight')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid source' using errcode='22023'; end if;
  insert into televoting.televote_aggregation_sources(id,aggregation_id,source_type,input_mode,source_round_id,source_name,calculation_stage,calculation_method,percentage_weight,weight,enabled,display_order,correction_scope,correction_target_source_id)
  values(v_source,a.id,p_payload->>'sourceType',p_payload->>'inputMode',v_round,btrim(p_payload->>'name'),case when p_payload->>'inputMode'='correction' then 'post_conversion' else 'pre_conversion' end,p_payload->>'inputMode',case when p_payload->>'inputMode'='correction' then 0 else (p_payload->>'weight')::numeric end,case when p_payload->>'inputMode'='correction' then 0 else (p_payload->>'weight')::numeric end,(p_payload->>'enabled')::boolean,(p_payload->>'displayOrder')::integer,coalesce(p_payload->>'correctionScope','final'),v_target)
  on conflict(id) do update set source_type=excluded.source_type,input_mode=excluded.input_mode,source_round_id=excluded.source_round_id,source_name=excluded.source_name,calculation_stage=excluded.calculation_stage,calculation_method=excluded.calculation_method,percentage_weight=excluded.percentage_weight,weight=excluded.weight,enabled=excluded.enabled,display_order=excluded.display_order,correction_scope=excluded.correction_scope,correction_target_source_id=excluded.correction_target_source_id;
 else
  v_source:=(p_payload->>'sourceId')::uuid;
  if not exists(select 1 from televoting.televote_aggregation_sources where id=v_source and aggregation_id=a.id) then raise exception 'Source scope mismatch' using errcode='42501'; end if;
  if p_action='delete_source' then
   delete from televoting.televote_aggregation_sources where id=v_source and aggregation_id=a.id;
  else
   if exists(select 1 from televoting.televote_aggregation_sources where id=v_source and source_round_id is not null) then raise exception 'Linked round scores cannot be edited manually' using errcode='23514'; end if;
   if jsonb_typeof(p_payload->'values') is distinct from 'object' then raise exception 'Invalid scores' using errcode='22023'; end if;
   for v_item in select key,value from jsonb_each(p_payload->'values') loop
    if jsonb_typeof(v_item.value)<>'number' or (v_item.value#>>'{}')::numeric::text in ('NaN','Infinity','-Infinity') or not exists(select 1 from televoting.televote_aggregation_participants where aggregation_id=a.id and country_code=v_item.key) then raise exception 'Invalid participant score' using errcode='22023'; end if;
   end loop;
   delete from televoting.external_score_entries where source_id=v_source;
   insert into televoting.external_score_entries(source_id,country_code,value) select v_source,key,(value#>>'{}')::numeric from jsonb_each(p_payload->'values') where (value#>>'{}')::numeric<>0;
  end if;
 end if;
 update televoting.televote_aggregations set results_outdated=true where id=a.id;
 select command_version into a.command_version from televoting.televote_aggregations where id=a.id;
 v_result:=jsonb_build_object('ok',true,'id',v_source,'aggregationId',a.id,'version',a.command_version);
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at)
 values('televoting','combined.inputs_changed','televote_aggregation',a.id::text,jsonb_build_object('actor',auth.uid(),'operationId',p_operation_id,'action',p_action,'request',p_payload,'version',a.command_version),'completed',1,now(),now());
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_manage_combined_sources(uuid,text,jsonb,bigint,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_manage_combined_sources(uuid,text,jsonb,bigint,uuid,text) to authenticated;
commit;
