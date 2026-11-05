-- Runs only against the disposable local stack; rolls back all fixtures.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('25000000-0000-4000-8000-000000000001','authenticated','authenticated','influence-organizer@local.invalid',now(),now()),
 ('25000000-0000-4000-8000-000000000002','authenticated','authenticated','influence-viewer@local.invalid',now(),now());
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('25000000-0000-4000-8000-000000000001','voting.manage',null);
insert into televoting.editions(id,name,is_active,is_archived)
values ('25000000-0000-4000-8000-000000000010','Influence ACL rehearsal',true,false);
insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000010','Influence ACL rehearsal','closed',24,'countries','country_match');

set local role service_role;
insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key)
values ('25000000-0000-4000-8000-000000000011',1,'voter','service');
do $$ begin
 if (select count(*) from televoting.round_influence_results where subject_key='service') <> 1 then
  raise exception 'Service role cannot read materialized influence';
 end if;
end $$;
delete from televoting.round_influence_results where subject_key='service';
reset role;

set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $$ begin
 if not public.studio2_access_allowed('voting.manage',null,false) then
  raise exception 'Organizer fixture lacks canonical capability';
 end if;
end $$;
insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key)
values ('25000000-0000-4000-8000-000000000011',1,'voter','organizer');
do $$ begin
 if (select count(*) from televoting.round_influence_results where subject_key='organizer') <> 1 then
  raise exception 'Organizer cannot read influence';
 end if;
end $$;
delete from televoting.round_influence_results where subject_key='organizer';
insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key)
values ('25000000-0000-4000-8000-000000000011',1,'voter','protected');
reset role;

set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v_count integer; begin
 if public.studio2_access_allowed('voting.manage',null,false) then
  raise exception 'Viewer fixture unexpectedly has capability';
 end if;
 if exists(select 1 from televoting.round_influence_results) then
  raise exception 'Viewer leaked influence evidence';
 end if;
 begin
  insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key)
  values ('25000000-0000-4000-8000-000000000011',1,'voter','unauthorized');
  raise exception 'Viewer insert unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
 delete from televoting.round_influence_results;
 get diagnostics v_count = row_count;
 if v_count <> 0 then raise exception 'Viewer deleted protected influence'; end if;
 begin
  update televoting.round_influence_results set calculation_version=2;
  raise exception 'Viewer update unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

set local request.jwt.claim.sub='';
set local request.jwt.claim.role='anon';
set local role anon;
do $$ begin
 begin
  perform 1 from televoting.round_influence_results;
  raise exception 'Anon read unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into televoting.round_influence_results(round_id,calculation_version,subject_type,subject_key)
  values ('25000000-0000-4000-8000-000000000011',1,'voter','anon');
  raise exception 'Anon insert unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from televoting.round_influence_results;
  raise exception 'Anon delete unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$ begin
 if (select count(*) from televoting.round_influence_results where subject_key='protected') <> 1 then
  raise exception 'Unauthorized attempts changed canonical evidence';
 end if;
end $$;
rollback;
