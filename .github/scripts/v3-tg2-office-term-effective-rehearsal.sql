-- Execute ONLY through the local-only TG2 rehearsal shell wrapper.
-- Transactional fixtures are never retained and never access hosted Supabase.
\set ON_ERROR_STOP on
begin;
do $seed$
declare
  v_user uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_office uuid := gen_random_uuid();
  v_org uuid;
begin
  select id into strict v_org from public.world_organizations where slug='guard';
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_user,'authenticated','authenticated',v_user::text || '@tg2-office-start.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values(v_person,'TG2 Future Office Holder','tg2-office-start:' || v_person::text);
  insert into public.world_organization_offices
    (id,organization_id,slug,title,office_type,appointment_method)
  values(v_office,v_org,'tg2-office-start-' || replace(v_office::text,'-',''),
    'TG2 Future Office Holder','executive_leader','appointment');
  insert into public.world_office_capabilities(office_id,capability)
  values(v_office,'world.membership.review');
  insert into public.world_office_terms
    (office_id,holder_person_id,holder_user_id,started_at,term_kind,status)
  values(v_office,v_person,v_user,now()+interval '1 day','full','active');
  perform set_config('solaris.tg2_office_effective_fixture',jsonb_build_object(
    'user',v_user,'office',v_office,'organization',v_org
  )::text,true);
end
$seed$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $future$
declare
  v jsonb := current_setting('solaris.tg2_office_effective_fixture')::jsonb;
  v_projection jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v ->> 'user','role','authenticated')::text,true);
  if auth.uid() is distinct from (v ->> 'user')::uuid then
    raise exception 'TG2_OFFICE_EFFECTIVE_AUTH_IDENTITY_MISMATCH';
  end if;
  if public.world_access_allowed('world.membership.review',(v ->> 'organization')::uuid) then
    raise exception 'TG2_OFFICE_EFFECTIVE_FUTURE_CAPABILITY_LEAK';
  end if;
  v_projection := public.world_organization_projection_v1('guard');
  if not exists(
    select 1 from jsonb_array_elements(v_projection -> 'offices') item
    where item ->> 'id' = v ->> 'office'
      and item -> 'currentTerm' = 'null'::jsonb
  ) then
    raise exception 'TG2_OFFICE_EFFECTIVE_FUTURE_PUBLICATION_LEAK';
  end if;
  raise notice 'PASS: future office term is neither authorized nor published as current';
end
$future$;
reset role;

update public.world_office_terms set started_at=now()-interval '1 day'
where office_id=(current_setting('solaris.tg2_office_effective_fixture')::jsonb ->> 'office')::uuid;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $current$
declare
  v jsonb := current_setting('solaris.tg2_office_effective_fixture')::jsonb;
  v_projection jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v ->> 'user','role','authenticated')::text,true);
  if not public.world_access_allowed('world.membership.review',(v ->> 'organization')::uuid) then
    raise exception 'TG2_OFFICE_EFFECTIVE_CURRENT_CAPABILITY_MISSING';
  end if;
  v_projection := public.world_organization_projection_v1('guard');
  if not exists(
    select 1 from jsonb_array_elements(v_projection -> 'offices') item
    where item ->> 'id' = v ->> 'office'
      and item -> 'currentTerm' ->> 'status'='active'
  ) then
    raise exception 'TG2_OFFICE_EFFECTIVE_CURRENT_PUBLICATION_MISSING';
  end if;
  raise notice 'PASS: begun office term is authorized and published as current';
end
$current$;
reset role;

update public.world_office_terms set status='ended', actual_end_at=now()
where office_id=(current_setting('solaris.tg2_office_effective_fixture')::jsonb ->> 'office')::uuid;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $ended$
declare v jsonb := current_setting('solaris.tg2_office_effective_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v ->> 'user','role','authenticated')::text,true);
  if public.world_access_allowed('world.membership.review',(v ->> 'organization')::uuid) then
    raise exception 'TG2_OFFICE_EFFECTIVE_ENDED_CAPABILITY_LEAK';
  end if;
  raise notice 'PASS: ended office term cannot confer authority';
end
$ended$;
reset role;
rollback;

do $clean$
begin
  if exists(select 1 from public.world_organization_offices where slug like 'tg2-office-start-%')
     or exists(select 1 from auth.users where email like '%@tg2-office-start.invalid') then
    raise exception 'TG2_OFFICE_EFFECTIVE_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: office-term fixture rollback';
end
$clean$;
