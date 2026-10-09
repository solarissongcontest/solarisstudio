begin;

-- Canonical Confirmations grant hardening ------------------------------------
--
-- The migrated database retained historical explicit grants to anon. Revoking
-- EXECUTE from the pseudo-role PUBLIC does not remove those role-specific
-- grants. Country-account inspection and edit-token creation are authenticated
-- operations, so remove anon explicitly.

revoke execute on function public.public_country_account_confirmation_access() from anon;
revoke execute on function public.public_create_country_account_edit_token(uuid) from anon;

revoke all on function public.public_country_account_confirmation_access() from public;
revoke all on function public.public_create_country_account_edit_token(uuid) from public;

grant execute on function public.public_country_account_confirmation_access() to authenticated;
grant execute on function public.public_create_country_account_edit_token(uuid) to authenticated;

commit;
