begin;

-- Published results are the terminal lifecycle state. The operation RPC already
-- blocks recalculation, unlock and reveal-clear while public; this trigger makes
-- the invariant universal for review/lock/reveal mutations too, including any
-- future privileged write path that might bypass the current RPC branching.
create or replace function private.studio2_guard_published_result_operation_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_published boolean := false;
begin
  select coalesce(s.published, false)
      and coalesce((s.publication_config ->> 'results')::boolean, false)
    into v_published
  from public.shows s
  where s.id = new.show_id;

  if v_published and new is distinct from old then
    raise exception 'Make the published result layer private before changing result operations.' using errcode = '55000';
  end if;

  return new;
end
$$;

revoke all on function private.studio2_guard_published_result_operation_update() from public, anon, authenticated;
grant execute on function private.studio2_guard_published_result_operation_update() to service_role;

drop trigger if exists trg_studio2_guard_published_result_operation_update
  on public.studio2_result_operations;
create trigger trg_studio2_guard_published_result_operation_update
before update on public.studio2_result_operations
for each row execute function private.studio2_guard_published_result_operation_update();

commit;
