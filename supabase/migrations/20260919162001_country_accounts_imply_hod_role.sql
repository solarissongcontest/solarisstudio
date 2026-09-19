create or replace function private.ensure_country_account_hod_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.studio2_role_assignments (
    user_id,
    role_key,
    edition_id,
    expires_at,
    assigned_by
  )
  values (
    new.user_id,
    'hod'::text,
    null::uuid,
    null::timestamptz,
    null::uuid
  )
  on conflict on constraint studio2_role_assignments_scope_unique do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_country_account_hod_role()
from public, anon, authenticated;

drop trigger if exists ensure_country_account_hod_role on public.country_accounts;
create trigger ensure_country_account_hod_role
after insert or update of user_id
on public.country_accounts
for each row
execute function private.ensure_country_account_hod_role();

insert into public.studio2_role_assignments (
  user_id,
  role_key,
  edition_id,
  expires_at,
  assigned_by
)
select distinct
  ca.user_id,
  'hod'::text,
  null::uuid,
  null::timestamptz,
  null::uuid
from public.country_accounts ca
on conflict on constraint studio2_role_assignments_scope_unique do nothing;
