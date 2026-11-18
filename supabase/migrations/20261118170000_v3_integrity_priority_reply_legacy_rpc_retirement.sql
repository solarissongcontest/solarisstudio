begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.priority-reply-legacy-rpc-retirement',
  1,
  'forward_fix_only',
  false,
  null,
  'Remove two obsolete Organizer compatibility mutation entrypoints that synthesize operation identities and read the current case version instead of enforcing caller-reviewed CAS'
);

-- These legacy Organizer API wrappers were replaced by caller-owned,
-- receipt-backed studio2_integrity_* commands. Retain their mature validated
-- _impl functions, canonical commands, revision/event triggers and histories.
-- Fail closed on an unexpected overload, owner or SQL dependency.
do $preflight$
declare
  v_name text;
  v_signature text;
  v_oid oid;
  v_owner text;
  v_count integer;
begin
  for v_name, v_signature in
    select * from (values
      ('admin_set_integrity_priority',
       'public.admin_set_integrity_priority(uuid,text)'),
      ('admin_reply_integrity_case',
       'public.admin_reply_integrity_case(uuid,text,boolean)')
    ) expected(name, signature)
  loop
    v_oid := to_regprocedure(v_signature);
    select count(*), max(pg_get_userbyid(p.proowner)::text)
      into v_count, v_owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_oid is null or v_count <> 1 or v_owner <> 'postgres' then
      raise exception 'P04 legacy wrapper not uniquely owned or present: %, count %, owner %',
        v_signature, v_count, v_owner using errcode='55000';
    end if;
    if exists (
      select 1 from pg_depend d
      where d.refclassid = 'pg_proc'::regclass
        and d.refobjid = v_oid and d.deptype = 'n'
    ) then
      raise exception 'P04 legacy wrapper has a dependent SQL object: %', v_signature
        using errcode='55000';
    end if;
  end loop;

  if to_regprocedure('public.studio2_integrity_set_case_priority(uuid,text,uuid,text,bigint)') is null
     or to_regprocedure('public.studio2_integrity_reply_case(uuid,text,boolean,uuid,text,bigint)') is null
     or to_regprocedure('public.admin_set_integrity_priority_impl(uuid,text)') is null
     or to_regprocedure('public.admin_reply_integrity_case_impl(uuid,text,boolean)') is null then
    raise exception 'P04 canonical priority/reply authority or validated primitive missing'
      using errcode='55000';
  end if;
end $preflight$;

drop function public.admin_set_integrity_priority(uuid, text) restrict;
drop function public.admin_reply_integrity_case(uuid, text, boolean) restrict;

notify pgrst, 'reload schema';
commit;
