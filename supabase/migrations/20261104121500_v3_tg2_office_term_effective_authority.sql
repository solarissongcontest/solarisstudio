begin;

-- TG2 effective-office authority. A scheduled future officeholder must not
-- acquire institutional powers or appear as the current officeholder solely
-- because a row was prematurely labelled active. The actual end remains the
-- canonical end; scheduled_end_at is an advisory term boundary, not revocation.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-office-effective-start',
      1, 'forward_fix_only', false, null,
      'Require canonical started_at to have arrived before office-derived authority and current-holder publication.'
    );
  end if;
end
$contract$;

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
          and term_row.actual_end_at is null
          and term_row.started_at <= now()
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
            'startedAt', term_row.started_at,
            'scheduledEndAt', term_row.scheduled_end_at,
            'actualEndAt', term_row.actual_end_at,
            'termKind', term_row.term_kind,
            'status', term_row.status,
            'revision', term_row.revision
          )
          from public.world_office_terms term_row
          join public.delegation_people holder_row
            on holder_row.id = term_row.holder_person_id
          where term_row.office_id = office_row.id
            and term_row.status = 'active'
            and term_row.actual_end_at is null
            and term_row.started_at <= now()
          limit 1
        )
      ) order by office_row.display_priority, office_row.title)
      from public.world_organization_offices office_row
      where office_row.organization_id = organization_row.id
        and office_row.active
        and (
          office_row.organ_id is null
          or exists (
            select 1
            from public.world_organization_organs visible_organ
            where visible_organ.id = office_row.organ_id
              and visible_organ.organization_id = office_row.organization_id
              and visible_organ.visibility = 'public'
          )
        )
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

notify pgrst, 'reload schema';
commit;
