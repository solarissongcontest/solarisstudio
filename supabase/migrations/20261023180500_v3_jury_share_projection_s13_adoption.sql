begin;

-- System V3 / Jury Share Cards: S13 migration-contract adoption.
--
-- The original JSC-1/JSC-2 projection migration was authored before the S13
-- migration-contract framework existed. This forward-only adoption records the
-- production contract explicitly now that the slice is being reconciled onto
-- the post-S13 mainline. It performs no schema or data mutation itself.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.jury-share.projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive Jury Share read projection, immutable Result-Version Jury-input evidence, and server-side publication/authorization boundary. Repair forward if the contract evolves.'
);
select set_config('request.jwt.claim.role', '', true);

commit;
