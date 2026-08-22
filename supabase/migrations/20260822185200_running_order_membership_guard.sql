-- Keep show running orders usable when entries are added or removed after the
-- running-order stage has already started. The admin UI used to insert new
-- participants with running_order = null, which made custom countries appear
-- to be in the show but not properly join the numbered order.

create or replace function public.append_running_order_for_new_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage text;
  v_next integer;
begin
  if new.show_id is null or new.running_order is not null then
    return new;
  end if;

  select s.lineup_stage::text
    into v_stage
  from public.shows s
  where s.id = new.show_id;

  if v_stage = 'running_order' then
    select coalesce(max(p.running_order), 0) + 1
      into v_next
    from public.participants p
    where p.show_id = new.show_id;

    new.running_order := v_next;
  end if;

  return new;
end;
$$;

drop trigger if exists participants_append_running_order on public.participants;
create trigger participants_append_running_order
before insert on public.participants
for each row
execute function public.append_running_order_for_new_participant();

create or replace function public.compact_running_order_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage text;
begin
  if old.show_id is null then
    return old;
  end if;

  select s.lineup_stage::text
    into v_stage
  from public.shows s
  where s.id = old.show_id;

  if v_stage = 'running_order' then
    with ordered as (
      select
        p.id,
        row_number() over (
          order by p.running_order nulls last, p.updated_at, p.id
        )::integer as new_order
      from public.participants p
      where p.show_id = old.show_id
    )
    update public.participants p
       set running_order = ordered.new_order,
           updated_at = now()
      from ordered
     where p.id = ordered.id
       and p.running_order is distinct from ordered.new_order;
  end if;

  return old;
end;
$$;

drop trigger if exists participants_compact_running_order_after_delete on public.participants;
create trigger participants_compact_running_order_after_delete
after delete on public.participants
for each row
execute function public.compact_running_order_after_delete();

-- Atomic reorder primitive for the admin frontend. It validates that every
-- participant in the show is supplied exactly once, then writes a clean 1..N
-- order in one database call. This avoids duplicate positions from two
-- independent row updates racing each other.
create or replace function public.admin_set_show_running_order(
  _show_id uuid,
  _participant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
  v_id uuid;
  v_position integer := 0;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer'::public.app_role) then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_expected
  from public.participants p
  where p.show_id = _show_id;

  v_supplied := coalesce(array_length(_participant_ids, 1), 0);
  select count(distinct x)::integer
    into v_distinct
  from unnest(coalesce(_participant_ids, '{}'::uuid[])) as x;

  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Running order must contain every show participant exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_participant_ids, '{}'::uuid[])) as supplied(id)
    left join public.participants p
      on p.id = supplied.id
     and p.show_id = _show_id
    where p.id is null
  ) then
    raise exception 'Running order contains a participant from another show.' using errcode = '22023';
  end if;

  update public.participants
     set running_order = null
   where show_id = _show_id;

  foreach v_id in array coalesce(_participant_ids, '{}'::uuid[]) loop
    v_position := v_position + 1;
    update public.participants
       set running_order = v_position,
           updated_at = now()
     where id = v_id
       and show_id = _show_id;
  end loop;
end;
$$;

grant execute on function public.admin_set_show_running_order(uuid, uuid[]) to authenticated;
