begin;

select public.v3_register_migration_contract(
  'v3.edition.legacy-v2-retirement', 1, 'forward_fix_only', false, null,
  'Retire the superseded unversioned Edition lifecycle writer; preserve the receipted V3 command and existing Archive, publication and Confirmation boundaries.'
);

-- Extracted from #1851's internal-writer cutover without reviving the obsolete
-- Edition broadcast-sync trigger. S14 already owns the V3 lifecycle command.
-- Preserve the old signature/defaults so stale callers fail explicitly; neither
-- API roles nor privileged internal callers can use it as a competing writer.
create or replace function public.studio2_transition_edition_v2(
  p_edition_id uuid,
  p_to text,
  p_reason text default null,
  p_approval_request_id uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_transition_edition_v3 with reviewed version and stable operation identity'
    using errcode = '0A000';
end
$retired$;
revoke all on function public.studio2_transition_edition_v2(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;

comment on function public.studio2_transition_edition_v2(uuid,text,text,uuid) is
  'Retired fail-closed signature. Edition lifecycle changes require studio2_transition_edition_v3 CAS, receipts and event authority.';
notify pgrst, 'reload schema';
commit;
