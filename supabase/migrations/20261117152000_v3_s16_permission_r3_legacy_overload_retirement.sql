-- S16 P16: retire the legacy eight-argument R3 permission writer.
-- The active nine-argument R3 command requires a second-operator approval.
-- The obsolete overload bypasses that requirement and can be executed using
-- service-role credentials. The UI already sends approvalRequestId.
-- Do not replace with an allowlist or weaken permission authorization.
-- Forward-only source. Hosted Supabase changes require separate approval.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

do $s16_p16_preflight$
declare
  v_legacy oid := to_regprocedure(
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint)'
  );
  v_canonical oid := to_regprocedure(
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)'
  );
  v_core oid := to_regprocedure(
    'public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)'
  );
  v_old pg_proc%rowtype;
  v_new pg_proc%rowtype;
  v_inner pg_proc%rowtype;
begin
  if current_user<>'postgres'
    or current_setting('server_version_num')::int / 10000<>17
    or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
    or exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.permission-r3-legacy-overload-retirement')
    or v_legacy is null or v_canonical is null or v_core is null
  then raise exception 'S16 permission R3 retirement requires source PG17 owner and both exact overloads'
    using errcode='55000';end if;
  select * into v_old from pg_proc where oid=v_legacy;
  select * into v_new from pg_proc where oid=v_canonical;
  select * into v_inner from pg_proc where oid=v_core;

  if not v_old.prosecdef or pg_get_userbyid(v_old.proowner)<>'postgres'
    or v_old.proconfig<>array['search_path=pg_catalog, public, private, auth']::text[]
    or position('private.studio2_require_fresh_auth' in v_old.prosrc)=0
    or position('public.studio2_apply_permission_change(' in v_old.prosrc)=0
    or position('p_approval_request_id' in v_old.prosrc)>0
    or not has_function_privilege('service_role',v_legacy,'EXECUTE')
    or has_function_privilege('authenticated',v_legacy,'EXECUTE')
    or has_function_privilege('anon',v_legacy,'EXECUTE')
  then raise exception 'S16 obsolete permission R3 function authority drift; do not blindly drop'
    using errcode='55000';end if;

  if not v_new.prosecdef or pg_get_userbyid(v_new.proowner)<>'postgres'
    or v_new.proconfig<>array['search_path=pg_catalog, public, private, auth']::text[]
    or position('p_approval_request_id' in v_new.prosrc)=0
    or position('An approved second-operator request is required' in v_new.prosrc)=0
    or position('private.studio2_require_fresh_auth' in v_new.prosrc)=0
    or position('update public.studio2_operation_receipts' in v_new.prosrc)=0
    or position('consumed_at = now()' in v_new.prosrc)=0
    or position('v_approval.approved_by = v_actor' in v_new.prosrc)=0
    or not has_function_privilege('authenticated',v_canonical,'EXECUTE')
    or has_function_privilege('anon',v_canonical,'EXECUTE')
  then raise exception 'S16 active two-operator R3 command missing authorization or receipt contract'
    using errcode='55000';end if;

  -- The lower-level permission mutator was left service-executable during
  -- compatibility, despite the R3 wrapper owning fresh-auth and second
  -- operator approval. No application caller directly uses it. Preserve
  -- this owner-definer function for the nine-argument command, but remove
  -- its direct API RPC EXECUTE authority.
  if not v_inner.prosecdef
     or pg_get_userbyid(v_inner.proowner)<>'postgres'
     or v_inner.proconfig <> array['search_path=pg_catalog, public, private']::text[]
     or position('private.studio2_can_manage_permissions(' in v_inner.prosrc)=0
     or position('private.studio2_claim_operation(' in v_inner.prosrc)=0
     or not has_function_privilege('service_role',v_core,'EXECUTE')
     or has_function_privilege('authenticated',v_core,'EXECUTE')
     or has_function_privilege('anon',v_core,'EXECUTE')
  then raise exception 'S16 permission low-level service RPC is not the expected owner/receipt-controlled historical definition'
    using errcode='55000';end if;

  if exists (select 1 from pg_depend d
    where d.refclassid='pg_proc'::regclass and d.refobjid=v_legacy
      and d.classid='pg_proc'::regclass and d.deptype='n')
  then raise exception 'S16 legacy permission R3 overload has dependent SQL functions; migrate first'
    using errcode='55000';end if;
end $s16_p16_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.permission-r3-legacy-overload-retirement',1,'forward_fix_only',false,null,
  'Remove service-role callable R3 permission bypass without replacing the approved nine-argument command'
);

-- RESTRICT is intentional. Any unexpected dependency aborts rather than
-- silently cascading into live permissions, receipts or release protection.
drop function public.studio2_apply_permission_change_r3(
  uuid,text,text,uuid,timestamptz,uuid,text,bigint
) restrict;

-- Keep implementation available to postgres-owned canonical nine-argument
-- R3, but revoke externally executable service-role bypass of approval.
revoke execute on function public.studio2_apply_permission_change(
  uuid,text,text,uuid,timestamptz,uuid,text,bigint
) from public,anon,authenticated,service_role;

do $s16_p16_postcheck$
declare v_new oid:=to_regprocedure(
  'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)'
);
begin
  if to_regprocedure('public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint)') is not null
    or v_new is null
    or has_function_privilege('service_role',
      'public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
      'EXECUTE')
    or has_function_privilege('authenticated',
      'public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
      'EXECUTE')
    or has_function_privilege('anon',
      'public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
      'EXECUTE')
    or not has_function_privilege('authenticated',v_new,'EXECUTE')
    or has_function_privilege('anon',v_new,'EXECUTE')
    or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='studio2_apply_permission_change_r3')<>1
  then raise exception 'S16 R3 canonical permission command overloaded, missing or unguarded'
    using errcode='42501';end if;
end $s16_p16_postcheck$;

notify pgrst,'reload schema';
commit;
