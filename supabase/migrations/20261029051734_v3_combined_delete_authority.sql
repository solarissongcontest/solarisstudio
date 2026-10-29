begin;
select public.v3_register_migration_contract('v3.televote.combined-delete-authority',1,'forward_fix_only',false,null,'Replace the multi-write Combined delete with one live actor, scoped, versioned, receipted transaction; preserve published snapshots and retain deletion recovery after the aggregate is gone.');
create function televoting.v3_delete_combined_aggregation(p_aggregation_id uuid,p_remote_edition_id uuid,p_expected_version bigint,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare a televoting.televote_aggregations%rowtype; v_edition uuid; v_claim jsonb; v_result jsonb;
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_expected_version is null or p_expected_version<1 or p_operation_id is null then raise exception 'VALIDATION' using errcode='22023'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=p_remote_edition_id::text;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.delete','R3',jsonb_build_object('aggregationId',p_aggregation_id,'remoteEditionId',p_remote_edition_id,'expectedVersion',p_expected_version));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 select * into a from televoting.televote_aggregations where id=p_aggregation_id for update;
 if a.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 if a.command_version<>p_expected_version or a.edition_id is distinct from p_remote_edition_id then raise exception 'Combined state changed after delete review' using errcode='40001'; end if;
 if a.status='published' then raise exception 'Published combined results cannot be deleted' using errcode='23514'; end if;
 -- Every dependent store has an ON DELETE CASCADE FK. Delete parent once;
 -- a dependent failure or audit/receipt failure rolls back the entire operation.
 delete from televoting.televote_aggregations where id=p_aggregation_id;
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at)
 values('televoting','combined.deleted','televote_aggregation',p_aggregation_id::text,jsonb_build_object('name',a.name,'previousStatus',a.status,'version',a.command_version,'actor',auth.uid(),'operationId',p_operation_id),'completed',1,now(),now());
 v_result:=jsonb_build_object('ok',true,'aggregationId',p_aggregation_id,'editionId',v_edition);
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_delete_combined_aggregation(uuid,uuid,bigint,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_delete_combined_aggregation(uuid,uuid,bigint,uuid,text) to authenticated;
revoke delete,truncate on televoting.televote_aggregations from public,anon,authenticated,service_role;
commit;
