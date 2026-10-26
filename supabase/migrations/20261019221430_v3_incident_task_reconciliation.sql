begin;

select public.v3_register_migration_contract(
  'v3.s7.incident-task-reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'Refresh edition-scoped Organizer incident-response tasks transactionally after canonical Incident writes, including compatibility writers during V3 cutover.'
);

create or replace function private.v3_reconcile_incident_tasks_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
begin
  if new.edition_id is not null then
    perform private.studio2_reconcile_all_organizer_tasks(new.edition_id);
  end if;
  return new;
end
$reconcile$;

revoke all on function private.v3_reconcile_incident_tasks_after_write()
  from public, anon, authenticated;

drop trigger if exists v3_reconcile_incident_tasks_after_write
  on public.studio2_incidents;
create trigger v3_reconcile_incident_tasks_after_write
after insert or update on public.studio2_incidents
for each row execute function private.v3_reconcile_incident_tasks_after_write();

commit;
