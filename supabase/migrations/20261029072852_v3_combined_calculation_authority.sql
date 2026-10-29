begin;
select public.v3_register_migration_contract('v3.televote.combined-calculation-authority',1,'forward_fix_only',false,null,'Database-derived atomic Combined component-pool calculation with CAS, active actor and recoverable receipt.');

-- Compare countback evidence numerically (jsonb array ordering compares length
-- first, which is wrong for score distributions such as [10] vs [5,5]).
create function private.v3_combined_distribution_compare(a jsonb,b jsonb) returns integer
language plpgsql immutable set search_path=pg_catalog as $$
declare x double precision; y double precision; i integer;
begin
 if a is null or b is null or a='null'::jsonb or b='null'::jsonb or jsonb_array_length(a)=0 or jsonb_array_length(b)=0 then return 0; end if;
 for i in 0..greatest(jsonb_array_length(a),jsonb_array_length(b))-1 loop
  x:=coalesce((a->>i)::double precision,'-Infinity'::double precision); y:=coalesce((b->>i)::double precision,'-Infinity'::double precision);
  if x<>y then return case when x>y then -1 else 1 end; end if;
 end loop;
 return 0;
end $$;
revoke all on function private.v3_combined_distribution_compare(jsonb,jsonb) from public,anon,authenticated,service_role;
create function private.v3_combined_countback(a jsonb,b jsonb) returns integer
language plpgsql immutable set search_path=pg_catalog,private as $$
declare k text; i integer; diff integer; x numeric; y numeric;
begin
 foreach k in array array['points','allocated','voting','activity','raw_scores','distributions','display_order'] loop
  if k in ('allocated','raw_scores','distributions') then
   for i in 0..coalesce(jsonb_array_length(a->k),0)-1 loop
    if k='distributions' then diff:=private.v3_combined_distribution_compare(a->k->i,b->k->i);
    else x:=(a->k->>i)::numeric; y:=(b->k->>i)::numeric; diff:=case when x>y then -1 when x<y then 1 else 0 end; end if;
    if diff<>0 then return diff; end if;
   end loop;
  else
   x:=(a->>k)::numeric; y:=(b->>k)::numeric;
   if x<>y then return case when (x>y)=(k<>'display_order') then -1 else 1 end; end if;
  end if;
 end loop;
 return case when a->>'country_code'<b->>'country_code' then -1 when a->>'country_code'>b->>'country_code' then 1 else 0 end;
end $$;
revoke all on function private.v3_combined_countback(jsonb,jsonb) from public,anon,authenticated,service_role;

create function televoting.v3_calculate_combined(p_aggregation_id uuid,p_expected_version bigint,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting
as $command$
declare
 a televoting.televote_aggregations%rowtype; v_edition uuid; v_claim jsonb; v_result jsonb;
 v_version integer; v_at timestamptz:=clock_timestamp(); v_count integer; v_weight numeric; v_pool record;
begin
 perform private.v3_require_active_auth_session();
 if p_aggregation_id is null or p_expected_version is null or p_expected_version<1 or p_operation_id is null then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into a from televoting.televote_aggregations where id=p_aggregation_id for update;
 if a.id is null then raise exception 'Combined Televote not found' using errcode='P0002'; end if;
 select solaris_id into v_edition from public.integration_links where service='televoting' and entity_type='edition' and remote_id=a.edition_id::text;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',v_edition) or not public.studio2_access_allowed('voting.manage',v_edition,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.combined.calculate','R2',jsonb_build_object('aggregationId',a.id,'expectedVersion',p_expected_version,'engine','component-pool-v2'));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 if a.command_version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if a.rank_exponent<=0 or a.rank_exponent::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid rank exponent' using errcode='23514'; end if;
 if a.status not in ('draft','calculated') then raise exception 'Locked or published Combined calculation is immutable' using errcode='23514'; end if;
 if exists(select 1 from public.editions where id=v_edition and status='archived') or exists(select 1 from televoting.editions where id=a.edition_id and is_archived) then raise exception 'Archived edition' using errcode='23514'; end if;
 -- Lock canonical input relations for this short command. Ballot/score writers
 -- cannot interleave between input reads; no client-provided result is accepted.
 lock table televoting.televote_aggregation_sources,televoting.televote_aggregation_participants,televoting.external_score_entries,televoting.vote_submissions,televoting.vote_entries,televoting.round_results in share row exclusive mode;
 select count(*) into v_count from televoting.televote_aggregation_participants where aggregation_id=a.id;
 select sum(percentage_weight) into v_weight from televoting.televote_aggregation_sources where aggregation_id=a.id and enabled and input_mode<>'correction';
 if exists(select 1 from televoting.televote_aggregation_sources where aggregation_id=a.id and enabled and (percentage_weight<0 or percentage_weight::text in ('NaN','Infinity','-Infinity'))) then raise exception 'Invalid component weight' using errcode='23514'; end if;
 if v_count=0 or v_weight is null or abs(v_weight-100)>0.0001 then raise exception 'Participants and component weights totaling 100 required' using errcode='23514'; end if;
 if exists(select 1 from televoting.televote_aggregation_sources s where s.aggregation_id=a.id and s.enabled and s.input_mode='correction' and s.correction_scope='source' and not exists(select 1 from televoting.televote_aggregation_sources t where t.id=s.correction_target_source_id and t.aggregation_id=a.id and t.enabled and t.input_mode<>'correction')) then raise exception 'Invalid correction target' using errcode='23514'; end if;
 if exists(select 1 from televoting.televote_aggregation_sources s join public.televoting_round_bindings b on b.remote_round_id=s.source_round_id::text where s.aggregation_id=a.id and s.enabled and b.show_id is not null and
  (select coalesce(array_agg(upper(btrim(c.short_code)) order by p.running_order nulls last,p.id),'{}') from public.participants p join public.countries c on c.id=p.country_id where p.show_id=b.show_id and coalesce(p.participation_status,'confirmed')='confirmed') is distinct from
  (select coalesce(array_agg(country_code order by display_order),'{}') from televoting.televote_aggregation_participants where aggregation_id=a.id)) then raise exception 'Canonical show lineup changed; reconcile participants before calculating' using errcode='40001'; end if;
 v_version:=a.calculation_version+1;
 -- Hamilton allocation of the total pool across components. All version and
 -- timestamp fields are supplied here, never by the caller.
 for v_pool in
  with exact as (
   select s.*,a.total_points_to_distribute*s.percentage_weight::double precision/100 as x from televoting.televote_aggregation_sources s where s.aggregation_id=a.id and s.enabled and s.input_mode<>'correction'
  ), floored as (select *,floor(x+1e-9) as f from exact), ranked as (
   select *,row_number() over(order by x-f desc,percentage_weight desc,display_order,id) as rn,sum(f) over() as used from floored
  ) select *,case when rn<=round(a.total_points_to_distribute-used) then 1 else 0 end as bonus from ranked
 loop
  update televoting.televote_aggregation_sources set calculation_method=case v_pool.input_mode when 'converted_points' then 'rescaled' when 'activity_points' then 'proportional' else 'rank_weighted' end,exact_point_pool=v_pool.x,floored_point_pool=v_pool.f,pool_remainder=v_pool.x-v_pool.f,pool_remainder_bonus=v_pool.bonus,final_point_pool=v_pool.f+v_pool.bonus where id=v_pool.id;
 end loop;

 with sources as (
  select * from televoting.televote_aggregation_sources where aggregation_id=a.id and enabled
 ), inputs as (
  select s.id,s.source_name,s.source_type,s.input_mode,s.calculation_method,s.percentage_weight,s.final_point_pool,p.country_code,p.display_order,
   coalesce(case when s.source_round_id is null then (select sum(value) from televoting.external_score_entries e where e.source_id=s.id and e.country_code=p.country_code)
    when s.input_mode='converted_points' then (select final_points from televoting.round_results r where r.round_id=s.source_round_id and r.country_code=p.country_code order by calculation_version desc limit 1)
    else (select sum(e.points) from televoting.vote_entries e join televoting.vote_submissions b on b.id=e.submission_id where b.round_id=s.source_round_id and b.status<>'deleted' and e.target_country_code=p.country_code) end,0)::double precision as raw,
   case when s.source_round_id is not null and s.input_mode<>'converted_points' then (select array_agg(e.points::double precision order by e.points desc) from televoting.vote_entries e join televoting.vote_submissions b on b.id=e.submission_id where b.round_id=s.source_round_id and b.status<>'deleted' and e.target_country_code=p.country_code) end as dist
  from sources s cross join televoting.televote_aggregation_participants p where p.aggregation_id=a.id
 ), adjusted as (
  select i.*,case when i.input_mode='raw_results' then i.raw+coalesce(c.delta,0) else greatest(0,i.raw+coalesce(c.delta,0)) end as score
  from inputs i left join lateral (select sum(c.raw) as delta from inputs c join sources s on s.id=c.id where s.input_mode='correction' and s.correction_scope='source' and s.correction_target_source_id=i.id and c.country_code=i.country_code)c on true
  where i.input_mode<>'correction'
 ), ranks as (
  select i.*,1+(select count(*) from adjusted j where j.id=i.id and (j.score>i.score or (j.score=i.score and (private.v3_combined_distribution_compare(to_jsonb(j.dist),to_jsonb(i.dist))<0 or (private.v3_combined_distribution_compare(to_jsonb(j.dist),to_jsonb(i.dist))=0 and (j.display_order,j.country_code)<(i.display_order,i.country_code)))))) as rk from adjusted i
 ), weighted as (
  select *,case when input_mode='raw_results' then power(v_count+2-rk,a.rank_exponent::double precision) end as factor,
   score*case when input_mode='raw_results' then power(v_count+2-rk,a.rank_exponent::double precision) else 1 end as w from ranks
 ), exact as (
  select *,sum(w) over(partition by id) as total_w,case when sum(w) over(partition by id)>0 then w/sum(w) over(partition by id)*final_point_pool else 0 end as x from weighted
 ), floored as (select *,floor(x+1e-9) as f from exact), bonuses as (
  select *,case when total_w>0 and row_number() over(partition by id order by x-f desc,score desc,case when input_mode='raw_results' then rk end,display_order,country_code)<=round(final_point_pool-sum(f) over(partition by id)) then 1 else 0 end as bonus from floored
 )
 insert into televoting.combined_televote_component_results(aggregation_id,component_id,component_name,component_type,country_code,calculation_version,method,percentage_weight,component_pool,raw_score,raw_rank,participant_count,rank_base,rank_exponent,rank_factor,weighted_score,source_weighted_total,exact_allocation,floored_allocation,decimal_remainder,remainder_bonus,final_allocated_points,tie_break_data,calculated_at)
 select a.id,id,source_name,source_type,country_code,v_version,calculation_method,percentage_weight,final_point_pool,score,case when input_mode<>'activity_points' then rk end,v_count,case when input_mode='raw_results' then v_count+2 end,case when input_mode='raw_results' then a.rank_exponent end,factor,case when input_mode='raw_results' then w end,case when input_mode='raw_results' then total_w end,x,f,x-f,bonus,f+bonus,
 jsonb_build_object('rawTie',count(*) over(partition by id,score)>1,'distributionUnavailable',count(*) over(partition by id,score)>1 and dist is null,'distribution',dist,'rankResolvedBy',case when count(*) over(partition by id,score)=1 then 'raw_score' when dist is not null then 'score_distribution' else 'running_order' end),v_at from bonuses;
 if exists(select 1 from televoting.televote_aggregation_sources s where s.aggregation_id=a.id and s.enabled and s.input_mode<>'correction' and s.final_point_pool<>(select coalesce(sum(final_allocated_points),0) from televoting.combined_televote_component_results c where c.aggregation_id=a.id and c.component_id=s.id and c.calculation_version=v_version)) then raise exception 'Component allocation failed: empty or invalid scores' using errcode='23514'; end if;

 with totals as (
  select p.country_code,p.display_order,
   coalesce(sum(c.final_allocated_points) filter(where c.method in ('rank_weighted','rescaled')),0) as voting,
   coalesce(sum(c.final_allocated_points) filter(where c.method='proportional'),0) as activity,
   coalesce((select sum(case when s.source_round_id is null then (select sum(e.value) from televoting.external_score_entries e where e.source_id=s.id and e.country_code=p.country_code) else (select sum(e.points) from televoting.vote_entries e join televoting.vote_submissions b on b.id=e.submission_id where b.round_id=s.source_round_id and b.status<>'deleted' and e.target_country_code=p.country_code) end) from televoting.televote_aggregation_sources s where s.aggregation_id=a.id and s.enabled and s.input_mode='correction' and s.correction_scope='final'),0) as correction,
   jsonb_agg(jsonb_build_object('source_id',c.component_id,'source_name',c.component_name,'source_type',c.component_type,'method',c.method,'raw_score',c.raw_score,'allocated_points',c.final_allocated_points) order by s.display_order,s.id) as contributions,
   array_agg(c.final_allocated_points order by s.percentage_weight desc,s.display_order,s.id) filter(where c.method in ('rank_weighted','rescaled')) as allocated,
   array_agg(c.raw_score order by s.percentage_weight desc,s.display_order,s.id) filter(where c.method in ('rank_weighted','rescaled')) as raw_scores,
   jsonb_agg(c.tie_break_data->'distribution' order by s.percentage_weight desc,s.display_order,s.id) filter(where c.method in ('rank_weighted','rescaled')) as distributions
  from televoting.televote_aggregation_participants p join televoting.combined_televote_component_results c on c.aggregation_id=a.id and c.country_code=p.country_code and c.calculation_version=v_version join televoting.televote_aggregation_sources s on s.id=c.component_id where p.aggregation_id=a.id group by p.country_code,p.display_order
 ), scored as (select *,greatest(0,voting+activity+correction) as points from totals), ranked as (
  select i.*,1+(select count(*) from scored j where private.v3_combined_countback(to_jsonb(j),to_jsonb(i))<0) as rk from scored i
 ) insert into televoting.combined_televote_results(aggregation_id,country_code,calculation_version,source_contributions,total_voting_points,total_activity_points,final_correction,final_combined_points,final_rank,final_tie_break_data,converted_points,post_conversion_bonus,post_conversion_adjustment,final_televote_score,combined_original_rank,participant_count,calculated_at)
 select a.id,country_code,v_version,contributions,voting,activity,correction,points,rk,jsonb_build_object('tied',count(*) over(partition by points)>1,'resolvedBy','component-pool-v2 canonical countback'),voting,activity,correction,points,rk,v_count,v_at from ranked;
 if (select sum(final_correction)=0 and sum(final_combined_points)<>a.total_points_to_distribute from televoting.combined_televote_results where aggregation_id=a.id and calculation_version=v_version) then raise exception 'Final calculation total mismatch' using errcode='23514'; end if;
 update televoting.televote_aggregations set status='calculated',calculation_version=v_version,calculated_at=v_at,calculated_by=auth.uid(),calculated_by_username=coalesce((select email from auth.users where id=auth.uid()),'Solaris organizer'),results_outdated=false where id=a.id;
 insert into televoting.admin_audit_log(actor_admin_id,action,target_type,target_id,new_values) values(auth.uid(),'calculate_combined_televote','televote_aggregation',a.id::text,jsonb_build_object('operationId',p_operation_id,'version',v_version,'engine','component-pool-v2'));
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at) values('televoting','combined.calculated','televote_aggregation',a.id::text,jsonb_build_object('operationId',p_operation_id,'version',v_version),'completed',1,now(),now());
 v_result:=jsonb_build_object('ok',true,'aggregationId',a.id,'version',v_version,'calculatedAt',v_at,'operationId',p_operation_id,'commandVersion',(select command_version from televoting.televote_aggregations where id=a.id));
 return private.studio2_complete_operation(p_operation_id,v_result);
end $command$;
revoke all on function televoting.v3_calculate_combined(uuid,bigint,uuid,text) from public,anon,service_role;
grant execute on function televoting.v3_calculate_combined(uuid,bigint,uuid,text) to authenticated;
-- Every Combined application writer is now a governed command. Revoke raw
-- table AND historical column DML; retain published/public and Organizer reads.
do $cutover$
declare t text; c text;
begin
 foreach t in array array['televote_aggregations','televote_aggregation_sources','televote_aggregation_participants','external_score_entries','combined_televote_component_results','combined_televote_results'] loop
  execute format('revoke insert,update,delete,truncate on televoting.%I from public,anon,authenticated,service_role',t);
  for c in select attname from pg_attribute where attrelid=format('televoting.%I',t)::regclass and attnum>0 and not attisdropped loop
   execute format('revoke insert(%I),update(%I) on televoting.%I from public,anon,authenticated,service_role',c,c,t);
  end loop;
 end loop;
end $cutover$;
commit;
