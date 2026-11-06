begin;

-- Terra Solaris Governance TG2 authorization and first governed mutation.
-- Permission Engine V2 remains the grant catalogue/identity. This layer only
-- resolves the additional world object scope that Edition scope cannot express.

create or replace function public.world_access_allowed(
  p_capability text,
  p_organization_id uuid,
  p_country_id uuid default null,
  p_organ_id uuid default null,
  p_object_type text default null,
  p_object_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $allowed$
  select coalesce(
    auth.uid() is not null
    and p_organization_id is not null
    and exists (
      select 1 from public.studio2_capabilities capability
      where capability.key = p_capability
    )
    and (
      public.studio2_access_allowed('system.manage', null, false)
      or exists (
        select 1
        from public.studio2_capability_grants grant_row
        join public.world_capability_grant_scopes scope_row
          on scope_row.grant_id = grant_row.id
        where grant_row.user_id = auth.uid()
          and grant_row.capability = p_capability
          and grant_row.edition_id is null
          and (grant_row.expires_at is null or grant_row.expires_at > now())
          and scope_row.organization_id = p_organization_id
          and (scope_row.country_id is null or scope_row.country_id is not distinct from p_country_id)
          and (scope_row.organ_id is null or scope_row.organ_id is not distinct from p_organ_id)
          and (
            scope_row.object_type is null
            or (
              scope_row.object_type is not distinct from p_object_type
              and scope_row.object_id is not distinct from p_object_id
            )
          )
      )
      or exists (
        select 1
        from public.world_office_terms term_row
        join public.world_organization_offices office_row
          on office_row.id = term_row.office_id
        join public.world_office_capabilities office_capability
          on office_capability.office_id = office_row.id
        where term_row.status = 'active'
          and term_row.ends_at is null
          and term_row.holder_user_id = auth.uid()
          and office_row.active
          and office_row.organization_id = p_organization_id
          and office_capability.capability = p_capability
          and (office_row.organ_id is null or office_row.organ_id is not distinct from p_organ_id)
      )
      or exists (
        select 1
        from public.world_country_controller_capabilities controller_capability
        join public.country_accounts account_row
          on account_row.user_id = auth.uid()
         and account_row.country_id = p_country_id
         and account_row.status = 'active'
        where controller_capability.capability = p_capability
      )
    ),
    false
  )
$allowed$;

revoke all on function public.world_access_allowed(text,uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_access_allowed(text,uuid,uuid,uuid,text,uuid)
  to authenticated, service_role;

-- Auth-linked histories are not public tables. Public readers receive only the
-- deliberately safe projection below; authenticated direct reads are scoped.
grant select on table public.world_organization_representations,
  public.world_representation_proxies,
  public.world_office_terms to authenticated;

create policy world_representations_scoped_read
on public.world_organization_representations
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.world_organizations organization_row
    where organization_row.id = world_organization_representations.organization_id
      and organization_row.public_visibility = 'public'
  )
  or public.world_access_allowed(
    'world.organization.view_private',
    organization_id,
    country_id,
    null,
    'representation',
    id
  )
);

create policy world_proxies_scoped_read
on public.world_representation_proxies
for select to authenticated
using (
  proxy_user_id = auth.uid()
  or exists (
    select 1
    from public.world_organization_representations representation_row
    where representation_row.id = world_representation_proxies.representation_id
      and (
        representation_row.user_id = auth.uid()
        or public.world_access_allowed(
          'world.organization.view_private',
          representation_row.organization_id,
          representation_row.country_id,
          null,
          'representation',
          representation_row.id
        )
      )
  )
);

create policy world_office_terms_scoped_read
on public.world_office_terms
for select to authenticated
using (
  holder_user_id = auth.uid()
  or exists (
    select 1
    from public.world_organization_offices office_row
    join public.world_organizations organization_row
      on organization_row.id = office_row.organization_id
    where office_row.id = world_office_terms.office_id
      and (
        organization_row.public_visibility = 'public'
        or public.world_access_allowed(
          'world.organization.view_private',
          office_row.organization_id,
          represented_country_id,
          office_row.organ_id,
          'office',
          office_row.id
        )
      )
  )
);

-- Explicit office capability bundles. Office titles are presentation; these
-- rows are authorization data. Deputies intentionally receive a smaller set.
insert into public.world_office_capabilities(office_id, capability)
select office_row.id, seed.capability
from public.world_organization_offices office_row
join public.world_organizations organization_row
  on organization_row.id = office_row.organization_id
join (values
  ('guard','chairperson','world.organization.profile.manage'),
  ('guard','chairperson','world.membership.review'),
  ('guard','chairperson','world.membership.introduce'),
  ('guard','chairperson','world.membership.execute_admission'),
  ('guard','chairperson','world.membership.execute_expulsion'),
  ('guard','chairperson','world.membership.suspend'),
  ('guard','chairperson','world.representation.manage'),
  ('guard','chairperson','world.proxy.approve'),
  ('guard','chairperson','world.office.manage'),
  ('guard','chairperson','world.office.term.assign'),
  ('guard','chairperson','world.office.term.transition'),
  ('guard','deputy-chairperson','world.organization.profile.manage'),
  ('guard','deputy-chairperson','world.membership.review'),
  ('guard','deputy-chairperson','world.representation.manage'),
  ('guard','deputy-chairperson','world.proxy.approve'),
  ('unity','secretary-general','world.organization.profile.manage'),
  ('unity','secretary-general','world.membership.review'),
  ('unity','secretary-general','world.membership.execute_expulsion'),
  ('unity','secretary-general','world.membership.suspend'),
  ('unity','secretary-general','world.representation.manage'),
  ('unity','secretary-general','world.proxy.approve'),
  ('unity','secretary-general','world.office.manage'),
  ('unity','secretary-general','world.office.term.assign'),
  ('unity','secretary-general','world.office.term.transition'),
  ('unity','deputy-secretary-general','world.organization.profile.manage'),
  ('unity','deputy-secretary-general','world.membership.review'),
  ('unity','deputy-secretary-general','world.representation.manage'),
  ('unity','deputy-secretary-general','world.proxy.approve')
) seed(organization_slug,office_slug,capability)
  on seed.organization_slug = organization_row.slug
 and seed.office_slug = office_row.slug
on conflict do nothing;

-- Public projection. SECURITY DEFINER is used only to compose safe public rows;
-- login linkage, private proxy state and capability grants are never returned.
create or replace function public.world_organization_projection_v1(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $projection$
  select jsonb_build_object(
    'organization', jsonb_build_object(
      'id', organization_row.id,
      'slug', organization_row.slug,
      'officialName', organization_row.official_name,
      'shortName', organization_row.short_name,
      'type', organization_row.type,
      'description', organization_row.description,
      'emblemUrl', organization_row.emblem_url,
      'bannerUrl', organization_row.banner_url,
      'accentToken', organization_row.accent_token,
      'status', organization_row.status,
      'revision', organization_row.revision
    ),
    'organs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', organ_row.id,
        'slug', organ_row.slug,
        'name', organ_row.name,
        'shortName', organ_row.short_name,
        'type', organ_row.type,
        'status', organ_row.status,
        'sortOrder', organ_row.sort_order,
        'revision', organ_row.revision
      ) order by organ_row.sort_order, organ_row.name)
      from public.world_organization_organs organ_row
      where organ_row.organization_id = organization_row.id
        and organ_row.visibility = 'public'
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership_row.id,
        'countryId', membership_row.country_id,
        'membershipType', membership_row.membership_type,
        'status', membership_row.status,
        'joinedAt', membership_row.joined_at,
        'endedAt', membership_row.ended_at,
        'revision', membership_row.revision
      ) order by membership_row.joined_at, membership_row.country_id)
      from public.world_organization_memberships membership_row
      where membership_row.organization_id = organization_row.id
    ), '[]'::jsonb),
    'representatives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', representation_row.id,
        'countryId', representation_row.country_id,
        'personId', representation_row.person_id,
        'displayName', person_row.display_name,
        'role', representation_row.role,
        'votingAuthority', representation_row.voting_authority,
        'startsAt', representation_row.starts_at,
        'endsAt', representation_row.ends_at,
        'revision', representation_row.revision
      ) order by representation_row.country_id, representation_row.starts_at)
      from public.world_organization_representations representation_row
      join public.delegation_people person_row
        on person_row.id = representation_row.person_id
      where representation_row.organization_id = organization_row.id
    ), '[]'::jsonb),
    'offices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', office_row.id,
        'slug', office_row.slug,
        'title', office_row.title,
        'officeType', office_row.office_type,
        'appointmentMethod', office_row.appointment_method,
        'defaultTermLengthEditions', office_row.default_term_length_editions,
        'successionPolicy', office_row.succession_policy,
        'active', office_row.active,
        'revision', office_row.revision,
        'currentTerm', (
          select jsonb_build_object(
            'id', term_row.id,
            'holderPersonId', term_row.holder_person_id,
            'holderDisplayName', holder_row.display_name,
            'representedCountryId', term_row.represented_country_id,
            'startEditionId', term_row.start_edition_id,
            'endEditionId', term_row.end_edition_id,
            'startsAt', term_row.starts_at,
            'endsAt', term_row.ends_at,
            'termKind', term_row.term_kind,
            'status', term_row.status,
            'revision', term_row.revision
          )
          from public.world_office_terms term_row
          join public.delegation_people holder_row
            on holder_row.id = term_row.holder_person_id
          where term_row.office_id = office_row.id
            and term_row.status = 'active'
          limit 1
        )
      ) order by office_row.display_priority, office_row.title)
      from public.world_organization_offices office_row
      where office_row.organization_id = organization_row.id
        and office_row.active
    ), '[]'::jsonb)
  )
  from public.world_organizations organization_row
  where organization_row.slug = lower(btrim(p_slug))
    and organization_row.public_visibility = 'public'
$projection$;

revoke all on function public.world_organization_projection_v1(text)
  from public, anon, authenticated;
grant execute on function public.world_organization_projection_v1(text)
  to anon, authenticated, service_role;

-- First governed TG2 mutation. One current representative per member country;
-- idempotent, revision-bound and receipted through existing V3 infrastructure.
create or replace function public.world_assign_organization_representative_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_person_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_revision bigint default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $assign$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_existing public.world_organization_representations%rowtype;
  v_membership_id uuid;
  v_previous_revision bigint;
  v_representation_id uuid;
  v_revision bigint;
  v_user_id uuid;
  v_result jsonb;
begin
  if not public.world_access_allowed(
    'world.representation.manage', p_organization_id, p_country_id, null, null, null
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_organization_id is null or p_country_id is null or p_person_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  -- Official representation replacement must always use a caller-observed
  -- revision, including zero for the first assignment. No blind writes.
  if p_expected_revision is null then
    raise exception using errcode = '22023', message = 'EXPECTED_REVISION_REQUIRED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.representation.assign',
    'R2',
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'subjectType', 'world_representation'
    ),
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'personId', p_person_id,
      'expectedRevision', p_expected_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- The membership is the serializing parent for this organization/country.
  -- Lock and validate it before reading representation or revision state, so
  -- two first assignments cannot both observe an empty representative slot.
  -- Membership close/suspension commands must use this same row authority.
  select membership_row.id into v_membership_id
  from public.world_organization_memberships membership_row
  where membership_row.organization_id = p_organization_id
    and membership_row.country_id = p_country_id
    and membership_row.ended_at is null
    and membership_row.status in ('member','observer','associate')
  for update;
  if v_membership_id is null then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if not exists (
    select 1 from public.delegation_people person_row
    where person_row.id = p_person_id
  ) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  select representation_row.*
  into v_existing
  from public.world_organization_representations representation_row
  where representation_row.organization_id = p_organization_id
    and representation_row.country_id = p_country_id
    and representation_row.ends_at is null
    and representation_row.role = 'representative'
    and representation_row.voting_authority
  for update;

  -- Compare against the durable latest revision, not only the current open
  -- row: an ended representation is still a concurrent history transition.
  select coalesce(max(representation_row.revision), 0)
  into v_previous_revision
  from public.world_organization_representations representation_row
  where representation_row.organization_id = p_organization_id
    and representation_row.country_id = p_country_id;

  if v_previous_revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_existing.id is not null and v_existing.person_id = p_person_id then
    v_result := jsonb_build_object(
      'ok', true,
      'changed', false,
      'representationId', v_existing.id,
      'revision', v_existing.revision,
      'operationId', v_operation_id
    );
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', false);
  end if;

  v_revision := v_previous_revision + 1;

  if v_existing.id is not null then
    update public.world_organization_representations
    set ends_at = now()
    where id = v_existing.id;
  end if;

  select term_row.user_id
  into v_user_id
  from public.world_country_control_terms term_row
  where term_row.country_id = p_country_id
    and term_row.person_id = p_person_id
    and term_row.ended_at is null;

  insert into public.world_organization_representations(
    organization_id,
    country_id,
    person_id,
    user_id,
    role,
    voting_authority,
    starts_at,
    source,
    revision
  ) values (
    p_organization_id,
    p_country_id,
    p_person_id,
    v_user_id,
    'representative',
    true,
    now(),
    case when v_user_id is null then 'explicit_person' else 'country_controller' end,
    v_revision
  )
  returning id into v_representation_id;

  perform private.v3_emit_domain_event(
    'world.representation.changed',
    'world_representation',
    v_representation_id::text,
    v_revision,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'representationId', v_representation_id,
      'personId', p_person_id,
      'revision', v_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'representationId', v_representation_id,
    'revision', v_revision,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$assign$;

revoke all on function public.world_assign_organization_representative_v1(
  uuid,uuid,uuid,uuid,text,bigint,uuid
) from public, anon, authenticated;
grant execute on function public.world_assign_organization_representative_v1(
  uuid,uuid,uuid,uuid,text,bigint,uuid
) to authenticated, service_role;

comment on function public.world_access_allowed(text,uuid,uuid,uuid,text,uuid) is
  'Permission Engine V2 extension for organization/country/organ/object-scoped Terra Solaris authorization.';
comment on function public.world_assign_organization_representative_v1(uuid,uuid,uuid,uuid,text,bigint,uuid) is
  'TG2 canonical R2 command for current organization representation. Uses world-scoped authorization, expected revision, receipt/reconciliation and DomainEvent provenance.';

-- S13 semantic adoption contract.
do $contract$
begin
  if to_regprocedure(
       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
     ) is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-institution-access',
      1,
      'forward_fix_only',
      false,
      null,
      'Add organization-scoped authorization on top of Permission Engine V2, safe public institution projection, explicit office capability bundles, and a receipted representative-assignment command.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
