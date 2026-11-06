-- TG19: publication-safe World projections, isolated/rollback-only PostgreSQL.
-- This fixture proves private orgs/organs/offices are hidden from direct API
-- reads even while the TG3 World UI feature is still dark.
-- Feature rollout controls UI access; public_visibility remains canonical
-- publication authority for already-public institutional records.
begin;

do $preflight$
begin
  if to_regprocedure('public.world_organization_projection_v1(text)') is null
     or to_regclass('public.studio2_feature_flags') is null
     or to_regclass('public.world_organization_offices') is null then
    raise exception 'TG19_WORLD_SCHEMA_NOT_ADOPTED';
  end if;
  if not exists (
    select 1 from public.studio2_feature_flags
    where key = 'terra_world_public' and enabled = false
  ) then
    raise exception 'TG19_WORLD_DARK_ROLLOUT_REQUIRED';
  end if;
end
$preflight$;

-- All fixtures are created and reverted within this one transaction.
insert into public.world_organizations
  (slug, official_name, short_name, type, status, public_visibility)
values
  ('tg19-c708-public', 'TG19 Rollout Visible Test', 'TG19 Visible',
   'international_organization', 'active', 'public'),
  ('tg19-c708-private', 'TG19 Rollout Private Test', 'TG19 Private',
   'international_organization', 'active', 'private');

insert into public.world_organization_organs
  (organization_id, slug, name, visibility)
select id, 'tg19-public-organ', 'Public test organ', 'public'
from public.world_organizations where slug = 'tg19-c708-public';

insert into public.world_organization_organs
  (organization_id, slug, name, visibility)
select id, 'tg19-secret-organ', 'Secret test organ', 'private'
from public.world_organizations where slug = 'tg19-c708-public';

insert into public.world_organization_offices
  (organization_id, organ_id, slug, title, office_type, appointment_method)
select o.id, organ.id, 'tg19-secret-office', 'Secret test office',
  'executive_leader', 'election'
from public.world_organizations o
join public.world_organization_organs organ on organ.organization_id = o.id
where o.slug = 'tg19-c708-public' and organ.slug = 'tg19-secret-organ';

insert into public.world_organization_offices
  (organization_id, organ_id, slug, title, office_type, appointment_method)
select o.id, organ.id, 'tg19-public-office', 'Public test office',
  'executive_leader', 'election'
from public.world_organizations o
join public.world_organization_organs organ on organ.organization_id = o.id
where o.slug = 'tg19-c708-public' and organ.slug = 'tg19-public-organ';

-- Membership histories must also obey the organization visibility boundary.
-- Fixed fixture UUIDs permit a direct RLS check without resolving a private
-- organization ID through another RLS-restricted SELECT.
insert into public.countries (id, name, short_code)
values ('c7080000-0000-4000-8000-000000000003', 'TG19 Isolation Country', 'T19');

insert into public.world_organization_memberships
  (id, organization_id, country_id, membership_type, status)
select case when slug = 'tg19-c708-public'
    then 'c7080000-0000-4000-8000-000000000001'::uuid
    else 'c7080000-0000-4000-8000-000000000002'::uuid end,
  id, 'c7080000-0000-4000-8000-000000000003'::uuid, 'member', 'member'
from public.world_organizations
where slug in ('tg19-c708-public', 'tg19-c708-private');

-- Both caller roles have NO World management capability or JWT identity.
-- The SECURITY DEFINER RPC must implement its own publication filtering.
set local role anon;
do $anonymous$
declare
  visible jsonb;
begin
  if exists (
    select 1 from public.world_organizations where slug = 'tg19-c708-private'
  ) then
    raise exception 'TG19_ANON_PRIVATE_ORGANIZATION_RLS_LEAK';
  end if;
  if not exists (
    select 1 from public.world_organizations where slug = 'tg19-c708-public'
  ) then
    raise exception 'TG19_ANON_PUBLIC_ORGANIZATION_MISSING';
  end if;
  if exists (
    select 1 from public.world_organization_memberships
    where id = 'c7080000-0000-4000-8000-000000000002'
  ) then
    raise exception 'TG19_NO_JWT_PRIVATE_MEMBERSHIP_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-c708-private') is not null then
    raise exception 'TG19_ANON_PRIVATE_PROJECTION_LEAK';
  end if;
  if exists (
    select 1 from public.world_organization_organs
    where slug = 'tg19-secret-organ'
  ) or exists (
    select 1 from public.world_organization_offices
    where slug = 'tg19-secret-office'
  ) then
    raise exception 'TG19_ANON_PRIVATE_CHILD_RLS_LEAK';
  end if;

  if exists (
    select 1 from public.world_organization_memberships
    where id = 'c7080000-0000-4000-8000-000000000002'
  ) then
    raise exception 'TG19_ANON_PRIVATE_MEMBERSHIP_RLS_LEAK';
  end if;
  if not exists (
    select 1 from public.world_organization_memberships
    where id = 'c7080000-0000-4000-8000-000000000001'
  ) then
    raise exception 'TG19_ANON_PUBLIC_MEMBERSHIP_MISSING';
  end if;

  visible := public.world_organization_projection_v1('tg19-c708-public');
  if visible is null or visible->'organization'->>'slug' <> 'tg19-c708-public' then
    raise exception 'TG19_ANON_PUBLIC_PROJECTION_MISSING';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(visible->'organs') organ
    where organ->>'slug' = 'tg19-public-organ'
  ) or not exists (
    select 1 from jsonb_array_elements(visible->'offices') office
    where office->>'slug' = 'tg19-public-office'
  ) then
    raise exception 'TG19_ANON_PUBLIC_CHILDREN_MISSING';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(visible->'memberships') member
    where member->>'id' = 'c7080000-0000-4000-8000-000000000001'
  ) then
    raise exception 'TG19_ANON_PUBLIC_MEMBERSHIP_PROJECTION_MISSING';
  end if;
  if exists (
    select 1 from jsonb_array_elements(visible->'organs') organ
    where organ->>'slug' = 'tg19-secret-organ'
  ) or exists (
    select 1 from jsonb_array_elements(visible->'offices') office
    where office->>'slug' = 'tg19-secret-office'
  ) then
    raise exception 'TG19_ANON_PRIVATE_CHILD_PROJECTION_LEAK';
  end if;
  if visible::text ~* '"(user_id|holder_user_id|proxy_user_id|email)"\s*:' then
    raise exception 'TG19_PUBLIC_PROJECTION_LOGIN_PII_LEAK';
  end if;
end
$anonymous$;

set local role authenticated;
do $no_jwt$
begin
  if exists (
    select 1 from public.world_organizations where slug = 'tg19-c708-private'
  ) then
    raise exception 'TG19_NO_JWT_PRIVATE_ORGANIZATION_LEAK';
  end if;
  if public.world_organization_projection_v1('tg19-c708-private') is not null then
    raise exception 'TG19_NO_JWT_PRIVATE_PROJECTION_LEAK';
  end if;
  if exists (
    select 1 from public.world_organization_organs where slug = 'tg19-secret-organ'
  ) or exists (
    select 1 from public.world_organization_offices where slug = 'tg19-secret-office'
  ) then
    raise exception 'TG19_NO_JWT_PRIVATE_CHILD_LEAK';
  end if;
end
$no_jwt$;
reset role;

-- Always discard fixtures. A failure aborts this transaction as well.
rollback;
