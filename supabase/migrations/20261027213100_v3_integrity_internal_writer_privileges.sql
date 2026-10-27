begin;

select public.v3_register_migration_contract(
  'v3.integrity.internal-writer-privileges',
  1,
  'forward_fix_only',
  false,
  null,
  'Retire direct EXECUTE authority on renamed Integrity implementation primitives while documenting narrow compatibility surfaces and sunset conditions'
);

-- ALTER FUNCTION ... RENAME preserves function ACLs. After the authority
-- cutover these implementation primitives must therefore be explicitly private
-- by privilege; otherwise the old RPC ACL would survive under a shiny new name.
revoke all on function public.public_create_anonymous_integrity_case_impl(
  text, text, text, text, text, text[], text, text
) from public, anon, authenticated, service_role;

revoke all on function public.create_protected_integrity_case_impl(
  text, text, text, text, text, text, text, text[], text
) from public, anon, authenticated, service_role;

revoke all on function public.v3_public_create_anonymous_integrity_case_impl(
  uuid, text, text, text, text, text, text, text[], text, text
) from public, anon, authenticated, service_role;

revoke all on function public.v3_create_protected_integrity_case_impl(
  uuid, text, text, text, text, text, text, text, text, text[], text
) from public, anon, authenticated, service_role;

revoke all on function public.reporter_submit_integrity_appeal_impl(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

revoke all on function public.public_submit_anonymous_integrity_appeal_impl(
  text, text, uuid, text
) from public, anon, authenticated, service_role;

comment on function public.public_create_anonymous_integrity_case_impl(
  text, text, text, text, text, text[], text, text
) is
  'Sanctioned internal Integrity implementation primitive. Not API-executable; canonical retry-safe entrypoint is v3_public_create_anonymous_integrity_case.';

comment on function public.create_protected_integrity_case_impl(
  text, text, text, text, text, text, text, text[], text
) is
  'Sanctioned internal Integrity implementation primitive. Not API-executable; canonical retry-safe entrypoint is v3_create_protected_integrity_case.';

comment on function public.reporter_submit_integrity_appeal_impl(uuid, uuid, text) is
  'Sanctioned internal Integrity implementation primitive. Not API-executable; canonical retry-safe entrypoint is v3_submit_integrity_appeal.';

comment on function public.public_submit_anonymous_integrity_appeal_impl(text, text, uuid, text) is
  'Sanctioned internal Integrity implementation primitive. Not API-executable; canonical retry-safe entrypoint is v3_public_submit_anonymous_integrity_appeal.';

-- Compatibility entrypoints remain deliberately executable only because the
-- existing participant surfaces have not all landed their stable operation-ID
-- caller cutover yet. They delegate to governed authority and cannot bypass the
-- database transition/history guards.
comment on function public.public_create_anonymous_integrity_case(
  text, text, text, text, text, text[], text, text
) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy anonymous participant intake. Reason: caller cutover may lag backend deployment. Sunset: remove after all participant report callers use v3_public_create_anonymous_integrity_case with stable operation/idempotency identity.';

comment on function public.create_protected_integrity_case(
  text, text, text, text, text, text, text, text[], text
) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy authenticated participant intake. Reason: caller cutover may lag backend deployment. Sunset: remove after all participant report callers use v3_create_protected_integrity_case with stable operation/idempotency identity.';

comment on function public.reporter_submit_integrity_appeal(uuid, uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy authenticated appeal UI. Reason: caller cutover may lag backend deployment. Sunset: remove after participant appeal callers use v3_submit_integrity_appeal with stable operation/idempotency identity.';

comment on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy anonymous recovery appeal UI. Reason: caller cutover may lag backend deployment. Sunset: remove after anonymous appeal callers use v3_public_submit_anonymous_integrity_appeal with stable operation/idempotency identity.';

notify pgrst, 'reload schema';
commit;
