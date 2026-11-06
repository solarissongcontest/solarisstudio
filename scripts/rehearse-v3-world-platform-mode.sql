-- WORLD-01 TG2 platform mode respects canonical V3 operational policy.
-- Must run ONLY through guarded local-only shell runner. Everything rolls back.
\set ON_ERROR_STOP on
begin;

do $fixture$
declare
  v_user uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_org uuid;
  v_office uuid := gen_random_uuid();
  v_manage_grant uuid;
  v_read_grant uuid;
begin
  select id into strict v_org from public.world_organizations where slug='guard';
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_user,'authenticated','authenticated',
    v_user::text || '@tg2-platform-mode.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values(v_person,'TG2 Platform Policy Holder','tg2-platform-mode:' || v_person::text);
  insert into public.countries(id,name,short_code)
  values(v_country,'TG2 Platform Policy Fixture Country','ZXV');
  insert into public.country_accounts(user_id,country_id,status)
  values(v_user,v_country,'active');
  insert into public.world_organization_offices
    (id,organization_id,slug,title,office_type,appointment_method)
  values(v_office,v_org,'tg2-platform-' || replace(v_office::text,'-',''),
    'TG2 Platform Policy Office','executive_leader','appointment');
  insert into public.world_office_capabilities(office_id,capability)
  values(v_office,'world.membership.review');
  insert into public.world_office_terms(
    office_id,holder_person_id,holder_user_id,started_at,term_kind,status
  ) values(v_office,v_person,v_user,now()-interval '1 day','full','active');

  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values(v_user,'world.organization.profile.manage',null)
  returning id into v_manage_grant;
  insert into public.world_capability_grant_scopes(grant_id,organization_id)
  values(v_manage_grant,v_org);
  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values(v_user,'world.organization.view_private',null)
  returning id into v_read_grant;
  insert into public.world_capability_grant_scopes(grant_id,organization_id)
  values(v_read_grant,v_org);
  perform set_config('solaris.tg2_platform_fixture',jsonb_build_object(
    'user',v_user,'country',v_country,'organization',v_org,'office',v_office
  )::text,true);
end $fixture$;

-- Verify normal through the actual authenticated World scope resolver.
update public.studio2_platform_operational_state
set mode='normal',version=version+1,reason='Local TG2 platform-mode regression',
    changed_at=now()
where singleton=true;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $assert_mode$
declare
  v jsonb := current_setting('solaris.tg2_platform_fixture')::jsonb;
  v_org uuid := (v->>'organization')::uuid;
  v_country uuid := (v->>'country')::uuid;
  v_expected boolean := true;
begin
  perform set_config('request.jwt.claim.sub',v->>'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'user','role','authenticated'
  )::text,true);
  if auth.uid() is distinct from (v->>'user')::uuid then
    raise exception 'TG2_PLATFORM_MODE_WRONG_AUTH_CONTEXT';
  end if;
  if public.world_access_allowed('world.organization.profile.manage',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_DIRECT_GRANT_UNSAFE: normal';
  end if;
  if public.world_access_allowed('world.membership.review',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_OFFICE_GRANT_UNSAFE: normal';
  end if;
  if public.world_access_allowed('world.membership.withdraw',v_org,v_country)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_COUNTRY_GRANT_UNSAFE: normal';
  end if;
  if not public.world_access_allowed('world.organization.view_private',v_org) then
    raise exception 'TG2_PLATFORM_MODE_READ_SCOPE_DISAPPEARED: normal';
  end if;
  raise notice 'PASS: TG2 normal world grant, office, country and read policy';
end $assert_mode$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

-- Verify degraded through the actual authenticated World scope resolver.
update public.studio2_platform_operational_state
set mode='degraded',version=version+1,reason='Local TG2 platform-mode regression',
    changed_at=now()
where singleton=true;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $assert_mode$
declare
  v jsonb := current_setting('solaris.tg2_platform_fixture')::jsonb;
  v_org uuid := (v->>'organization')::uuid;
  v_country uuid := (v->>'country')::uuid;
  v_expected boolean := true;
begin
  perform set_config('request.jwt.claim.sub',v->>'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'user','role','authenticated'
  )::text,true);
  if auth.uid() is distinct from (v->>'user')::uuid then
    raise exception 'TG2_PLATFORM_MODE_WRONG_AUTH_CONTEXT';
  end if;
  if public.world_access_allowed('world.organization.profile.manage',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_DIRECT_GRANT_UNSAFE: degraded';
  end if;
  if public.world_access_allowed('world.membership.review',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_OFFICE_GRANT_UNSAFE: degraded';
  end if;
  if public.world_access_allowed('world.membership.withdraw',v_org,v_country)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_COUNTRY_GRANT_UNSAFE: degraded';
  end if;
  if not public.world_access_allowed('world.organization.view_private',v_org) then
    raise exception 'TG2_PLATFORM_MODE_READ_SCOPE_DISAPPEARED: degraded';
  end if;
  raise notice 'PASS: TG2 degraded world grant, office, country and read policy';
end $assert_mode$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

-- Verify read_only through the actual authenticated World scope resolver.
update public.studio2_platform_operational_state
set mode='read_only',version=version+1,reason='Local TG2 platform-mode regression',
    changed_at=now()
where singleton=true;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $assert_mode$
declare
  v jsonb := current_setting('solaris.tg2_platform_fixture')::jsonb;
  v_org uuid := (v->>'organization')::uuid;
  v_country uuid := (v->>'country')::uuid;
  v_expected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',v->>'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'user','role','authenticated'
  )::text,true);
  if auth.uid() is distinct from (v->>'user')::uuid then
    raise exception 'TG2_PLATFORM_MODE_WRONG_AUTH_CONTEXT';
  end if;
  if public.world_access_allowed('world.organization.profile.manage',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_DIRECT_GRANT_UNSAFE: read_only';
  end if;
  if public.world_access_allowed('world.membership.review',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_OFFICE_GRANT_UNSAFE: read_only';
  end if;
  if public.world_access_allowed('world.membership.withdraw',v_org,v_country)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_COUNTRY_GRANT_UNSAFE: read_only';
  end if;
  if not public.world_access_allowed('world.organization.view_private',v_org) then
    raise exception 'TG2_PLATFORM_MODE_READ_SCOPE_DISAPPEARED: read_only';
  end if;
  raise notice 'PASS: TG2 read_only world grant, office, country and read policy';
end $assert_mode$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

-- Verify maintenance through the actual authenticated World scope resolver.
update public.studio2_platform_operational_state
set mode='maintenance',version=version+1,reason='Local TG2 platform-mode regression',
    changed_at=now()
where singleton=true;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $assert_mode$
declare
  v jsonb := current_setting('solaris.tg2_platform_fixture')::jsonb;
  v_org uuid := (v->>'organization')::uuid;
  v_country uuid := (v->>'country')::uuid;
  v_expected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',v->>'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'user','role','authenticated'
  )::text,true);
  if auth.uid() is distinct from (v->>'user')::uuid then
    raise exception 'TG2_PLATFORM_MODE_WRONG_AUTH_CONTEXT';
  end if;
  if public.world_access_allowed('world.organization.profile.manage',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_DIRECT_GRANT_UNSAFE: maintenance';
  end if;
  if public.world_access_allowed('world.membership.review',v_org)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_OFFICE_GRANT_UNSAFE: maintenance';
  end if;
  if public.world_access_allowed('world.membership.withdraw',v_org,v_country)
       is distinct from v_expected then
    raise exception 'TG2_PLATFORM_MODE_COUNTRY_GRANT_UNSAFE: maintenance';
  end if;
  if not public.world_access_allowed('world.organization.view_private',v_org) then
    raise exception 'TG2_PLATFORM_MODE_READ_SCOPE_DISAPPEARED: maintenance';
  end if;
  raise notice 'PASS: TG2 maintenance world grant, office, country and read policy';
end $assert_mode$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

rollback;

do $clean$
begin
  if exists(select 1 from auth.users where email like '%@tg2-platform-mode.invalid')
     or exists(select 1 from public.countries where short_code='ZXV') then
    raise exception 'TG2_PLATFORM_MODE_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: TG2 platform-mode rollback and cleanup';
end $clean$;
