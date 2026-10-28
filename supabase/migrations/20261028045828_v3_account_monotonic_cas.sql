begin;
select public.v3_register_migration_contract(
  'v3.account.monotonic-cas', 1, 'forward_fix_only', false, null,
  'Make the canonical account optimistic-concurrency token strictly advance even for multiple governed mutations in one transaction or a backwards wall clock. Existing stale-CAS SQL authority regression must reject a second operation with the old token.'
);
create or replace function private.v3_touch_country_account_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $touch$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end
$touch$;
revoke all on function private.v3_touch_country_account_updated_at()
  from public, anon, authenticated, service_role;
drop trigger if exists touch_country_accounts_updated_at on public.country_accounts;
create trigger touch_country_accounts_updated_at
before update on public.country_accounts
for each row execute function private.v3_touch_country_account_updated_at();
commit;
