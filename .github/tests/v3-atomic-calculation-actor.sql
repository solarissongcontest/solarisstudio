\set ON_ERROR_STOP on
begin;
-- Real permission model and real round/result tables; all rows roll back.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
insert into public.studio2_capabilities(key,domain,label,description,access_level)
 values('voting.manage','voting','Actor regression','Local-only atomic calculation regression','operate');
insert into public.studio2_capability_grants(user_id,capability)
 values('00000000-0000-0000-0000-000000000001','voting.manage');
insert into televoting.editions(id,name) values('00000000-0000-0000-0000-000000000090','Local actor fixture');
insert into televoting.rounds(id,edition_id,name,total_points_to_distribute,televote_engine_version) values
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000090','Standard',1,'rank-weighted-v1'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000090','Robust',1,'robust-televote-v2');
insert into televoting.countries(code,name) values('AA','Synthetic actor country');
insert into televoting.round_entries(round_id,entry_key,country_code,entry_type) values
 ('00000000-0000-0000-0000-000000000091','AA','AA','country'),
 ('00000000-0000-0000-0000-000000000092','AA','AA','country');
-- The real DB implementation must reject a forged actor before locking/writes.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"service_role"}',true);
do $test$ declare denied boolean:=false; begin
 begin
  perform televoting.v3_commit_official_round_calculation('00000000-0000-0000-0000-000000000099',0,now(),'00000000-0000-0000-0000-000000000002','forged',array['AA'],'[]','[]');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Authenticated caller impersonated another calculation actor'; end if;
end $test$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
-- Matching actors pass the identity boundary; the deliberately absent round
-- must still refuse. It must never be accepted just to make this test green.
do $test$ begin
 begin
  perform televoting.v3_commit_official_round_calculation('00000000-0000-0000-0000-000000000099',0,now(),'00000000-0000-0000-0000-000000000001','self',array['AA'],'[]','[]');
  raise exception 'Missing round unexpectedly accepted' using errcode='XX000';
 exception when raise_exception then
  if sqlerrm not like 'ROUND_NOT_FOUND:%' then raise; end if;
 end;
end $test$;
do $positive$ declare target uuid; engine text; version integer; payload jsonb; begin
 foreach target in array array['00000000-0000-0000-0000-000000000091'::uuid,'00000000-0000-0000-0000-000000000092'::uuid] loop
  select televote_engine_version into engine from televoting.rounds where id=target;
  payload:=jsonb_build_array(jsonb_build_object('country_code','AA','original_votes',1,'original_voters',1,'original_rank',1,'participant_count',1,'rank_base',1,'rank_exponent',1.33,'rank_factor',1,'weighted_score',1,'exact_points',1,'floored_points',1,'decimal_remainder',0,'remainder_bonus',0,'final_points',1,'total_points_to_distribute',1,'engine_version',engine,'effective_points',1,'supporter_count',1,'effective_supporters',1,'breadth_ratio',1,'breadth_factor',1,'robust_support',1,'robust_rank',1,'rank_percentile',1,'rank_boost',1,'calculation_config','{}'::jsonb));
  version:=televoting.v3_commit_official_round_calculation(target,0,now(),auth.uid(),'self',array['AA'],payload,'[]');
  if version<>1 then raise exception 'Authorized calculation did not commit'; end if;
  begin
    perform televoting.v3_commit_official_round_calculation(target,1,now(),'00000000-0000-0000-0000-000000000002','forged',array['AA'],payload,'[]');
    raise exception 'Forged actor overwrote committed result' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from televoting.rounds where id=target and calculation_version=1 and calculated_by=auth.uid() and calculated_by_username='Solaris organizer') then raise exception 'Actor/version readback mismatch'; end if;
 end loop;
end $positive$;
reset role;
delete from public.studio2_capability_grants where user_id='00000000-0000-0000-0000-000000000001';
set local role authenticated;
do $revoked$ begin
 begin
  perform televoting.v3_commit_official_round_calculation('00000000-0000-0000-0000-000000000091',1,now(),auth.uid(),'self',array['AA'],'[]','[]');
  raise exception 'Revoked actor calculation accepted' using errcode='XX000';
 exception when insufficient_privilege then null;
 when raise_exception then if sqlerrm not like 'ROUND_NOT_FOUND:%' then raise; end if;
 end;
end $revoked$;
reset role;
do $unchanged$ begin
 if (select count(*) from televoting.rounds where calculation_version=1 and calculated_by='00000000-0000-0000-0000-000000000001')<>2 then raise exception 'Denied calculation changed committed versions'; end if;
end $unchanged$;
rollback;
select 'PASS: authenticated actor binding, forged role marker denied, matching actor retains validation';
