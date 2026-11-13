\set ON_ERROR_STOP on
begin;
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
reset role;
rollback;
select 'PASS: authenticated actor binding, forged role marker denied, matching actor retains validation';
