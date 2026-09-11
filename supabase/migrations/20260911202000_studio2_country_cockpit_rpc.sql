begin;

create or replace function public.studio2_country_cockpit(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'confirmation.manage', p_edition_id) then
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

revoke all on function public.studio2_country_cockpit(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_country_cockpit(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
