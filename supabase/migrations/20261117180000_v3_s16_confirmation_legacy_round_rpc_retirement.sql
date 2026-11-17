begin;

-- S16 P07: remove four obsolete, service-role-executable Confirmation round
-- mutators now that the Organizer round workspace uses the reviewed R2/R3
-- preview/apply command. This migration is deliberately forward-only.
-- It removes actual SQL writer authority, not merely client-side UI access.
do $s16_p07$
declare
  v_identity text;
  v_fn oid;
  v_owner text;
  v_def text;
  v_command oid;
  v_trigger text;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'S16 P07 requires PostgreSQL 17 postgres-owned migration execution';
  end if;

  foreach v_identity in array array[
    'public.admin_confirmation_save_round(jsonb)',
    'public.admin_confirmation_delete_round(uuid)',
    'public.admin_confirmation_set_round_status(uuid,text)',
    'public.admin_confirmation_set_round_editing(uuid,boolean)'
  ] loop
    v_fn := to_regprocedure(v_identity);
    if v_fn is null then
      raise exception 'S16 P07 unknown legacy round RPC catalog: %', v_identity;
    end if;

    select pg_get_userbyid(p.proowner), pg_get_functiondef(p.oid)
      into v_owner, v_def
      from pg_proc p
      where p.oid = v_fn and p.prokind = 'f' and p.prosecdef;

    if v_owner is distinct from 'postgres'
       or v_def is null
       or position('public.submission_rounds' in v_def) = 0
       or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'S16 P07 legacy round RPC ownership/write/ACL drift: %', v_identity;
    end if;
  end loop;

  foreach v_identity in array array[
    'public.studio2_confirmation_round_change_preview(uuid,text,jsonb)',
    'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)'
  ] loop
    v_command := to_regprocedure(v_identity);
    if v_command is null then
      raise exception 'S16 P07 canonical round operation missing: %', v_identity;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_command
        and p.prosecdef
        and pg_get_userbyid(p.proowner) = 'postgres'
        and exists (
          select 1 from unnest(p.proconfig) config
          where config like 'search_path=pg_catalog,%'
        )
    ) or not has_function_privilege('authenticated', v_command, 'EXECUTE') then
      raise exception 'S16 P07 canonical round operation is not protected and reachable: %', v_identity;
    end if;
  end loop;

  foreach v_trigger in array array[
    'studio2_confirmation_round_touch_version',
    'studio2_guard_direct_confirmation_round_update',
    'studio2_guard_direct_confirmation_round_delete',
    'v3_guard_archived_edition_workflow_write'
  ] loop
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = 'public.submission_rounds'::regclass
        and t.tgname = v_trigger
        and t.tgenabled in ('O','A')
        and not t.tgisinternal
    ) then
      raise exception 'S16 P07 protected Confirmation trigger is missing/disabled: %', v_trigger;
    end if;
  end loop;
end
$s16_p07$;

-- RESTRICT guarantees that any unaccounted SQL dependency aborts the entire
-- migration. Canonical R2/R3 commands and all audit, version and Archive
-- triggers remain intact and callable.
drop function public.admin_confirmation_save_round(jsonb) restrict;
drop function public.admin_confirmation_delete_round(uuid) restrict;
drop function public.admin_confirmation_set_round_status(uuid,text) restrict;
drop function public.admin_confirmation_set_round_editing(uuid,boolean) restrict;

notify pgrst, 'reload schema';
commit;
