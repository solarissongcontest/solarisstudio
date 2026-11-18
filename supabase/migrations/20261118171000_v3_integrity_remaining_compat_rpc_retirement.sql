begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.remaining-compat-rpc-retirement',
  1,
  'forward_fix_only',
  false,
  null,
  'Retire obsolete Organizer case/retention mutation shims with synthesized operation IDs and unchecked live-revision lookup; preserve all reviewed canonical commands and implementation primitives'
);

-- Five proven retired Organizer call paths no longer require compatibility
-- shims. They generate a fresh operation identity and silently read today's
-- case revision, which subverts the caller's R2/R3 CAS review contract.
-- Preserve canonical commands and mature _impl business validation. Do not
-- alter any participant/anonymous ingress or Integrity event/revision trigger.
do $preflight$
declare v_name text; v_signature text; v_canonical text; v_impl text;
        v_oid oid; v_count integer; v_owner text;
begin
  for v_name, v_signature, v_canonical, v_impl in
    select * from (values
    ('admin_recuse_from_integrity_case', 'public.admin_recuse_from_integrity_case(uuid,text)', 'public.studio2_integrity_recuse_case_reviewer(uuid,text,uuid,text,bigint)', 'public.admin_recuse_from_integrity_case_impl(uuid,text)'),
    ('admin_add_integrity_case_note', 'public.admin_add_integrity_case_note(uuid,text)', 'public.studio2_integrity_add_case_note(uuid,text,uuid,text,bigint)', 'public.admin_add_integrity_case_note_impl(uuid,text)'),
    ('admin_record_integrity_preclearance_ruling', 'public.admin_record_integrity_preclearance_ruling(uuid,text,text,text,text[])', 'public.studio2_integrity_record_preclearance_ruling(uuid,text,text,text,text[],uuid,text,bigint)', 'public.admin_record_integrity_preclearance_ruling_impl(uuid,text,text,text,text[])'),
    ('admin_set_integrity_case_retention', 'public.admin_set_integrity_case_retention(uuid,timestamptz,text)', 'public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)', 'public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text)'),
    ('admin_set_integrity_retention', 'public.admin_set_integrity_retention(uuid,timestamptz)', 'public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)', 'public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text)')
    ) required(name, signature, canonical, implementation)
  loop
    v_oid := to_regprocedure(v_signature);
    select count(*), max(pg_get_userbyid(p.proowner)::text)
      into v_count, v_owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;

    if v_oid is null or v_count <> 1 or v_owner <> 'postgres' then
      raise exception 'Legacy Integrity RPC is not uniquely postgres-owned: % (%, %)',
        v_signature, v_count, v_owner using errcode = '55000';
    end if;
    if to_regprocedure(v_canonical) is null or to_regprocedure(v_impl) is null then
      raise exception 'Expected governed command or internal implementation unavailable: %',
        v_signature using errcode = '55000';
    end if;
    if exists (
      select 1 from pg_depend d
      where d.refclassid = 'pg_proc'::regclass
        and d.refobjid = v_oid and d.deptype = 'n'
    ) then
      raise exception 'Legacy Integrity RPC has dependent SQL objects: %',
        v_signature using errcode = '55000';
    end if;
  end loop;
end $preflight$;

drop function public.admin_recuse_from_integrity_case(uuid,text) restrict;
drop function public.admin_add_integrity_case_note(uuid,text) restrict;
drop function public.admin_record_integrity_preclearance_ruling(uuid,text,text,text,text[]) restrict;
drop function public.admin_set_integrity_case_retention(uuid,timestamptz,text) restrict;
drop function public.admin_set_integrity_retention(uuid,timestamptz) restrict;

notify pgrst, 'reload schema';
commit;
