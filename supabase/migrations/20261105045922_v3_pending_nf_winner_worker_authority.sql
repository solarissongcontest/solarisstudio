begin;

select public.v3_register_migration_contract(
  'v3.confirmation.pending-nf-winner-worker-authority',
  1, 'forward_fix_only', false, null,
  'Keep staged NF winner intent behind existing definer commands; reject direct API-role writes including raw service_role DML.'
);

-- SECURITY INVOKER is essential: inspect the effective SQL caller, not a
-- forgeable JWT/GUC marker. Existing definer commands run as their owner and
-- retain their authorization, exact-version review, receipts and audit checks.
create or replace function private.v3_guard_pending_nf_winner_api_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.pending_winning_entry_id is not null;
  else
    v_changed := new.pending_winning_entry_id is distinct from old.pending_winning_entry_id;
  end if;
  if v_changed and current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'Pending National Final winner intent must use canonical Confirmation commands'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_pending_nf_winner_api_write()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_pending_nf_winner_api_write on public.national_finals;
create trigger v3_guard_pending_nf_winner_api_write
before insert or update on public.national_finals
for each row execute function private.v3_guard_pending_nf_winner_api_write();

notify pgrst, 'reload schema';
commit;
