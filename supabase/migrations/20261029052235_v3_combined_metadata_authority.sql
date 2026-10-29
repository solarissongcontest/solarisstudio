begin;
select public.v3_register_migration_contract('v3.televote.combined-metadata-authority',1,'forward_fix_only',false,null,'Replace raw Combined settings edits with reviewed command-version CAS, exact request replay and live scoped actor authority; frozen aggregates cannot be edited.');
create function televoting.v3_update_combined_metadata(p_aggregation_id uuid,p_expected_version bigint,p_name text,p_total_points integer,p_rank_exponent numeric,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare a televoting.televote_aggregations%rowtype; v_edition uuid; v_claim jsonb; v_result jsonb; v_name text:=btrim(p_name);
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_expected_version is null or p_expected_version<1 or p_operation_id is null or nullif(v_name,'') is null or p_total_points is null or p_total_points<1 or p_rank_exponent is null or p_rank_exponent<=0 or p_rank_exponent::text in ('NaN','Infinity','-Infinity') then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into a from televoting.televote_aggregations where id=p_aggregation_id for update;
 if a.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=a.edition_id::text;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.update_metadata','R2',jsonb_build_object('aggregationId',p_aggregation_id,'expectedVersion',p_expected_version,'name',v_name,'totalPoints',p_total_points,'rankExponent',p_rank_exponent));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 if a.command_version<>p_expected_version then raise exception 'Combined settings changed after review' using errcode='40001'; end if;
 if a.status not in ('draft','calculated') then raise exception 'Locked or published Combined settings are immutable' using errcode='23514'; end if;
 if (a.name,a.total_points_to_distribute,a.rank_exponent) is distinct from (v_name,p_total_points,p_rank_exponent) then
  update televoting.televote_aggregations set name=v_name,total_points_to_distribute=p_total_points,rank_exponent=p_rank_exponent,results_outdated=true where id=p_aggregation_id;
  insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at)
  values('televoting','combined.settings_changed','televote_aggregation',p_aggregation_id::text,jsonb_build_object('actor',auth.uid(),'operationId',p_operation_id,'before',jsonb_build_object('name',a.name,'totalPoints',a.total_points_to_distribute,'rankExponent',a.rank_exponent),'after',jsonb_build_object('name',v_name,'totalPoints',p_total_points,'rankExponent',p_rank_exponent)),'completed',1,now(),now());
 end if;
 select command_version into a.command_version from televoting.televote_aggregations where id=p_aggregation_id;
 v_result:=jsonb_build_object('ok',true,'aggregationId',p_aggregation_id,'version',a.command_version);
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_update_combined_metadata(uuid,bigint,text,integer,numeric,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_update_combined_metadata(uuid,bigint,text,integer,numeric,uuid,text) to authenticated;
commit;
