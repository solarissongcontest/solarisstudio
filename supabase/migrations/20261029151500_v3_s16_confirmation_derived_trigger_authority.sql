begin;

-- S16 Confirmation authority hardening.
--
-- Recovery-code assignment and browser-session registration are derived
-- housekeeping, not independent Confirmation state transitions. The historical
-- trigger helpers were restored for clean-replay parity in 20261015183200, but
-- leaving them attached makes them independent runtime write mechanisms even
-- though the canonical submit command already owns the submission transaction.
--
-- Recovery codes now use a private-by-privilege column default. The canonical
-- submit implementation omits recovery_code when inserting a submission, so it
-- receives the same generated value without a write trigger. Browser-session
-- registration is already performed explicitly inside submit_confirmation after
-- the canonical submission write, so the duplicate AFTER INSERT trigger is
-- unnecessary.

alter function public.generate_recovery_code() owner to postgres;
alter function public.generate_recovery_code()
  set search_path = pg_catalog, public, extensions, pg_temp;

revoke all on function public.generate_recovery_code()
  from public, anon, authenticated, service_role;

alter table public.submissions
  alter column recovery_code set default public.generate_recovery_code();

drop trigger if exists ensure_submission_recovery_code_trg
  on public.submissions;
drop function if exists public.ensure_submission_recovery_code();

drop trigger if exists register_submission_browser_trg
  on public.submissions;
drop function if exists public.register_submission_browser();

-- Executable structural proof. Fail migration replay instead of silently
-- restoring a callable/attached housekeeping authority later.
do $proof$
declare
  v_default text;
begin
  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.submissions'::regclass
      and trigger_row.tgname in (
        'ensure_submission_recovery_code_trg',
        'register_submission_browser_trg'
      )
      and not trigger_row.tgisinternal
  ) then
    raise exception 'S16: obsolete Confirmation housekeeping trigger remains attached';
  end if;

  if to_regprocedure('public.ensure_submission_recovery_code()') is not null then
    raise exception 'S16: obsolete ensure_submission_recovery_code() remains callable';
  end if;

  if to_regprocedure('public.register_submission_browser()') is not null then
    raise exception 'S16: obsolete register_submission_browser() remains callable';
  end if;

  select pg_get_expr(default_row.adbin, default_row.adrelid)
  into v_default
  from pg_attrdef default_row
  join pg_attribute attribute_row
    on attribute_row.attrelid = default_row.adrelid
   and attribute_row.attnum = default_row.adnum
  where default_row.adrelid = 'public.submissions'::regclass
    and attribute_row.attname = 'recovery_code';

  if v_default is null
     or position('generate_recovery_code' in lower(v_default)) = 0 then
    raise exception 'S16: public.submissions.recovery_code default is not governed by generate_recovery_code()';
  end if;

  if has_function_privilege('anon', 'public.generate_recovery_code()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.generate_recovery_code()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.generate_recovery_code()', 'EXECUTE') then
    raise exception 'S16: recovery-code generator is executable by an API/transport role';
  end if;

  if not has_function_privilege('postgres', 'public.generate_recovery_code()', 'EXECUTE') then
    raise exception 'S16: recovery-code generator is not executable by its owner';
  end if;
end;
$proof$;

commit;
