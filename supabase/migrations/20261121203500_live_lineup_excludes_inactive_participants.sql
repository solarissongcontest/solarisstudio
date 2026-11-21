begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Withdrawn/disqualified rows remain intact for audit and historical editions,
-- but do not consume a slot in live show allocation or running order.
-- Only the existing authenticated entry.edit capability can mutate these RPCs.
create or replace function public.admin_set_show_running_order(
  _show_id uuid,
  _participant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id into v_edition_id from public.shows s where s.id = _show_id;
  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  select count(*)::integer into v_expected
  from public.participants p
  where p.show_id = _show_id and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  v_supplied := coalesce(array_length(_participant_ids, 1), 0);
  select count(distinct x)::integer into v_distinct
  from unnest(coalesce(_participant_ids, '{}'::uuid[])) as x;

  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Running order must contain every active show participant exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_participant_ids, '{}'::uuid[])) as supplied(id)
    left join public.participants p on p.id = supplied.id
      and p.show_id = _show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
    where p.id is null
  ) then
    raise exception 'Running order contains an inactive participant or a participant from another show.' using errcode = '22023';
  end if;

  -- One statement keeps the existing statement-level result-sync batching.
  -- Inactive rows receive NULL, never a hidden trailing order number.
  with desired as (
    select supplied.id, supplied.ordinality::integer as position
    from unnest(coalesce(_participant_ids, '{}'::uuid[]))
      with ordinality as supplied(id, ordinality)
  )
  update public.participants p
     set running_order = (select d.position from desired d where d.id = p.id),
         updated_at = now()
   where p.show_id = _show_id
     and p.running_order is distinct from (select d.position from desired d where d.id = p.id);
end;
$function$;

create or replace function public.admin_set_show_allocations(
  _show_id uuid,
  _allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id into v_edition_id from public.shows s where s.id = _show_id;
  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Allocations must be an array.' using errcode = '22023';
  end if;

  select count(*)::integer into v_expected
  from public.participants p
  where p.show_id = _show_id and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  select count(*)::integer, count(distinct item.id)::integer into v_supplied, v_distinct
  from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text);
  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Allocation draw must contain every active show participant exactly once.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text)
    left join public.participants p on p.id = item.id
      and p.show_id = _show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
    where p.id is null or item.allocation not in ('first_half', 'second_half', 'producer_choice')
  ) then
    raise exception 'Allocation draw contains an inactive/invalid participant or allocation.' using errcode = '22023';
  end if;

  with desired as (
    select item.id, item.allocation
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text)
  )
  update public.participants p
     set running_order_allocation = (select d.allocation from desired d where d.id = p.id),
         updated_at = now()
   where p.show_id = _show_id
     and p.running_order_allocation is distinct from (select d.allocation from desired d where d.id = p.id);
end;
$function$;

revoke all on function public.admin_set_show_running_order(uuid, uuid[]) from public, anon;
revoke all on function public.admin_set_show_allocations(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_show_running_order(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_set_show_allocations(uuid, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
