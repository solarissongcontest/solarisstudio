-- Run only through the loopback-only shell runner after the TG1/TG2 migrations.
-- Real Postgres roles exercise RLS and the canonical RPC in one rolled-back
-- transaction. No hosted credentials, persistent fixtures, or rollout changes.
\set ON_ERROR_STOP on
begin;

do $fixtures$
declare
  v_self uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_other_person uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_other_country uuid := gen_random_uuid();
  v_public_org uuid := gen_random_uuid();
  v_private_org uuid := gen_random_uuid();
  v_public_office uuid := gen_random_uuid();
  v_private_office uuid := gen_random_uuid();
  v_other_office uuid := gen_random_uuid();
  v_public_term uuid := gen_random_uuid();
  v_private_term uuid := gen_random_uuid();
  v_other_term uuid := gen_random_uuid();
  v_public_rep uuid := gen_random_uuid();
  v_private_rep uuid := gen_random_uuid();
  v_other_rep uuid := gen_random_uuid();
  v_delegation_grant uuid := gen_random_uuid();
  v_hidden_organ uuid := gen_random_uuid();
  v_hidden_office uuid := gen_random_uuid();
  v_hidden_term uuid := gen_random_uuid();
  v_grant uuid := gen_random_uuid();
  v_public_slug text := 'tg2-identity-privacy-fixture-public-' || replace(gen_random_uuid()::text, '-', '');
  v_private_slug text := 'tg2-identity-privacy-fixture-private-' || replace(gen_random_uuid()::text, '-', '');
begin
  if to_regprocedure('private.world_office_term_identity_read_allowed_v1(uuid,uuid)') is null then
    raise exception 'TG2_IDENTITY_PRIVACY_MIGRATION_NOT_INSTALLED';
  end if;
  if has_function_privilege('anon', 'private.world_office_term_identity_read_allowed_v1(uuid,uuid)', 'EXECUTE') then
    raise exception 'TG2_IDENTITY_PRIVACY_HELPER_ANON_EXECUTE';
  end if;
  if has_table_privilege('authenticated', 'public.world_organization_representations', 'INSERT')
     or has_table_privilege('authenticated', 'public.world_office_terms', 'UPDATE') then
    raise exception 'TG2_IDENTITY_PRIVACY_UNEXPECTED_BROWSER_DML';
  end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values
    (v_self, 'authenticated', 'authenticated', v_self::text || '@tg2-privacy.invalid', now(), now()),
    (v_manager, 'authenticated', 'authenticated', v_manager::text || '@tg2-privacy.invalid', now(), now()),
    (v_outsider, 'authenticated', 'authenticated', v_outsider::text || '@tg2-privacy.invalid', now(), now()),
    (v_other, 'authenticated', 'authenticated', v_other::text || '@tg2-privacy.invalid', now(), now());

  insert into public.delegation_people (id, display_name, identity_key)
  values
    (v_person, 'TG2 Privacy Holder', 'tg2-privacy:' || v_person::text),
    (v_other_person, 'TG2 Other Holder', 'tg2-privacy:' || v_other_person::text);
  insert into public.countries (id, name, short_code)
  values
    (v_country, 'TG2 Privacy Country', 'ZZP'),
    (v_other_country, 'TG2 Other Country', 'ZZQ');

  -- Seed the canonical CURRENT owner for the public-safe identity assertion.
  -- This also remains valid once #1971 tightens the projection's owner join.
  insert into public.country_accounts (user_id, country_id)
  values (v_self, v_country);

  -- TG1 durable identity rows are public only through their safe projection;
  -- raw user_id linkage must not leak via generic delegation.read.
  insert into public.world_country_control_terms
    (country_id, person_id, user_id, source)
  values
    (v_country, v_person, v_self, 'tg1_identity_privacy_fixture'),
    (v_other_country, v_other_person, v_other, 'tg1_identity_privacy_fixture');

  -- Regression actor has an explicit delegation.read grant, previously
  -- sufficient for the broad TG1 history policy.
  insert into public.studio2_capability_grants (id, user_id, capability, edition_id)
  values (v_delegation_grant, v_outsider, 'delegation.read', null);

  insert into public.world_organizations
    (id, slug, official_name, short_name, type, status, public_visibility)
  values
    (v_public_org, v_public_slug, 'TG2 Public Privacy Fixture', 'TG2 Public', 'international_organization', 'active', 'public'),
    (v_private_org, v_private_slug, 'TG2 Private Privacy Fixture', 'TG2 Private', 'international_organization', 'active', 'private');

  -- The organization is public, but this one organ is explicitly private.
  insert into public.world_organization_organs
    (id, organization_id, slug, name, visibility)
  values (v_hidden_organ, v_public_org, 'private-committee', 'Private TG2 Committee', 'private');

  insert into public.world_organization_offices
    (id, organization_id, slug, title, office_type, appointment_method)
  values
    (v_public_office, v_public_org, 'holder', 'Public Holder', 'executive_leader', 'appointment'),
    (v_private_office, v_private_org, 'holder', 'Private Holder', 'executive_leader', 'appointment'),
    (v_other_office, v_public_org, 'other-holder', 'Other Holder', 'executive_leader', 'appointment');
  insert into public.world_organization_offices
    (id, organization_id, organ_id, slug, title, office_type, appointment_method)
  values (v_hidden_office, v_public_org, v_hidden_organ, 'private-officer',
          'Private TG2 Officer', 'executive_leader', 'appointment');

  insert into public.world_office_terms
    (id, office_id, holder_person_id, holder_user_id, represented_country_id, started_at, term_kind, status)
  values
    (v_public_term, v_public_office, v_person, v_self, v_country, now(), 'full', 'active'),
    (v_private_term, v_private_office, v_person, v_self, v_country, now(), 'full', 'active'),
    (v_other_term, v_other_office, v_other_person, v_other, v_other_country, now(), 'full', 'active');
  insert into public.world_office_terms
    (id, office_id, holder_person_id, holder_user_id, represented_country_id, started_at, term_kind, status)
  values (v_hidden_term, v_hidden_office, v_other_person, v_other, v_country, now(), 'full', 'active');

  insert into public.world_organization_representations
    (id, organization_id, country_id, person_id, user_id, source)
  values
    (v_public_rep, v_public_org, v_country, v_person, v_self, 'rollback_fixture'),
    (v_private_rep, v_private_org, v_country, v_person, v_self, 'rollback_fixture'),
    (v_other_rep, v_public_org, v_other_country, v_other_person, v_other, 'rollback_fixture');

  -- One existing Permission Engine grant, with separate exact world scopes.
  -- The manager is deliberately neither a platform administrator nor a holder.
  insert into public.studio2_capability_grants (id, user_id, capability, edition_id)
  values (v_grant, v_manager, 'world.organization.view_private', null);
  insert into public.world_capability_grant_scopes
    (grant_id, organization_id, country_id, object_type, object_id)
  values
    (v_grant, v_public_org, v_country, 'representation', v_public_rep),
    (v_grant, v_private_org, v_country, 'representation', v_private_rep),
    (v_grant, v_public_org, v_country, 'office', v_public_office),
    (v_grant, v_private_org, v_country, 'office', v_private_office);

  -- Grant only one private office + organ + country, never all offices.
  insert into public.world_capability_grant_scopes
    (grant_id, organization_id, country_id, organ_id, object_type, object_id)
  values (v_grant, v_public_org, v_country, v_hidden_organ, 'office', v_hidden_office);

  -- Same organization is a database invariant, not a client convention.
  -- These failures must happen at the FK before any authorization check.
  begin
    insert into public.world_organization_offices
      (organization_id, organ_id, slug, title, office_type, appointment_method)
    values
      (v_private_org, v_hidden_organ, 'invalid-cross-organization-office',
       'Invalid TG2 Cross Organization Officer', 'executive_leader', 'appointment');
    raise exception 'TG2_CROSS_ORG_OFFICE_FK_MISSING';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.world_capability_grant_scopes
      (grant_id, organization_id, organ_id)
    values
      (v_grant, v_private_org, v_hidden_organ);
    raise exception 'TG2_CROSS_ORG_GRANT_SCOPE_FK_MISSING';
  exception when foreign_key_violation then
    null;
  end;

  raise notice 'PASS: TG2 cannot attach offices or private grant scopes to a foreign institution organ';

  perform set_config('solaris.tg2_identity_privacy_fixture', jsonb_build_object(
    'selfUserId', v_self, 'managerUserId', v_manager,
    'outsiderUserId', v_outsider, 'otherUserId', v_other,
    'personId', v_person, 'countryId', v_country,
    'publicOrgId', v_public_org, 'privateOrgId', v_private_org,
    'publicSlug', v_public_slug, 'privateSlug', v_private_slug,
    'publicRepId', v_public_rep, 'privateRepId', v_private_rep, 'otherRepId', v_other_rep,
    'publicOfficeId', v_public_office, 'privateOfficeId', v_private_office,
    'publicTermId', v_public_term, 'privateTermId', v_private_term, 'otherTermId', v_other_term,
    'hiddenOfficeId', v_hidden_office, 'hiddenOrganId', v_hidden_organ,
    'hiddenTermId', v_hidden_term,
    'grantId', v_grant
  )::text, true);
end
$fixtures$;

set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"anon"}';
do $anonymous$
declare
  v jsonb := current_setting('solaris.tg2_identity_privacy_fixture')::jsonb;
  v_projection jsonb;
begin
  if current_user <> 'anon' or auth.uid() is not null then
    raise exception 'TG2_IDENTITY_PRIVACY_ANON_ROLE_NOT_ACTIVE';
  end if;
  begin
    perform user_id from public.world_country_control_terms;
    raise exception 'TG1_CONTROLLER_LINK_ANON_RAW_SELECT_ALLOWED';
  exception when insufficient_privilege then
    null;
  end;
  if not exists (
    select 1 from public.world_country_identity_v1((v ->> 'countryId')::uuid)
    where controller_person_id = (v ->> 'personId')::uuid
      and controller_display_name = 'TG2 Privacy Holder'
  ) then
    raise exception 'TG1_CONTROLLER_LINK_PUBLIC_PERSON_IDENTITY_LOST';
  end if;

  begin
    perform user_id from public.world_organization_representations;
    raise exception 'TG2_IDENTITY_PRIVACY_ANON_REP_RAW_SELECT_ALLOWED';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform holder_user_id from public.world_office_terms;
    raise exception 'TG2_IDENTITY_PRIVACY_ANON_OFFICE_RAW_SELECT_ALLOWED';
  exception when insufficient_privilege then
    null;
  end;

  v_projection := public.world_organization_projection_v1(v ->> 'publicSlug');
  if v_projection is null
     or v_projection #>> '{organization,id}' is distinct from v ->> 'publicOrgId'
     or not exists (
       select 1 from jsonb_array_elements(v_projection -> 'representatives') item
       where item ->> 'id' = v ->> 'publicRepId'
         and item ->> 'personId' = v ->> 'personId'
         and item ->> 'displayName' = 'TG2 Privacy Holder'
     )
     or not exists (
       select 1 from jsonb_array_elements(v_projection -> 'offices') item
       where item ->> 'id' = v ->> 'publicOfficeId'
         and item #>> '{currentTerm,id}' = v ->> 'publicTermId'
         and item #>> '{currentTerm,holderPersonId}' = v ->> 'personId'
         and item #>> '{currentTerm,holderDisplayName}' = 'TG2 Privacy Holder'
     ) then
    raise exception 'TG2_IDENTITY_PRIVACY_PUBLIC_PERSON_PROJECTION_LOST';
  end if;
  if v_projection::text ~ '"(userId|user_id|holderUserId|holder_user_id|proxyUserId|proxy_user_id)"'
     or strpos(v_projection::text, v ->> 'selfUserId') > 0
     or strpos(v_projection::text, v ->> 'otherUserId') > 0 then
    raise exception 'TG2_IDENTITY_PRIVACY_PUBLIC_PROJECTION_AUTH_LINK_LEAK';
  end if;
  if exists (
    select 1 from public.world_organization_offices
    where id = (v ->> 'hiddenOfficeId')::uuid
  ) or exists (
    select 1
    from jsonb_array_elements(v_projection -> 'offices') office_item
    where office_item ->> 'id' = v ->> 'hiddenOfficeId'
  ) then
    raise exception 'TG2_NONPUBLIC_ORGAN_OFFICE_ANON_LEAK';
  end if;

  if public.world_organization_projection_v1(v ->> 'privateSlug') is not null then
    raise exception 'TG2_IDENTITY_PRIVACY_PRIVATE_ORGANIZATION_PUBLICLY_VISIBLE';
  end if;
  raise notice 'PASS: TG2 anonymous raw linkage denied; canonical public/private projection boundary preserved';
end
$anonymous$;
reset role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $outsider$
declare
  v jsonb := current_setting('solaris.tg2_identity_privacy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub', v ->> 'outsiderUserId', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v ->> 'outsiderUserId', 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from (v ->> 'outsiderUserId')::uuid
     or public.studio2_access_allowed('system.manage', null, false) then
    raise exception 'TG2_IDENTITY_PRIVACY_OUTSIDER_ROLE_NOT_ACTIVE';
  end if;
  if exists (
    select user_id from public.world_organization_representations
    where id in ((v ->> 'publicRepId')::uuid, (v ->> 'privateRepId')::uuid)
  ) or exists (
    select holder_user_id from public.world_office_terms
    where id in ((v ->> 'publicTermId')::uuid, (v ->> 'privateTermId')::uuid)
  ) then
    raise exception 'TG2_IDENTITY_PRIVACY_UNRELATED_AUTHENTICATED_LINK_LEAK';
  end if;
  if exists (
    select user_id from public.world_country_control_terms
    where country_id = (v ->> 'countryId')::uuid
  ) then
    raise exception 'TG1_CONTROLLER_LINK_UNRELATED_LOGIN_LEAK';
  end if;

  if exists (
    select 1 from public.world_organization_offices
    where id = (v ->> 'hiddenOfficeId')::uuid
  ) then
    raise exception 'TG2_NONPUBLIC_ORGAN_OFFICE_UNSCOPED_AUTH_LEAK';
  end if;

  if public.world_organization_projection_v1(v ->> 'publicSlug') is null
     or public.world_organization_projection_v1(v ->> 'privateSlug') is not null then
    raise exception 'TG2_IDENTITY_PRIVACY_OUTSIDER_PROJECTION_BOUNDARY';
  end if;
  raise notice 'PASS: TG2 unrelated authenticated subject cannot read public or private auth linkage';
end
$outsider$;

do $self$
declare
  v jsonb := current_setting('solaris.tg2_identity_privacy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub', v ->> 'selfUserId', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v ->> 'selfUserId', 'role', 'authenticated')::text, true);
  if not exists (
    select 1 from public.world_country_control_terms
    where country_id = (v ->> 'countryId')::uuid
      and user_id = auth.uid()
  ) or exists (
    select 1 from public.world_country_control_terms
    where country_id <> (v ->> 'countryId')::uuid
  ) then
    raise exception 'TG1_CONTROLLER_LINK_SELF_READ_LOST';
  end if;

  if (select count(*) from public.world_organization_representations
      where id in ((v ->> 'publicRepId')::uuid, (v ->> 'privateRepId')::uuid)
        and user_id = auth.uid()) <> 2
     or (select count(*) from public.world_office_terms
      where id in ((v ->> 'publicTermId')::uuid, (v ->> 'privateTermId')::uuid)
        and holder_user_id = auth.uid()) <> 2 then
    raise exception 'TG2_IDENTITY_PRIVACY_LEGITIMATE_SELF_READ_LOST';
  end if;
  if exists (select user_id from public.world_organization_representations where id = (v ->> 'otherRepId')::uuid)
     or exists (select holder_user_id from public.world_office_terms where id = (v ->> 'otherTermId')::uuid) then
    raise exception 'TG2_IDENTITY_PRIVACY_SELF_READ_ESCAPES_OWN_IDENTITY';
  end if;
  if public.world_organization_projection_v1(v ->> 'privateSlug') is not null then
    raise exception 'TG2_IDENTITY_PRIVACY_SELF_PRIVATE_PUBLIC_RPC_BYPASS';
  end if;
  raise notice 'PASS: TG2 own public/private representation and office linkage remains readable';
end
$self$;

do $manager$
declare
  v jsonb := current_setting('solaris.tg2_identity_privacy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub', v ->> 'managerUserId', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v ->> 'managerUserId', 'role', 'authenticated')::text, true);
  if public.studio2_access_allowed('system.manage', null, false) then
    raise exception 'TG2_IDENTITY_PRIVACY_MANAGER_MUST_USE_EXPLICIT_SCOPE';
  end if;
  -- A private organization scope is not platform-wide login linkage access.
  if exists (
    select user_id from public.world_country_control_terms
    where country_id = (v ->> 'countryId')::uuid
  ) then
    raise exception 'TG1_CONTROLLER_LINK_MANAGER_WORLD_SCOPE_BYPASS';
  end if;

  if (select count(user_id) from public.world_organization_representations
      where id in ((v ->> 'publicRepId')::uuid, (v ->> 'privateRepId')::uuid)) <> 2
     or (select count(holder_user_id) from public.world_office_terms
      where id in ((v ->> 'publicTermId')::uuid, (v ->> 'privateTermId')::uuid)) <> 2 then
    raise exception 'TG2_IDENTITY_PRIVACY_SCOPED_PUBLIC_PRIVATE_MANAGER_READ_LOST';
  end if;
  if exists (select user_id from public.world_organization_representations where id = (v ->> 'otherRepId')::uuid)
     or exists (select holder_user_id from public.world_office_terms where id = (v ->> 'otherTermId')::uuid) then
    raise exception 'TG2_IDENTITY_PRIVACY_MANAGER_ESCAPES_EXACT_OBJECT_SCOPE';
  end if;
  if not exists (
    select 1 from public.world_organization_offices
    where id = (v ->> 'hiddenOfficeId')::uuid
  ) or not exists (
    select 1 from public.world_office_terms
    where id = (v ->> 'hiddenTermId')::uuid
  ) then
    raise exception 'TG2_NONPUBLIC_ORGAN_OFFICE_SCOPED_MANAGER_READ_LOST';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(public.world_organization_projection_v1(v ->> 'publicSlug') -> 'offices') office_item
    where office_item ->> 'id' = v ->> 'hiddenOfficeId'
  ) then
    raise exception 'TG2_NONPUBLIC_ORGAN_OFFICE_SCOPED_MANAGER_PUBLIC_RPC_BYPASS';
  end if;

  if public.world_organization_projection_v1(v ->> 'publicSlug') is null
     or public.world_organization_projection_v1(v ->> 'privateSlug') is not null then
    raise exception 'TG2_IDENTITY_PRIVACY_MANAGER_PUBLIC_RPC_BOUNDARY';
  end if;
  raise notice 'PASS: TG2 exact-scope manager reads public/private linkage without broader object access';
end
$manager$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';

update public.studio2_capability_grants
set expires_at = now() - interval '1 second'
where id = (current_setting('solaris.tg2_identity_privacy_fixture')::jsonb ->> 'grantId')::uuid;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $expired_manager$
declare
  v jsonb := current_setting('solaris.tg2_identity_privacy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub', v ->> 'managerUserId', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v ->> 'managerUserId', 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from (v ->> 'managerUserId')::uuid then
    raise exception 'TG2_IDENTITY_PRIVACY_EXPIRED_MANAGER_ROLE_NOT_ACTIVE';
  end if;
  if exists (
    select user_id from public.world_organization_representations
    where id in ((v ->> 'publicRepId')::uuid, (v ->> 'privateRepId')::uuid)
  ) or exists (
    select holder_user_id from public.world_office_terms
    where id in ((v ->> 'publicTermId')::uuid, (v ->> 'privateTermId')::uuid)
  ) then
    raise exception 'TG2_IDENTITY_PRIVACY_EXPIRED_GRANT_STILL_READS_LINKAGE';
  end if;
  raise notice 'PASS: TG2 expired world capability grant no longer exposes auth linkage';
end
$expired_manager$;
reset role;


rollback;

do $rolled_back$
begin
  if exists (
    select 1 from public.world_organizations
    where slug like 'tg2-identity-privacy-fixture-%'
  ) or exists (
    select 1 from auth.users where email like '%@tg2-privacy.invalid'
  ) then
    raise exception 'TG2_IDENTITY_PRIVACY_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: TG2 identity-linkage privacy rehearsal rolled back';
end
$rolled_back$;
