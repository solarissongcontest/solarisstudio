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

-- The authorized one-signature inspection restored the EXACT hosted strict-dual
-- definition through immutable source normalization, with its real trigger on.
-- The privileged local bootstrap with no JWT is intentionally allowed by the
-- observed function; this is NOT an authenticated Organizer acceptance claim.
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);
insert into public.editions(id,name,slug,edition_number) values
  ('e1300000-0000-4000-8000-000000000001','Synthetic recovery A','synthetic-recovery-a',130),
  ('e1300000-0000-4000-8000-000000000002','Synthetic recovery B','synthetic-recovery-b',131);
select pg_temp.assert_recovery(
  (select count(*)=2 from public.studio2_edition_runtime
   where edition_id in ('e1300000-0000-4000-8000-000000000001','e1300000-0000-4000-8000-000000000002')),
  'real edition seed and strict-dual guard installed with privileged non-JWT fixture bootstrap');
select pg_temp.assert_recovery(
  to_regprocedure('private.studio2_require_strict_dual(text,uuid,text)') is not null,
  'exact hosted strict-dual identity locally installed');

-- An API request with a missing subject must not inherit the privileged local
-- non-JWT exception. Exercise the existing real edition-runtime trigger.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','',true);
do $missing_actor$
declare v_message text;
begin
  begin
    insert into public.editions(id,name,slug,edition_number) values
      ('e1300000-0000-4000-8000-000000000003','Synthetic denied','synthetic-recovery-denied',132);
    raise exception 'Strict-dual unexpectedly allowed missing authenticated actor';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    if v_message <> 'Authentication required' then raise; end if;
  end;
  if exists(select 1 from public.editions where id='e1300000-0000-4000-8000-000000000003')
     or exists(select 1 from public.studio2_edition_runtime where edition_id='e1300000-0000-4000-8000-000000000003')
  then raise exception 'Missing-actor guard left partial edition/runtime rows'; end if;
  raise notice 'PASS: authenticated request without subject denied, no partial edition/runtime rows';
end $missing_actor$;
select set_config('request.jwt.claim.role','',true);

-- Prove scope isolation, revocation and expiration at the real nested
-- capability helper against TWO different FK-closed synthetic editions.
insert into public.studio2_capabilities(key,domain,label,description,access_level) values
  ('edition.manage','edition','Synthetic edition management','Local-only scoped recovery probe','operate');
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000001');
select pg_temp.assert_recovery(
 private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000001'),
 'grant authorizes intended edition only');
select pg_temp.assert_recovery(
 not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000002'),
 'same grant denies wrong edition');
update public.studio2_capability_grants
set expires_at=now()-interval '1 minute'
where user_id='a1300000-0000-4000-8000-000000000001' and capability='edition.manage';
select pg_temp.assert_recovery(
 not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000001'),
 'expired edition grant denied');
delete from public.studio2_capability_grants
where user_id='a1300000-0000-4000-8000-000000000001' and capability='edition.manage';
select pg_temp.assert_recovery(
 not private.studio2_user_has_capability('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000001'),
 'revoked edition grant denied');

-- Test the exact hosted-observed nested global flag helper against the REAL
-- 215-relation fixture, with its original feature-flag strict-dual trigger.
select pg_temp.assert_recovery(
 to_regprocedure('private.studio2_permission_engine_authoritative()') is not null,
 'hosted-authoritative permission flag helper installed with frozen metadata');
select pg_temp.assert_recovery(
 not private.studio2_permission_engine_authoritative(),
 'absent permission-engine rollout flag is non-authoritative');

-- The final hosted fingerprint describes the cutover implementation, which
-- returns 'authoritative' even though this historical RPC retains 'shadow' in
-- its name. Do not quietly restore the superseded legacy-role shadow body.
select pg_temp.assert_recovery(
 to_regprocedure('public.studio2_check_capability_shadow(text,uuid,text,text)') is not null,
 'source-derived authoritative telemetry RPC installed with hosted metadata');

-- Use the real API-granted RPC with an authenticated role. Before a grant the
-- RPC is a non-authorizing telemetry read/insert, not a shadow role fallback.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
select pg_temp.assert_recovery(
 (select (v->>'mode')='authoritative' and (v->>'allowed')='false'
      and (v->>'legacyAllowed')='false' and (v->>'capabilityAllowed')='false'
  from (select public.studio2_check_capability_shadow(
     'edition.manage','e1300000-0000-4000-8000-000000000001',
     'recovery.flag-off-denial',null) v) q),
 'final authoritative telemetry denies ungranted capability with no legacy fallback');
select set_config('request.jwt.claim.sub','',true);
do $shadow_missing_actor$
declare v_message text;
begin
  begin
    perform public.studio2_check_capability_shadow('edition.manage',null,'recovery.missing-actor',null);
    raise exception 'Telemetry RPC accepted missing JWT actor';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    if v_message <> 'Authentication required' then raise; end if;
  end;
  raise notice 'PASS: authoritative telemetry RPC rejects missing JWT actor';
end $shadow_missing_actor$;
reset role;
select set_config('request.jwt.claim.role','',true);

select pg_temp.assert_recovery(
 exists (select 1 from public.permission_evaluation_events
  where user_id='a1300000-0000-4000-8000-000000000001'
    and edition_id='e1300000-0000-4000-8000-000000000001'
    and action='recovery.flag-off-denial'
    and legacy_allowed=false and capability_allowed=false),
 'real hosted-observed permission telemetry retains authoritative denial event');

-- Flag-off mode: the production-cutover RPC is still authoritative, so BOTH
-- output booleans come from the capability resolver, not legacy user_roles.
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('a1300000-0000-4000-8000-000000000001','edition.manage','e1300000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
update public.studio2_edition_runtime
  set updated_by='a1300000-0000-4000-8000-000000000001'
  where edition_id='e1300000-0000-4000-8000-000000000001';
select pg_temp.assert_recovery(
  (select updated_by='a1300000-0000-4000-8000-000000000001'
   from public.studio2_edition_runtime
   where edition_id='e1300000-0000-4000-8000-000000000001'),
  'flag-off strict-dual permits scoped actor only through exact cutover telemetry');
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_recovery(
 exists (select 1 from public.permission_evaluation_events
   where user_id='a1300000-0000-4000-8000-000000000001'
     and edition_id='e1300000-0000-4000-8000-000000000001'
     and action='edition.runtime.update'
     and legacy_allowed and capability_allowed),
 'flag-off strict-dual path saves real positive capability telemetry event');

-- Owner-only local fixture setup, not a production rollout change.
insert into public.studio2_feature_flags (key,enabled,admins_only,user_ids,edition_ids)
values ('permission_engine_v2',true,false,'{}'::uuid[],'{}'::uuid[]);
select pg_temp.assert_recovery(private.studio2_permission_engine_authoritative(),
 'global rollout flag enables exact hosted authoritative checker');
-- Reuse the locally scoped grant exercised above, without duplicate writes.

-- Authentication claims are synthetic, but these DO exercise the real
-- strict-dual trigger, authoritative helper, capability grant, edition table
-- and runtime mutation in a single transaction with RLS/guards enabled.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
update public.studio2_edition_runtime
set updated_by='a1300000-0000-4000-8000-000000000001'
where edition_id='e1300000-0000-4000-8000-000000000001';
select pg_temp.assert_recovery(
 (select updated_by='a1300000-0000-4000-8000-000000000001'
  from public.studio2_edition_runtime
  where edition_id='e1300000-0000-4000-8000-000000000001'),
 'authoritative actor with edition-scoped capability passes exact strict-dual runtime guard');

do $wrong_edition$
declare v_message text;
begin
  begin
    update public.studio2_edition_runtime
    set updated_by='a1300000-0000-4000-8000-000000000001'
    where edition_id='e1300000-0000-4000-8000-000000000002';
    raise exception 'Wrong-edition actor unexpectedly authorized';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    if position('Capability required: edition.manage' in v_message)=0 then raise; end if;
  end;
  if (select updated_by from public.studio2_edition_runtime
    where edition_id='e1300000-0000-4000-8000-000000000002') is not null
  then raise exception 'Wrong-edition denial left a partial runtime mutation'; end if;
  raise notice 'PASS: wrong-edition actor denied by strict-dual trigger with no partial mutation';
end $wrong_edition$;

-- Expiry and revocation must invalidate a previously successful actor.
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);
update public.studio2_capability_grants set expires_at=now()-interval '1 minute'
where user_id='a1300000-0000-4000-8000-000000000001'
  and capability='edition.manage' and edition_id='e1300000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
do $expired_actor$
declare v_message text;
begin
  begin
    update public.studio2_edition_runtime set updated_by=null
    where edition_id='e1300000-0000-4000-8000-000000000001';
    raise exception 'Expired actor grant unexpectedly authorized';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    if position('Capability required: edition.manage' in v_message)=0 then raise; end if;
  end;
  if (select updated_by from public.studio2_edition_runtime
    where edition_id='e1300000-0000-4000-8000-000000000001')
    is distinct from 'a1300000-0000-4000-8000-000000000001'::uuid
  then raise exception 'Expired capability left a partial runtime mutation'; end if;
  raise notice 'PASS: expired actor grant denied by strict-dual trigger with no partial mutation';
end $expired_actor$;

select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);
delete from public.studio2_capability_grants
where user_id='a1300000-0000-4000-8000-000000000001'
  and capability='edition.manage' and edition_id='e1300000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a1300000-0000-4000-8000-000000000001',true);
do $revoked_actor$
declare v_message text;
begin
  begin
    update public.studio2_edition_runtime set updated_by=null
    where edition_id='e1300000-0000-4000-8000-000000000001';
    raise exception 'Revoked actor grant unexpectedly authorized';
  exception when insufficient_privilege then
    get stacked diagnostics v_message=message_text;
    if position('Capability required: edition.manage' in v_message)=0 then raise; end if;
  end;
  if (select updated_by from public.studio2_edition_runtime
    where edition_id='e1300000-0000-4000-8000-000000000001')
    is distinct from 'a1300000-0000-4000-8000-000000000001'::uuid
  then raise exception 'Revoked capability left a partial runtime mutation'; end if;
  raise notice 'PASS: revoked actor grant denied by strict-dual trigger with no partial mutation';
end $revoked_actor$;
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);

-- No seeded identity or permission survives; trigger/RLS definitions stay on.
rollback;
