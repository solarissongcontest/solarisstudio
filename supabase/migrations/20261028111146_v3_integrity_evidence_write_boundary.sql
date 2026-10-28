begin;
select public.v3_register_migration_contract(
  'v3.integrity.evidence-write-boundary',1,'forward_fix_only',false,null,
  'Retire raw API/service-role evidence mutation. Repository callers use reporter/anonymous/Organizer semantic RPCs. Keep token finalization as an owner-only primitive reached solely through credential-checking wrappers, and pin trigger-only retention and case-lineage invariants.'
);
revoke insert, update, delete, truncate on public.integrity_case_evidence
  from public, anon, authenticated, service_role;
alter function public.integrity_finalize_evidence_token(uuid,uuid,uuid)
  set search_path = pg_catalog, public, storage, pg_temp;
revoke all on function public.integrity_finalize_evidence_token(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
alter function public.integrity_apply_case_retention_to_evidence()
  set search_path = pg_catalog, public, pg_temp;
revoke all on function public.integrity_apply_case_retention_to_evidence()
  from public, anon, authenticated, service_role;
alter function public.integrity_validate_evidence_lineage()
  set search_path = pg_catalog, public, pg_temp;
revoke all on function public.integrity_validate_evidence_lineage()
  from public, anon, authenticated, service_role;
notify pgrst,'reload schema';
commit;
