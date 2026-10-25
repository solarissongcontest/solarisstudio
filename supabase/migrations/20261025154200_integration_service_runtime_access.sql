begin;

-- These shared integration tables were created with authenticated grants only.
-- The server's service-role client also resolves/freezes round bindings and
-- upserts integration delivery evidence. BYPASSRLS does not supply table ACLs.
-- Preserve all user policies; do not grant anonymous or new authenticated access.
grant select, update on table public.televoting_round_bindings to service_role;
grant select, insert, update on table public.integration_events to service_role;

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.integration.service-runtime-access', 1, 'forward_fix_only', false, null,
  'Restore explicit service runtime access for shared binding resolution/freeze and integration event read/upsert without changing user RLS policies.'
);
select set_config('request.jwt.claim.role', '', true);

commit;
