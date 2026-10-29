begin;
select public.v3_register_migration_contract('v3.televote.combined-lineup-authority',1,'forward_fix_only',false,null,'Atomically reconcile Combined participants from one bound Solaris show; validate live actor, reviewed state and stable retry identity without changing official Results.');
create function televoting.v3_reconcile_combined_lineup(
 p_aggregation_id uuid,p_expected_updated_at timestamptz,p_expected_participants text[],p_operation_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare
 v_aggregation televoting.televote_aggregations%rowtype; v_edition uuid; v_show uuid;
 v_targets integer; v_sources integer; v_bound integer; v_codes text[]; v_previous text[];
 v_claim jsonb; v_result jsonb; v_key text;
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_expected_updated_at is null or p_expected_participants is null or p_operation_id is null then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into v_aggregation from televoting.televote_aggregations where id=p_aggregation_id for update;
 if v_aggregation.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 -- A Combined aggregation is not an official Results binding. Only sources
 -- unanimously bound to one real show can confer this reconciliation scope.
 select count(*),count(b.show_id),count(distinct (b.edition_id,b.show_id)),min(b.edition_id::text)::uuid,min(b.show_id::text)::uuid
 into v_sources,v_bound,v_targets,v_edition,v_show
 from televoting.televote_aggregation_sources s left join public.televoting_round_bindings b on b.remote_round_id=s.source_round_id::text
 where s.aggregation_id=p_aggregation_id and s.enabled;
 if v_sources=0 or v_sources<>v_bound or v_targets<>1 or not exists(select 1 from public.shows where id=v_show and edition_id=v_edition) then raise exception 'Ambiguous Combined source scope' using errcode='23514'; end if;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.reconcile_lineup','R2',jsonb_build_object('aggregationId',p_aggregation_id,'expectedUpdatedAt',p_expected_updated_at,'expectedParticipants',p_expected_participants));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 if v_aggregation.status in ('locked','published') then raise exception 'Combined lineup is immutable' using errcode='23514'; end if;
 select coalesce(array_agg(country_code order by display_order),'{}') into v_previous from televoting.televote_aggregation_participants where aggregation_id=p_aggregation_id;
 if v_aggregation.updated_at is distinct from p_expected_updated_at or v_previous is distinct from p_expected_participants then raise exception 'Combined lineup changed after review' using errcode='40001'; end if;
 if exists(select 1 from public.participants p left join public.countries c on c.id=p.country_id where p.show_id=v_show and p.country_id is not null and (p.participation_status is null or p.participation_status='confirmed') and nullif(btrim(c.short_code),'') is null) then raise exception 'Missing canonical country code' using errcode='23514'; end if;
 select coalesce(array_agg(upper(btrim(c.short_code)) order by p.running_order nulls last,p.id),'{}') into v_codes
 from public.participants p join public.countries c on c.id=p.country_id where p.show_id=v_show and (p.participation_status is null or p.participation_status='confirmed');
 if cardinality(v_codes)<>(select count(distinct code) from unnest(v_codes)code) then raise exception 'Duplicate canonical country code' using errcode='23514'; end if;
 if v_previous is distinct from v_codes then
  delete from televoting.televote_aggregation_participants where aggregation_id=p_aggregation_id;
  insert into televoting.televote_aggregation_participants(aggregation_id,country_code,display_order)
   select p_aggregation_id,code,(ordinality-1)::integer from unnest(v_codes)with ordinality t(code,ordinality);
  update televoting.televote_aggregations set results_outdated=calculation_version>0,updated_at=clock_timestamp() where id=p_aggregation_id;
 end if;
 v_result:=jsonb_build_object('aggregationId',p_aggregation_id,'status',case when v_previous=v_codes then 'up_to_date' else 'synced' end,'editionId',v_edition,'showId',v_show,'participantCount',cardinality(v_codes));
 insert into public.integration_events(service,event_type,entity_type,entity_id,remote_id,payload,status,attempts,completed_at,updated_at)
 values('televoting','combined.participants.autosynced','show',v_show,p_aggregation_id::text,jsonb_build_object('edition_id',v_edition,'previous',v_previous,'participants',v_codes,'operation_id',p_operation_id),'completed',1,now(),now());
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_reconcile_combined_lineup(uuid,timestamptz,text[],uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_reconcile_combined_lineup(uuid,timestamptz,text[],uuid,text) to authenticated;
commit;
