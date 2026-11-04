-- Use only with scripts/rehearse-v3-world-organization-follows.sh.
-- Local disposable Supabase; all fixture state rolled back.
\set ON_ERROR_STOP on
begin;
do $fixture$
declare
 v_me uuid:=gen_random_uuid();
 v_other uuid:=gen_random_uuid();
 v_org uuid:=gen_random_uuid();
 v_hidden uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at)
 values(v_me,'authenticated','authenticated',v_me::text||'@tg10-world.invalid',now(),now()),
       (v_other,'authenticated','authenticated',v_other::text||'@tg10-world.invalid',now(),now());
 insert into public.world_organizations(
  id,slug,official_name,short_name,type,status,public_visibility
 ) values
 (v_org,'tg10-public-'||replace(v_org::text,'-',''),'TG10 Public','TG10','international_organization','active','public'),
 (v_hidden,'tg10-hidden-'||replace(v_hidden::text,'-',''),'TG10 Private','TG10 Hidden','international_organization','active','private');
 perform set_config('solaris.tg10_follow_fixture',jsonb_build_object(
  'me',v_me,'other',v_other,'organization',v_org,'hidden',v_hidden
 )::text,true);
end $fixture$;

-- Only authenticated users may create follows or edit categories.
set local role anon;
do $anon$
begin
 if has_function_privilege('anon','public.set_fan_follow(text,uuid,boolean,text)','EXECUTE')
    or has_function_privilege('anon','public.world_set_follow_category_v1(uuid,text,boolean)','EXECUTE') then
  raise exception 'TG10_ANON_FOLLOW_AUTHORITY';
 end if;
end $anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $own$
declare
 v jsonb:=current_setting('solaris.tg10_follow_fixture')::jsonb;
 v_follow uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'me',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'me','role','authenticated')::text,true);
 if auth.uid() is distinct from (v->>'me')::uuid then
  raise exception 'TG10_JWT_SETUP_FAILED';
 end if;
 if public.set_fan_follow('organization',(v->>'organization')::uuid,true,'important') is distinct from true then
  raise exception 'TG10_ORGANIZATION_FOLLOW_FAILED';
 end if;
 select f.id into strict v_follow from public.fan_follows f
 where f.profile_id=(v->>'me')::uuid and f.entity_type='organization'
   and f.entity_id=(v->>'organization')::uuid;
 if private.v3_fan_follow_operation_id(v_follow,(v->>'me')::uuid,'save',
    'organization',(v->>'organization')::uuid,'important',1) is null then
  raise exception 'TG10_FOLLOW_EVENT_IDENTITY_MISSING';
 end if;
 begin
  perform public.set_fan_follow('organization',(v->>'hidden')::uuid,true,'important');
  raise exception 'TG10_PRIVATE_ORGANIZATION_FOLLOW_ALLOWED';
 exception when others then
  if sqlerrm <> 'This item is not available to follow' then raise; end if;
 end;
 if public.world_set_follow_category_v1(v_follow,'leadership',false) is distinct from false
    or (select enabled from public.fan_follow_categories
        where follow_id=v_follow and category='leadership') is distinct from false then
  raise exception 'TG10_CATEGORY_SAVE_FAILED';
 end if;
 begin
  perform public.world_set_follow_category_v1(v_follow,'secret_election_ballots',true);
  raise exception 'TG10_UNKNOWN_CATEGORY_ACCEPTED';
 exception when sqlstate '22023' then
  if sqlerrm <> 'VALIDATION' then raise; end if;
 end;
 raise notice 'PASS: public follow, S5 event identity, private denial, owner category preference';
end $own$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $foreign$
declare
 v jsonb:=current_setting('solaris.tg10_follow_fixture')::jsonb;
 v_follow uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'other',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'other','role','authenticated')::text,true);
 if exists(select 1 from public.fan_follow_categories) then
  raise exception 'TG10_FOREIGN_CATEGORY_READ_ALLOWED';
 end if;
 -- The fixture-owner can resolve this ID separately; this intentionally
 -- proves the mutation boundary even when an attacker learns the UUID.
 select null::uuid into v_follow;
 perform set_config('solaris.tg10_foreign_checked','true',true);
end $foreign$;
reset role;

do $prepare_foreign$
declare v jsonb:=current_setting('solaris.tg10_follow_fixture')::jsonb;
begin
 perform set_config('solaris.tg10_target_follow',(
  select id::text from public.fan_follows
  where profile_id=(v->>'me')::uuid and entity_type='organization'
    and entity_id=(v->>'organization')::uuid
 ),true);
end $prepare_foreign$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $foreign_write$
declare
 v jsonb:=current_setting('solaris.tg10_follow_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'other',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'other','role','authenticated')::text,true);
 begin
  perform public.world_set_follow_category_v1(
   current_setting('solaris.tg10_target_follow')::uuid,'leadership',true
  );
  raise exception 'TG10_FOREIGN_CATEGORY_UPDATE_ALLOWED';
 exception when sqlstate '42501' then
  if sqlerrm <> 'AUTHORIZATION' then raise; end if;
 end;
 raise notice 'PASS: foreign user can neither read nor mutate category preference';
end $foreign_write$;
reset role;

-- Organization is withdrawn from public discovery. Existing owners must still
-- be allowed to unfollow without exposing the now-private organization.
update public.world_organizations set public_visibility='private'
where id=(current_setting('solaris.tg10_follow_fixture')::jsonb->>'organization')::uuid;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $removal$
declare v jsonb:=current_setting('solaris.tg10_follow_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'me',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'me','role','authenticated')::text,true);
 if public.set_fan_follow('organization',(v->>'organization')::uuid,false,'none') is distinct from false then
  raise exception 'TG10_ORGANIZATION_REMOVAL_FAILED';
 end if;
 if exists(select 1 from public.fan_follow_categories) then
  raise exception 'TG10_CATEGORY_CASCADE_FAILED';
 end if;
 raise notice 'PASS: former follower can remove hidden institution; category rows cascade';
end $removal$;
reset role;
rollback;
