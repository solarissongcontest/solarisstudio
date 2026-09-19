create or replace function public.admin_set_show_allocations(
  _show_id uuid,
  _allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id
    into v_edition_id
  from public.shows s
  where s.id = _show_id;

  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Allocations must be an array.' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_expected
  from public.participants p
  where p.show_id = _show_id;

  select count(*)::integer, count(distinct item.id)::integer
    into v_supplied, v_distinct
  from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb))
    as item(id uuid, allocation text);

  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Allocation draw must contain every show participant exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb))
      as item(id uuid, allocation text)
    left join public.participants p
      on p.id = item.id
     and p.show_id = _show_id
    where p.id is null
       or item.allocation not in ('first_half', 'second_half', 'producer_choice')
  ) then
    raise exception 'Allocation draw contains an invalid participant or allocation.' using errcode = '22023';
  end if;

  update public.participants p
     set running_order_allocation = item.allocation,
         updated_at = now()
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb))
      as item(id uuid, allocation text)
   where p.id = item.id
     and p.show_id = _show_id;
end;
$$;

revoke all on function public.admin_set_show_allocations(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_show_allocations(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
