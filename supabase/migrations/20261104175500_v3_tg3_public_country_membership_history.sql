begin;

-- TG3 public country/organization relationship detail: bounded by one exact
-- public institution and country. Uses existing TG2 canonical tables only.
-- No new membership, representative, office, grant or decision authority.
--
-- This read model intentionally avoids the organization-wide
-- world_organization_projection_v1 payload when opening one country detail.
-- A caller receives no other country's representative or office records.

create or replace function public.world_public_country_membership_history_v1(
  p_slug text,
  p_country_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $history$
  select jsonb_build_object(
    'organization', jsonb_build_object(
      'id', organization_row.id,
      'slug', organization_row.slug,
      'officialName', organization_row.official_name,
      'shortName', organization_row.short_name
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership_row.id,
        'countryId', membership_row.country_id,
        'membershipType', membership_row.membership_type,
        'status', membership_row.status,
        'joinedAt', membership_row.joined_at,
        'endedAt', membership_row.ended_at
      ) order by membership_row.joined_at desc, membership_row.id)
      from public.world_organization_memberships membership_row
      where membership_row.organization_id = organization_row.id
        and membership_row.country_id = p_country_id
    ), '[]'::jsonb),
    'representatives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', representation_row.id,
        'countryId', representation_row.country_id,
        'displayName', person_row.display_name,
        'role', representation_row.role,
        'votingAuthority', representation_row.voting_authority,
        'startsAt', representation_row.starts_at,
        'endsAt', representation_row.ends_at
      ) order by representation_row.starts_at desc, representation_row.id)
      from public.world_organization_representations representation_row
      join public.delegation_people person_row
        on person_row.id = representation_row.person_id
      where representation_row.organization_id = organization_row.id
        and representation_row.country_id = p_country_id
    ), '[]'::jsonb),
    'offices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', office_row.id,
        'title', office_row.title,
        'currentTerm', jsonb_build_object(
          'representedCountryId', term_row.represented_country_id,
          'holderDisplayName', holder_row.display_name
        )
      ) order by office_row.display_priority, office_row.title)
      from public.world_organization_offices office_row
      join public.world_office_terms term_row
        on term_row.office_id = office_row.id
       and term_row.status = 'active'
       and term_row.actual_end_at is null
       and term_row.represented_country_id = p_country_id
      join public.delegation_people holder_row
        on holder_row.id = term_row.holder_person_id
      where office_row.organization_id = organization_row.id
        and office_row.active
    ), '[]'::jsonb)
  )
  from public.world_organizations organization_row
  where p_country_id is not null
    and organization_row.slug = lower(btrim(p_slug))
    and organization_row.public_visibility = 'public'
    and exists (
      select 1 from public.countries country_row
      where country_row.id = p_country_id
    )
$history$;

-- Do not expose the function by default to PUBLIC. The response intentionally
-- contains only verified public institutional details, so anonymous users may
-- read the same narrow projection as authenticated users.
revoke all on function public.world_public_country_membership_history_v1(text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_public_country_membership_history_v1(text,uuid)
  to anon, authenticated, service_role;

comment on function public.world_public_country_membership_history_v1(text,uuid) is
  'Read-only TG3 public relationship projection for one public organization and one exact country. No auth-linked IDs, proxy records, credentials, decision drafts, grants, or other-country payloads.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.public-country-membership-history',
      1,
      'forward_fix_only',
      false,
      null,
      'Add one country-scoped public TG2 read projection for institutional membership, representation and current offices without duplicating authoritative world state.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
