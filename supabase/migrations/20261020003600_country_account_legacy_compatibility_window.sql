begin;

select public.v3_register_migration_contract(
  '20261020003600_country_account_legacy_compatibility_window',
  1,
  'forward_fix_only',
  false,
  null,
  'Keep the existing authenticated country-account status RPC available until the Organizer consumer migrates to the new V3 command.'
);

-- The new command authority is additive. The current Organizer route still
-- calls admin_set_country_account_status through useAdminSetCountryAccountStatus.
-- Removing execute before that consumer lands would turn an architecture fix
-- into a production regression, which would be impressively self-defeating.
grant execute on function public.admin_set_country_account_status(uuid, text, text)
  to authenticated, service_role;

comment on function public.admin_set_country_account_status(uuid, text, text) is
  'Legacy authenticated compatibility path. Remove authenticated execute only after the Organizer country-account consumer is cut over to studio2_apply_country_account_access.';

commit;
