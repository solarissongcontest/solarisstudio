-- Apply parent TG13 + this migration to a DISPOSABLE local Supabase first.
-- Read-only catalog assertions, always rollback. No production parameters.
begin;
do $assert$
declare
  v_is_rls boolean;
  v_signature text :=
    'public.world_prepare_ethics_findings_v1(uuid,text,text,text,text,bigint,uuid,text,uuid)';
begin
  if to_regclass('public.world_ethics_findings') is null
    or to_regclass('public.world_ethics_cases') is null then
    raise exception 'TG13_ETHICS_FINDINGS_TABLE_MISSING';
  end if;

  select c.relrowsecurity into v_is_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='world_ethics_findings';
  if v_is_rls is distinct from true then
    raise exception 'TG13_ETHICS_FINDINGS_RLS_NOT_ENABLED';
  end if;
  if has_table_privilege('anon','public.world_ethics_findings','SELECT')
    or has_table_privilege('anon','public.world_ethics_findings','INSERT')
    or has_table_privilege('authenticated','public.world_ethics_findings','INSERT')
    or has_table_privilege('authenticated','public.world_ethics_findings','UPDATE')
    or has_table_privilege('authenticated','public.world_ethics_findings','DELETE')
    or has_table_privilege('service_role','public.world_ethics_findings','INSERT')
    or has_table_privilege('service_role','public.world_ethics_findings','UPDATE')
    or has_table_privilege('service_role','public.world_ethics_findings','DELETE') then
    raise exception 'TG13_ETHICS_FINDINGS_RAW_DML_OR_ANON_READ';
  end if;

  if to_regprocedure(v_signature) is null
    or to_regprocedure('public.world_ethics_can_prepare_findings_v1(uuid)') is null then
    raise exception 'TG13_ETHICS_FINDINGS_COMMAND_MISSING';
  end if;
  if has_function_privilege('anon',v_signature,'EXECUTE')
    or has_function_privilege('anon',
      'public.world_ethics_can_prepare_findings_v1(uuid)','EXECUTE') then
    raise exception 'TG13_ETHICS_ANONYMOUS_COMMAND';
  end if;
  if not has_function_privilege('authenticated',v_signature,'EXECUTE')
    or not has_table_privilege('authenticated','public.world_ethics_findings','SELECT') then
    raise exception 'TG13_ETHICS_AUTHENTICATED_CONTRACT_MISSING';
  end if;

  -- Verify only the governed definer command can write official findings.
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='world_prepare_ethics_findings_v1'
      and p.prosecdef
  ) then
    raise exception 'TG13_ETHICS_UNGOVERNED_COMMAND';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='world_ethics_findings'
      and t.tgname='world_ethics_findings_no_rewrite'
      and not t.tgisinternal and t.tgenabled<>'D'
  ) then
    raise exception 'TG13_ETHICS_IMMUTABLE_TRIGGER_MISSING';
  end if;
end $assert$;
rollback;
