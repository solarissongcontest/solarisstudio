begin;

select public.v3_register_migration_contract(
  'v3.edition.internal-writer-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Retire the superseded V2 edition lifecycle writer and harden the edition-design-to-show trigger consequence so it remains an internal non-callable writer after raw edition DML cutover.'
);

-- V3 is the only lifecycle mutation authority. Keep the old signature as a
-- fail-closed tombstone so stale callers receive an explicit migration error
-- rather than retaining a second writer over studio2_edition_runtime.
create or replace function public.studio2_transition_edition_v2(
  p_edition_id uuid,
  p_to text,
  p_reason text,
  p_approval_request_id uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_transition_edition_v3'
    using errcode = '0A000';
end
$retired$;
revoke all on function public.studio2_transition_edition_v2(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;

-- Edition visual changes intentionally project their shared design into shows.
-- This trigger consequence is not a public/show authoring API. Pin its
-- SECURITY DEFINER path and remove every API-role EXECUTE grant so the only
-- supported entry point is the edition trigger itself.
alter function public.sync_edition_design_to_shows() security definer;
alter function public.sync_edition_design_to_shows()
  set search_path = pg_catalog, public, private;
revoke all on function public.sync_edition_design_to_shows()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
