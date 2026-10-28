begin;

select public.v3_register_migration_contract(
  'v3.authorization.canonical-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 retires legacy permission mutation RPCs and removes raw API-role DML so the governed R3 permission command is the sole runtime authorization authority'
);

-- Permission Engine v2 is canonical authorization truth. The R3 command owns
-- runtime mutation through fresh-auth, impact preview/CAS, operation identity,
-- durable receipt and audit. A service-role key is not a second permission
-- administration API.
revoke insert, update, delete on table public.studio2_capability_grants
  from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.studio2_role_assignments
  from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.studio2_role_capabilities
  from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.studio2_permission_subject_versions
  from public, anon, authenticated, service_role;
-- studio2_permission_state_versions was removed by the S3 identity cutover;
-- studio2_permission_subject_versions above is the sole revision authority.

-- These compatibility RPCs were kept executable by service_role after the R3
-- cutover. Repository call-graph review finds no production caller; retaining
-- them would leave peer writers for the same capability/role truth.
drop function if exists public.studio2_grant_capability(uuid, text, uuid, timestamptz);
drop function if exists public.studio2_revoke_capability(uuid, text, uuid);
drop function if exists public.studio2_assign_access_role(uuid, text, uuid, timestamptz);
drop function if exists public.studio2_revoke_access_role(uuid, text, uuid);

-- The canonical wrapper remains the only API-facing mutation command. The
-- lower-level engine is callable only as its internal implementation path.
revoke all on function public.studio2_apply_permission_change(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon, authenticated, service_role;

revoke all on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to authenticated, service_role;

comment on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) is
  'Canonical S16 authorization mutation command. Owns fresh-auth/CAS/receipt policy and delegates mutation only to the non-API internal permission engine.';

notify pgrst, 'reload schema';

commit;
