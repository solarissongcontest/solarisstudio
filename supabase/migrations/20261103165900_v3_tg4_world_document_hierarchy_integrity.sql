begin;

-- TG4 provision hierarchy integrity. The forward parent-presence guard verifies
-- every child row on insert/update; this reverse guard prevents a later parent
-- delete/retarget from orphaning a surviving child in the same draft Version.

create or replace function private.world_document_version_parent_reverse_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_old_version_id uuid := old.document_version_id;
  v_old_provision_id uuid := old.provision_id;
begin
  if exists (
    select 1
    from public.world_document_version_provisions child_row
    where child_row.document_version_id = v_old_version_id
      and child_row.parent_provision_id = v_old_provision_id
  )
  and not exists (
    select 1
    from public.world_document_version_provisions parent_row
    where parent_row.document_version_id = v_old_version_id
      and parent_row.provision_id = v_old_provision_id
  ) then
    raise exception using errcode = '23514', message = 'PROVISION_PARENT_NOT_IN_VERSION';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_version_parent_reverse_guard() from public, anon, authenticated;

drop trigger if exists world_document_version_provisions_parent_reverse_guard
  on public.world_document_version_provisions;
create constraint trigger world_document_version_provisions_parent_reverse_guard
after delete or update of document_version_id, provision_id
on public.world_document_version_provisions
deferrable initially deferred
for each row execute function private.world_document_version_parent_reverse_guard();

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-hierarchy-integrity',
      1,
      'forward_fix_only',
      false,
      null,
      'Close TG4 draft hierarchy orphaning by enforcing reverse parent presence after parent deletion or retargeting, deferrable across atomic draft replacement.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
