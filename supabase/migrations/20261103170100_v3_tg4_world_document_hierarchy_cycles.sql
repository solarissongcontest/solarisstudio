begin;

-- TG4: semantic provision hierarchy is a forest within each legal Version.
-- Earlier parent-presence guards prohibit dangling parents, but they do not
-- reject A -> B -> C -> A. A legal document TOC must be finite and acyclic.
-- Deferral allows the canonical draft-replacement command to rebuild an
-- entire provision tree inside one transaction before it is checked.

create or replace function private.world_document_version_provision_cycle_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_cycle boolean;
begin
  -- A deferred event can refer to a row deleted later in the same transaction.
  -- Validate the final aggregate state rather than an intermediate draft tree.
  with recursive ancestors as (
    select
      seed_row.provision_id,
      seed_row.parent_provision_id,
      array[seed_row.provision_id]::uuid[] as visited,
      false as is_cycle
    from public.world_document_version_provisions seed_row
    where seed_row.id = new.id

    union all

    select
      parent.provision_id,
      parent.parent_provision_id,
      ancestor.visited || parent.provision_id,
      parent.provision_id = any(ancestor.visited) as is_cycle
    from ancestors ancestor
    join public.world_document_version_provisions parent
      on parent.document_version_id = new.document_version_id
     and parent.provision_id = ancestor.parent_provision_id
    where not ancestor.is_cycle
  )
  select coalesce(bool_or(is_cycle), false)
  into v_cycle
  from ancestors;

  if v_cycle then
    raise exception using errcode = '23514', message = 'PROVISION_HIERARCHY_CYCLE';
  end if;

  return new;
end
$guard$;

revoke all on function private.world_document_version_provision_cycle_guard()
  from public, anon, authenticated;

drop trigger if exists world_document_version_provisions_cycle_guard
  on public.world_document_version_provisions;

create constraint trigger world_document_version_provisions_cycle_guard
after insert or update of document_version_id, provision_id, parent_provision_id
on public.world_document_version_provisions
deferrable initially deferred
for each row execute function private.world_document_version_provision_cycle_guard();

-- Keep migration inventory and S13 semantic adoption in lockstep.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-hierarchy-cycles',
      1,
      'forward_fix_only',
      false,
      null,
      'Reject cycles in version-specific legal provision hierarchies with a deferred final-state check; preserve draft replacement and immutable published history.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
