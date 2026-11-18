begin;

select public.v3_register_migration_contract(
  'v3.integrity.legacy-adjudication-rpc-retirement',
  1,
  'forward_fix_only',
  false,
  null,
  'Retire three obsolete adjudication compatibility entry points after canonical versioned JWT caller migration, without removing shared implementation primitives'
);

-- Exact installed catalog guard: do not accidentally remove a new overload,
-- a function owned by an API role, or an entry point with SQL dependencies.
do $guard$
declare
  v_name text;
  v_signature text;
  v_oid oid;
  v_count integer;
  v_owner text;
begin
  for v_name, v_signature in
    select * from (values
      ('admin_record_integrity_finding',
       'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)'),
      ('admin_record_integrity_sanction',
       'public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)'),
      ('admin_decide_integrity_appeal',
       'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])')
    ) as signatures(name, signature)
  loop
    v_oid := to_regprocedure(v_signature);
    select count(*), max(pg_get_userbyid(p.proowner)::text)
      into v_count, v_owner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name;
    if v_oid is null or v_count <> 1 then
      raise exception 'P04 requires precisely one effective installed signature for % (installed overloads %, expected %)',
        v_name, v_count, v_signature;
    end if;
    if v_owner in ('anon', 'authenticated', 'service_role') then
      raise exception 'Unsafe function owner % for %', v_owner, v_signature;
    end if;
    if exists (
      select 1 from pg_depend d
      where d.refclassid = 'pg_proc'::regclass
        and d.refobjid = v_oid
        and d.deptype = 'n'
    ) then
      raise exception 'SQL dependency on % blocks P04 retirement; inspect the dependent object', v_signature;
    end if;
  end loop;

  -- The original implementation primitives remain essential to canonical
  -- commands. This is a wrapper-only retirement, never an internal drop.
  if to_regprocedure('public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean)') is null
     or to_regprocedure('public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)') is null
     or to_regprocedure('public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)') is null
     or to_regprocedure('public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)') is null
     or to_regprocedure('public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)') is null then
    raise exception 'P04 missing canonical command or shared implementation prerequisite';
  end if;
end
$guard$;

drop function public.admin_record_integrity_finding(
  uuid, text, text, text, text[], boolean
) restrict;
drop function public.admin_record_integrity_sanction(
  uuid, uuid, integer, integer, text, text, text[], text[], text, boolean
) restrict;
drop function public.admin_decide_integrity_appeal(
  uuid, text, text, integer, text[], text[]
) restrict;

notify pgrst, 'reload schema';
commit;
