-- Run ONLY via the loopback-only wrapper after local Supabase migrations.
-- All fixtures and feature-flag changes are rolled back.
begin;

do $fixtures$
declare
  v_proposed uuid;
  v_accepted uuid;
  v_private uuid;
begin
  if not exists (select 1 from public.studio2_feature_flags where key='terra_world_public') then
    raise exception 'TG19_WORLD_ROLLOUT_FLAG_MISSING';
  end if;
  update public.studio2_feature_flags
    set enabled=false, admins_only=false, user_ids='{}'::uuid[], edition_ids='{}'::uuid[]
    where key='terra_world_public';

  insert into public.world_organizations(slug,official_name,short_name,status,public_visibility)
  values ('tg19-proposed-union-test','TG19 proposed institution test','TG19 Proposed','proposed','public')
  returning id into v_proposed;
  insert into public.world_organizations(slug,official_name,short_name,status,public_visibility)
  values ('tg19-recognized-union-test','TG19 recognized institution test','TG19 Recognized','recognized','public')
  returning id into v_accepted;
  insert into public.world_organizations(slug,official_name,short_name,status,public_visibility)
  values ('tg19-private-union-test','TG19 private institution test','TG19 Private','active','private')
  returning id into v_private;

  insert into public.world_organization_organs(organization_id,slug,name,visibility)
  values
    (v_proposed,'proposed-assembly','Proposed Assembly','public'),
    (v_accepted,'recognized-assembly','Recognized Assembly','public'),
    (v_accepted,'private-committee','Private Committee','private');

  insert into public.world_organization_offices
    (organization_id,slug,title,office_type,appointment_method)
  values
    (v_proposed,'proposed-chair','Proposed Chair','executive_leader','election'),
    (v_accepted,'recognized-chair','Recognized Chair','executive_leader','election');

  insert into public.world_organization_offices
    (organization_id,organ_id,slug,title,office_type,appointment_method)
  select v_accepted,id,'private-chair','Private Chair','executive_leader','election'
  from public.world_organization_organs
  where organization_id=v_accepted and slug='private-committee';
end
$fixtures$;

-- Even recognized public identities must stay dark before rollout.
set local role anon;
do $dark$
begin
  if exists (select 1 from public.world_organizations where slug like 'tg19-%-union-test') then
    raise exception 'TG19_WORLD_DARK_FLAG_DIRECT_TABLE_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-recognized-union-test') is not null then
    raise exception 'TG19_WORLD_DARK_FLAG_SECURITY_DEFINER_LEAK';
  end if;
end
$dark$;
reset role;

-- Local transactional test flag activation, never a production rollout.
update public.studio2_feature_flags set enabled=true
where key='terra_world_public';

set local role anon;
do $visible$
begin
  if (select count(*) from public.world_organizations where slug='tg19-recognized-union-test') <> 1 then
    raise exception 'TG19_WORLD_RECOGNIZED_PUBLIC_UNAVAILABLE';
  end if;
  if exists (select 1 from public.world_organizations where slug in ('tg19-proposed-union-test','tg19-private-union-test')) then
    raise exception 'TG19_WORLD_PROPOSED_OR_PRIVATE_TABLE_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-proposed-union-test') is not null then
    raise exception 'TG19_WORLD_PROPOSED_SECURITY_DEFINER_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-private-union-test') is not null then
    raise exception 'TG19_WORLD_PRIVATE_SECURITY_DEFINER_LEAK';
  end if;
  if (public.world_organization_projection_v1('tg19-recognized-union-test')->'organization'->>'slug') is distinct from 'tg19-recognized-union-test' then
    raise exception 'TG19_WORLD_RECOGNIZED_PROJECTION_UNAVAILABLE';
  end if;
  if (select count(*) from public.world_organization_organs where slug='proposed-assembly') <> 0 then
    raise exception 'TG19_WORLD_PROPOSED_ORGAN_LEAK';
  end if;
  if (select count(*) from public.world_organization_organs where slug='recognized-assembly') <> 1 then
    raise exception 'TG19_WORLD_RECOGNIZED_ORGAN_UNAVAILABLE';
  end if;
  if (select count(*) from public.world_organization_organs where slug='private-committee') <> 0 then
    raise exception 'TG19_WORLD_PRIVATE_ORGAN_LEAK';
  end if;
  if (select count(*) from public.world_organization_offices where slug='proposed-chair') <> 0 then
    raise exception 'TG19_WORLD_PROPOSED_OFFICE_LEAK';
  end if;
  if (select count(*) from public.world_organization_offices where slug='recognized-chair') <> 1 then
    raise exception 'TG19_WORLD_RECOGNIZED_OFFICE_UNAVAILABLE';
  end if;
  if (select count(*) from public.world_organization_offices where slug='private-chair') <> 0 then
    raise exception 'TG19_WORLD_PRIVATE_OFFICE_LEAK';
  end if;
end
$visible$;
reset role;

-- Authentication alone must not disclose proposed/private institutions.
set local role authenticated;
do $unauthorized_authenticated$
begin
  if exists (select 1 from public.world_organizations where slug in ('tg19-proposed-union-test','tg19-private-union-test')) then
    raise exception 'TG19_WORLD_UNSCOPED_AUTH_INSTITUTION_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-proposed-union-test') is not null then
    raise exception 'TG19_WORLD_UNSCOPED_AUTH_PROJECTION_LEAK';
  end if;
end
$unauthorized_authenticated$;
reset role;

rollback;
