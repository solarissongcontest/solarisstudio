begin;

-- TG3 public representative roster, additive to the canonical TG2 organization
-- and delegation_people identities in PR #1888.
-- This is a read projection. It does not create a second representative store.
do $preflight$
begin
  if to_regclass('public.world_organizations') is null
     or to_regclass('public.world_organization_representations') is null
     or to_regclass('public.delegation_people') is null
     or to_regclass('public.countries') is null then
    raise exception 'TG3 representative projection requires the canonical TG2 foundation';
  end if;
end
$preflight$;

create or replace function public.world_public_representative_roster_v1(
  p_slug text,
  p_status text default 'current',
  p_search text default '',
  p_offset integer default 0,
  p_limit integer default 16
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $roster$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_organization_id uuid;
  v_organization_short_name text;
  v_total bigint;
  v_rows jsonb;
begin
  if char_length(v_slug) > 120
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*     or p_status is null
     or p_status not in ('current', 'past', 'all')
     or char_length(v_search) > 64
     or p_offset is null or p_offset < 0 or p_offset > 1600
     or p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023', message = 'INVALID_PUBLIC_REPRESENTATIVE_QUERY';
  end if;

  -- Fail closed: unknown and nonpublic institutions are indistinguishable.
  -- Never grant access based on membership, viewer role, or query parameters.
  select organization_row.id, organization_row.short_name
  into v_organization_id, v_organization_short_name
  from public.world_organizations organization_row
  where organization_row.slug = v_slug
    and organization_row.public_visibility = 'public';

  if v_organization_id is null then
    return null;
  end if;

  -- The upstream TG2 public organization projection explicitly exposes
  -- representatives' display names, country identity, role, voting authority
  -- and tenure. Exclude person_id/user_id and all proxy/capability data here.
  -- Resolve names only from durable delegation_people, never auth.users.
  with scoped as materialized (
    select
      representation_row.id,
      representation_row.country_id,
      representation_row.role,
      representation_row.voting_authority,
      representation_row.starts_at,
      representation_row.ends_at,
      representation_row.revision,
      person_row.display_name,
      country_row.name as country_name,
      country_row.short_code as country_code,
      country_row.flag_image as country_flag_url
    from public.world_organization_representations representation_row
    join public.delegation_people person_row
      on person_row.id = representation_row.person_id
    join public.countries country_row
      on country_row.id = representation_row.country_id
    where representation_row.organization_id = v_organization_id
      and (
        p_status = 'all'
        or (p_status = 'current' and representation_row.ends_at is null)
        or (p_status = 'past' and representation_row.ends_at is not null)
      )
      and (
        v_search = ''
        or position(v_search in lower(person_row.display_name)) > 0
        or position(v_search in lower(country_row.name)) > 0
        or position(v_search in lower(country_row.short_code)) > 0
      )
  ),
  ordered as (
    select
      scoped.*,
      row_number() over (
        order by (scoped.ends_at is null) desc,
                 scoped.starts_at desc,
                 scoped.id
      ) as row_ordinal
    from scoped
  ),
  page as (
    select
      jsonb_build_object(
        'id', row_item.id,
        'countryId', row_item.country_id,
        'countryName', row_item.country_name,
        'countryCode', row_item.country_code,
        'countryFlagUrl', row_item.country_flag_url,
        'displayName', row_item.display_name,
        'role', row_item.role,
        'votingAuthority', row_item.voting_authority,
        'startsAt', row_item.starts_at,
        'endsAt', row_item.ends_at,
        'revision', row_item.revision
      ) as item,
      row_item.row_ordinal
    from ordered row_item
    where row_item.row_ordinal > p_offset
      and row_item.row_ordinal <= p_offset + p_limit
  )
  select
    (select count(*) from scoped),
    (select coalesce(jsonb_agg(page.item order by page.row_ordinal), '[]'::jsonb)
     from page)
  into v_total, v_rows;

  return jsonb_build_object(
    'schemaVersion', 1,
    'organizationId', v_organization_id,
    'organizationSlug', v_slug,
    'organizationName', v_organization_short_name,
    'filter', p_status,
    'search', v_search,
    'offset', p_offset,
    'limit', p_limit,
    'total', v_total,
    'hasMore', v_total > p_offset + p_limit,
    'rows', v_rows
  );
end
$roster$;

revoke all on function public.world_public_representative_roster_v1(text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.world_public_representative_roster_v1(text,text,text,integer,integer)
  to anon, authenticated, service_role;

comment on function public.world_public_representative_roster_v1(text,text,text,integer,integer) is
  'TG3 public-only country representative roster and concluded appointment history. Uses canonical TG2 representation terms, durable display identities, exact bounded paging, no user/person IDs or proxy details.';

do $contract$
begin
  if to_regprocedure(
    'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
  ) is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.world-public-representative-roster',
      1,
      'forward_fix_only',
      false,
      null,
      'Add a publication-scoped, bounded public representative and former-representative read projection without duplicating TG2 office or membership authority.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;

     or p_status is null
     or p_status not in ('current', 'past', 'all')
     or char_length(v_search) > 64
     or p_offset is null or p_offset < 0 or p_offset > 1600
     or p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023', message = 'INVALID_PUBLIC_REPRESENTATIVE_QUERY';
  end if;

  -- Fail closed: unknown and nonpublic institutions are indistinguishable.
  -- Never grant access based on membership, viewer role, or query parameters.
  select organization_row.id, organization_row.short_name
  into v_organization_id, v_organization_short_name
  from public.world_organizations organization_row
  where organization_row.slug = v_slug
    and organization_row.public_visibility = 'public';

  if v_organization_id is null then
    return null;
  end if;

  -- The upstream TG2 public organization projection explicitly exposes
  -- representatives' display names, country identity, role, voting authority
  -- and tenure. Exclude person_id/user_id and all proxy/capability data here.
  -- Resolve names only from durable delegation_people, never auth.users.
  with scoped as materialized (
    select
      representation_row.id,
      representation_row.country_id,
      representation_row.role,
      representation_row.voting_authority,
      representation_row.starts_at,
      representation_row.ends_at,
      representation_row.revision,
      person_row.display_name,
      country_row.name as country_name,
      country_row.short_code as country_code,
      country_row.flag_image as country_flag_url
    from public.world_organization_representations representation_row
    join public.delegation_people person_row
      on person_row.id = representation_row.person_id
    join public.countries country_row
      on country_row.id = representation_row.country_id
    where representation_row.organization_id = v_organization_id
      and (
        p_status = 'all'
        or (p_status = 'current' and representation_row.ends_at is null)
        or (p_status = 'past' and representation_row.ends_at is not null)
      )
      and (
        v_search = ''
        or position(v_search in lower(person_row.display_name)) > 0
        or position(v_search in lower(country_row.name)) > 0
        or position(v_search in lower(country_row.short_code)) > 0
      )
  ),
  ordered as (
    select
      scoped.*,
      row_number() over (
        order by (scoped.ends_at is null) desc,
                 scoped.starts_at desc,
                 scoped.id
      ) as row_ordinal
    from scoped
  ),
  page as (
    select
      jsonb_build_object(
        'id', row_item.id,
        'countryId', row_item.country_id,
        'countryName', row_item.country_name,
        'countryCode', row_item.country_code,
        'countryFlagUrl', row_item.country_flag_url,
        'displayName', row_item.display_name,
        'role', row_item.role,
        'votingAuthority', row_item.voting_authority,
        'startsAt', row_item.starts_at,
        'endsAt', row_item.ends_at,
        'revision', row_item.revision
      ) as item,
      row_item.row_ordinal
    from ordered row_item
    where row_item.row_ordinal > p_offset
      and row_item.row_ordinal <= p_offset + p_limit
  )
  select
    (select count(*) from scoped),
    (select coalesce(jsonb_agg(page.item order by page.row_ordinal), '[]'::jsonb)
     from page)
  into v_total, v_rows;

  return jsonb_build_object(
    'schemaVersion', 1,
    'organizationId', v_organization_id,
    'organizationSlug', v_slug,
    'organizationName', v_organization_short_name,
    'filter', p_status,
    'search', v_search,
    'offset', p_offset,
    'limit', p_limit,
    'total', v_total,
    'hasMore', v_total > p_offset + p_limit,
    'rows', v_rows
  );
end
$roster$;

revoke all on function public.world_public_representative_roster_v1(text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.world_public_representative_roster_v1(text,text,text,integer,integer)
  to anon, authenticated, service_role;

comment on function public.world_public_representative_roster_v1(text,text,text,integer,integer) is
  'TG3 public-only country representative roster and concluded appointment history. Uses canonical TG2 representation terms, durable display identities, exact bounded paging, no user/person IDs or proxy details.';

do $contract$
begin
  if to_regprocedure(
    'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
  ) is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.world-public-representative-roster',
      1,
      'forward_fix_only',
      false,
      null,
      'Add a publication-scoped, bounded public representative and former-representative read projection without duplicating TG2 office or membership authority.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
