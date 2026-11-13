\set ON_ERROR_STOP on
-- Synthetic rows on the real hosted-observed relations, with all guards and
-- constraints enabled. Owner seeds are not proof of an edition-create command.
begin;
set local track_functions='all';
create function pg_temp.assert_recovery(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Authorization recovery FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;

insert into auth.users(id) values
 ('a1300000-0000-4000-8000-000000000001'),('a1300000-0000-4000-8000-000000000002');
insert into public.studio2_capabilities(key,domain,label,description,access_level) values
 ('confirmation.manage','confirmation','Synthetic recovery capability','Local-only authorization probe','operate');
insert into public.studio2_capability_grants(user_id,capability) values
 ('a1300000-0000-4000-8000-000000000001','confirmation.manage');
select pg_temp.assert_recovery(private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','confirmation.manage',null),'active global capability grant');
select pg_temp.assert_recovery(not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000002','confirmation.manage',null),'other actor denied');
select pg_temp.assert_recovery((select version=1 from public.studio2_permission_subject_versions where user_id='a1300000-0000-4000-8000-000000000001'),'real grant trigger increments subject revision');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_recovery(public.studio2_access_allowed('confirmation.manage',null,false),'authenticated authorized access uses real nested helpers');
do $$ begin
  begin perform private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','confirmation.manage',null);
    raise exception 'Private helper unexpectedly executable';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000002',true);
select pg_temp.assert_recovery(not public.studio2_access_allowed('confirmation.manage',null,false),'unauthorized authenticated actor denied');
reset role;

delete from public.studio2_capability_grants where user_id='a1300000-0000-4000-8000-000000000001';
select pg_temp.assert_recovery(not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','confirmation.manage',null),'revoked capability denied');
select pg_temp.assert_recovery((select version=2 from public.studio2_permission_subject_versions where user_id='a1300000-0000-4000-8000-000000000001'),'revocation advances real revision');
insert into public.studio2_capability_grants(user_id,capability,expires_at) values
 ('a1300000-0000-4000-8000-000000000001','confirmation.manage',now()-interval '1 minute');
select pg_temp.assert_recovery(not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','confirmation.manage',null),'expired direct grant denied');

insert into public.studio2_access_roles(key,label,description) values ('recovery-tester','Synthetic role','Local-only');
insert into public.studio2_role_capabilities(role_key,capability) values ('recovery-tester','confirmation.manage');
insert into public.studio2_role_assignments(user_id,role_key,created_at) values
 ('a1300000-0000-4000-8000-000000000002','recovery-tester',now()-interval '2 hours');
select pg_temp.assert_recovery(private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000002','confirmation.manage',null),'active role capability succeeds');
update public.studio2_role_assignments set expires_at=now()-interval '1 hour' where role_key='recovery-tester';
select pg_temp.assert_recovery(not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000002','confirmation.manage',null),'expired role assignment denied');

update public.studio2_capability_grants set expires_at=null where user_id='a1300000-0000-4000-8000-000000000001';
insert into public.studio2_organizer_tasks(id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,priority,title,href)
values ('a1300000-0000-4000-8000-000000000010','a1300000-0000-4000-8000-000000000001','system','synthetic-recovery','synthetic-recovery','permission-review','confirmation.manage','normal','Synthetic task','/participate');
select pg_temp.assert_recovery(private.studio2_task_recipient_eligible('a1300000-0000-4000-8000-000000000010','a1300000-0000-4000-8000-000000000001'),'assigned capable task recipient eligible');
select pg_temp.assert_recovery(not private.studio2_task_recipient_eligible('a1300000-0000-4000-8000-000000000010','a1300000-0000-4000-8000-000000000002'),'incapable task recipient denied');
update public.studio2_organizer_tasks set assigned_to='a1300000-0000-4000-8000-000000000002' where id='a1300000-0000-4000-8000-000000000010';
select pg_temp.assert_recovery(private.studio2_task_recipient_eligible('a1300000-0000-4000-8000-000000000010','a1300000-0000-4000-8000-000000000001'),'revoked assignee does not block capable fallback recipient');
update public.studio2_organizer_tasks set state='resolved',resolved_at=now() where id='a1300000-0000-4000-8000-000000000010';
select pg_temp.assert_recovery(not private.studio2_task_recipient_eligible('a1300000-0000-4000-8000-000000000010','a1300000-0000-4000-8000-000000000001'),'resolved task is no longer actionable');

select pg_temp.assert_recovery(private.studio2_capability_allowed_in_platform_mode('voting.manage','operate','normal'),'normal operations allowed');
select pg_temp.assert_recovery(not private.studio2_capability_allowed_in_platform_mode('voting.manage','operate','read_only'),'read-only voting mutation denied');
select pg_temp.assert_recovery(private.studio2_capability_allowed_in_platform_mode('confirmation.manage','operate','read_only'),'canonical Confirmation read-only exception retained');
select pg_temp.assert_recovery(not private.studio2_capability_allowed_in_platform_mode('confirmation.manage','operate','maintenance'),'full maintenance remains stricter');
select pg_temp.assert_recovery(not private.studio2_capability_allowed_in_platform_mode('voting.manage','operate','unknown'),'unknown platform mode fails closed');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_recovery(not public.studio2_access_allowed('confirmation.manage',null,false),'anonymous access denied');
do $$ begin
  begin perform private.studio2_capability_allowed_in_platform_mode('confirmation.manage','operate','normal');
    raise exception 'Private helper unexpectedly executable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Do not bypass the real edition-runtime guard to manufacture scoped data.
-- The repo explicitly records that its hosted strict-dual body is unavailable
-- and differs from both source variants. Preserve the missing dependency as a
-- BLOCKED runtime witness, not a successful cross-edition acceptance test.
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);
do $blocked_edition$
declare v_message text;
begin
  if to_regprocedure('private.studio2_require_strict_dual(text,uuid,text)') is not null then
    raise exception 'Strict-dual baseline changed; review observed definition before this probe';
  end if;
  begin
    insert into public.editions(id,name,slug,edition_number) values
      ('e1300000-0000-4000-8000-000000000001','Synthetic recovery A','synthetic-recovery-a',130);
    raise exception 'Edition seed unexpectedly bypassed its missing strict-dual guard';
  exception when undefined_function then
    get stacked diagnostics v_message=message_text;
    if position('private.studio2_require_strict_dual(text, uuid, text)' in v_message)=0 then raise; end if;
  end;
  if exists(select 1 from public.editions where id='e1300000-0000-4000-8000-000000000001')
     or exists(select 1 from public.studio2_edition_runtime where edition_id='e1300000-0000-4000-8000-000000000001') then
    raise exception 'Blocked edition seed left partial parent/runtime rows';
  end if;
  raise notice 'BLOCKED: edition-scoped runtime acceptance requires hosted strict-dual body; failed seed left no partial rows';
end $blocked_edition$;

-- No seeded identity or permission survives; trigger/RLS definitions stay on.
rollback;
