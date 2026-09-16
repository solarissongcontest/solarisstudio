begin;

-- Permission Engine v2 cutover batch 12.
--
-- Cut the two browser-facing HOD operational access RPCs over to the shared
-- Permission Engine predicate. Country ownership remains an independent access
-- path; confirmation.manage replaces legacy Organizer authority through
-- non-strict compatibility semantics before authoritative cutover.

create or replace function public.studio2_country_cockpit(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Organizer or confirmation.manage capability required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.editions e where e.id = p_edition_id) then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  with participating_countries as (
    select distinct p.country_id
    from public.participants p
    where p.edition_id = p_edition_id
      and p.country_id is not null

    union

    select distinct ce.country_id
    from public.participants p
    join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.edition_id = p_edition_id
      and p.country_id is null
      and ce.country_id is not null

    union

    select distinct e.country_id
    from public.entries e
    where e.edition_id = p_edition_id
      and e.country_id is not null
  )
  select coalesce(
    jsonb_agg(public.studio2_hod_context(p_edition_id, pc.country_id) order by c.name),
    '[]'::jsonb
  )
  into v_rows
  from participating_countries pc
  join public.countries c on c.id = pc.country_id;

  return v_rows;
end
$$;

create or replace function public.studio2_hod_editions(p_country_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_owns_country boolean := false;
  v_editions jsonb := '[]'::jsonb;
begin
  if p_country_id is null then
    raise exception 'Country id is required' using errcode = '22023';
  end if;

  v_owns_country := coalesce(public.owns_country(v_actor, p_country_id), false);

  if not v_owns_country
     and not exists (
       select 1
       from public.editions access_edition
       where public.studio2_access_allowed(
         'confirmation.manage',
         access_edition.id,
         false
       )
         and (
           exists (
             select 1
             from public.participants p
             where p.edition_id = access_edition.id
               and p.country_id = p_country_id
           )
           or exists (
             select 1
             from public.entries en
             where en.edition_id = access_edition.id
               and en.country_id = p_country_id
           )
         )
     ) then
    raise exception 'Country ownership or country-management capability required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'editionNumber', e.edition_number,
        'status', e.status
      ) order by e.edition_number desc nulls last, e.created_at desc
    ),
    '[]'::jsonb
  )
  into v_editions
  from public.editions e
  where (
      exists (
        select 1
        from public.participants p
        where p.edition_id = e.id
          and p.country_id = p_country_id
      )
      or exists (
        select 1
        from public.entries en
        where en.edition_id = e.id
          and en.country_id = p_country_id
      )
    )
    and (
      v_owns_country
      or public.studio2_access_allowed('confirmation.manage', e.id, false)
    );

  return v_editions;
end
$$;

revoke all on function public.studio2_country_cockpit(uuid) from public, anon;
grant execute on function public.studio2_country_cockpit(uuid) to authenticated, service_role;

revoke all on function public.studio2_hod_editions(uuid) from public, anon;
grant execute on function public.studio2_hod_editions(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
