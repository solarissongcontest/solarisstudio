begin;

-- A show running-order reorder is one logical mutation, but the legacy
-- participants_sync_results trigger treated every changed participant row as a
-- separate result-sync request. admin_set_show_running_order also cleared all
-- positions before writing them back one row at a time, so a 33-entry reorder
-- could rebuild the same show results 66 times inside one RPC.
--
-- Keep row-level result sync for participant identity/membership changes, but
-- route running-order-only UPDATE statements through one statement-level
-- transition-table trigger. This preserves result correctness while bounding a
-- bulk reorder to one result rebuild per affected show.

-- S13 adoption contract. This migration changes trigger/RPC implementation and
-- contains operational UPDATE SQL inside admin_set_show_running_order, but it
-- does not move existing rows during migration execution and therefore has no
-- backfill job. Once deployed, repair this behavior forward rather than trying
-- to roll trigger/function definitions backward independently of later schema.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.results.batch-running-order-result-sync',
  1,
  'forward_fix_only',
  false,
  null,
  'Forward-only running-order trigger/RPC rewrite that bounds result rebuilds; migration execution performs no data backfill.'
);
select set_config('request.jwt.claim.role', '', true);

drop trigger if exists participants_sync_results on public.participants;
create trigger participants_sync_results
after insert or delete or update of show_id, country_id, contest_entity_id, participation_status
on public.participants
for each row execute function public.sync_results_after_participant_change();

create or replace function public.sync_results_after_participant_running_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_show record;
begin
  for row_show in
    select distinct changed.show_id
    from (
      select new_rows.show_id
      from new_participants as new_rows
      join old_participants as old_rows on old_rows.id = new_rows.id
      where new_rows.running_order is distinct from old_rows.running_order
        -- If another participant field covered by the row trigger changes in
        -- the same statement, that row-level path already synchronizes both
        -- relevant shows. Avoid a duplicate rebuild here.
        and new_rows.show_id is not distinct from old_rows.show_id
        and new_rows.country_id is not distinct from old_rows.country_id
        and new_rows.contest_entity_id is not distinct from old_rows.contest_entity_id
        and new_rows.participation_status is not distinct from old_rows.participation_status
    ) as changed
    where changed.show_id is not null
  loop
    perform public.sync_show_results_from_votes(row_show.show_id);
  end loop;

  return null;
end;
$$;

drop trigger if exists participants_sync_running_order_results on public.participants;
create trigger participants_sync_running_order_results
after update on public.participants
referencing old table as old_participants new table as new_participants
for each statement
execute function public.sync_results_after_participant_running_order_change();

-- Preserve the existing Permission Engine authorization and membership guards,
-- but persist the validated order with one set-based UPDATE. The statement
-- trigger above therefore performs one result sync for the show rather than a
-- full rebuild for every participant row.
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
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id into v_edition_id
  from public.shows s
  where s.id = _show_id;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
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

  with desired as (
    select supplied.id, supplied.ordinality::integer as running_order
    from unnest(coalesce(_participant_ids, '{}'::uuid[]))
      with ordinality as supplied(id, ordinality)
  )
  update public.participants p
     set running_order = desired.running_order,
         updated_at = now()
    from desired
   where p.id = desired.id
     and p.show_id = _show_id
     and p.running_order is distinct from desired.running_order;
end;
$$;

grant execute on function public.admin_set_show_running_order(uuid, uuid[]) to authenticated;

commit;
