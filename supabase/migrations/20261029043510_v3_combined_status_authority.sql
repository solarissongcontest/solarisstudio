begin;
select public.v3_register_migration_contract('v3.televote.combined-status-authority',1,'forward_fix_only',false,null,'Govern Combined status changes with exact live actor, scope, state CAS, atomic audit and recoverable operation identity; official Results are unchanged.');
alter table televoting.televote_aggregations add column command_version bigint not null default 1 check(command_version>0);
create function private.v3_combined_command_version() returns trigger language plpgsql security definer set search_path=pg_catalog as $version$
begin new.command_version:=old.command_version+1; return new; end $version$;
revoke all on function private.v3_combined_command_version() from public,anon,authenticated,service_role;
create trigger v3_combined_command_version before update on televoting.televote_aggregations for each row execute function private.v3_combined_command_version();
create function televoting.v3_transition_combined_status(p_aggregation_id uuid,p_status text,p_expected_version bigint,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare a televoting.televote_aggregations%rowtype; v_edition uuid; v_claim jsonb; v_result jsonb;
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_status is null or p_status not in ('draft','calculated','locked','published') or (p_expected_version is null or p_expected_version<1) or p_operation_id is null then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into a from televoting.televote_aggregations where id=p_aggregation_id for update;
 if a.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=a.edition_id::text;
 -- Unbound custom aggregations require global authority. A mapped edition does
 -- not permit an operator from another edition to change its publication state.
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.transition_status','R2',jsonb_build_object('aggregationId',p_aggregation_id,'status',p_status,'expectedVersion',p_expected_version));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 if a.command_version is distinct from p_expected_version then raise exception 'Combined state changed after review' using errcode='40001'; end if;
 if a.status=p_status then return private.studio2_complete_operation(p_operation_id,jsonb_build_object('ok',true,'status',p_status,'aggregationId',p_aggregation_id)); end if;
 if p_status in ('locked','published') and (a.results_outdated or a.calculation_version=0) then raise exception 'Recalculate the combined result before locking or publishing it' using errcode='23514'; end if;
 update televoting.televote_aggregations set status=p_status,
 locked_at=case when p_status='locked' then clock_timestamp() else locked_at end,
 published_at=case when p_status='published' then clock_timestamp() else published_at end,
 updated_at=clock_timestamp() where id=p_aggregation_id;
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at)
 values('televoting','combined.status_changed','televote_aggregation',p_aggregation_id::text,jsonb_build_object('previousStatus',a.status,'status',p_status,'actor',auth.uid(),'operationId',p_operation_id),'completed',1,now(),now());
 v_result:=jsonb_build_object('ok',true,'status',p_status,'aggregationId',p_aggregation_id);
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_transition_combined_status(uuid,text,bigint,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_transition_combined_status(uuid,text,bigint,uuid,text) to authenticated;
commit;
