begin;
select public.v3_register_migration_contract('v3.televote.combined-creation-authority',1,'forward_fix_only',false,null,'Canonical scoped Combined creation with stable operation identity and exact committed-ID recovery; remove API INSERT on the aggregate and every column.');
create function televoting.v3_create_combined_aggregation(p_remote_edition_id uuid,p_name text,p_total_points integer,p_rank_exponent numeric,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare v_edition uuid; v_id uuid; v_claim jsonb; v_result jsonb; v_name text:=btrim(p_name);
begin
 perform private.v3_require_active_auth_session();
 if p_operation_id is null or nullif(v_name,'') is null or p_total_points is null or p_total_points<1 or p_rank_exponent is null or p_rank_exponent<=0 or p_rank_exponent::text in ('NaN','Infinity','-Infinity') then raise exception 'VALIDATION' using errcode='22023'; end if;
 if p_remote_edition_id is not null and not exists(select 1 from televoting.editions where id=p_remote_edition_id) then raise exception 'Televote edition not found' using errcode='P0002'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=p_remote_edition_id::text;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.create','R2',jsonb_build_object('remoteEditionId',p_remote_edition_id,'name',v_name,'totalPoints',p_total_points,'rankExponent',p_rank_exponent));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 insert into televoting.televote_aggregations(edition_id,name,combination_method,total_points_to_distribute,rank_exponent,status,calculation_version,results_outdated,broadcast_display_mode)
 values(p_remote_edition_id,v_name,'component_pool',p_total_points,p_rank_exponent,'draft',0,true,'combined') returning id into v_id;
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at)
 values('televoting','combined.created','televote_aggregation',v_id::text,jsonb_build_object('name',v_name,'actor',auth.uid(),'operationId',p_operation_id),'completed',1,now(),now());
 v_result:=jsonb_build_object('id',v_id);
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_create_combined_aggregation(uuid,text,integer,numeric,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_create_combined_aggregation(uuid,text,integer,numeric,uuid,text) to authenticated;
revoke insert on televoting.televote_aggregations from public,anon,authenticated,service_role;
do $columns$
declare c text;
begin
 for c in select attname from pg_attribute where attrelid='televoting.televote_aggregations'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke insert(%I) on televoting.televote_aggregations from public,anon,authenticated,service_role',c);
 end loop;
end $columns$;
commit;
