\set ON_ERROR_STOP on

begin;

do $proof$
declare
  v_target record;
  v_oid regprocedure;
  v_def text;
  v_config text;
begin
  for v_target in
    select * from (values
      ('public.admin_cancel_integrity_evidence_deletion(uuid,text)', 'integrity.manage'),
      ('public.admin_create_integrity_evidence_disclosure_copy(uuid,text,text,text,boolean,text)', 'integrity.manage'),
      ('public.admin_decide_sealed_identity_disclosure(uuid,boolean,text)', 'integrity.manage'),
      ('public.admin_discard_expired_evidence_upload(uuid)', 'integrity.manage'),
      ('public.admin_finalize_integrity_evidence_deletion(uuid)', 'integrity.manage'),
      ('public.admin_finalize_integrity_evidence_derivative(uuid,text,text,text)', 'integrity.manage'),
      ('public.admin_integrity_reporter_identity(uuid)', 'integrity.read'),
      ('public.admin_publish_integrity_decision(uuid,text,text,text,text[])', 'integrity.sanction'),
      ('public.admin_request_sealed_identity_disclosure(uuid,text)', 'integrity.manage'),
      ('public.admin_reveal_sealed_identity(uuid)', 'integrity.manage'),
      ('public.admin_schedule_integrity_evidence_deletion(uuid,timestamp with time zone,text)', 'integrity.manage'),
      ('public.admin_upsert_integrity_rule_link(uuid,text,text,text)', 'integrity.manage')
    ) as targets(signature, capability)
  loop
    v_oid := to_regprocedure(v_target.signature);
    if v_oid is null then raise exception 'Residual Integrity command missing: %', v_target.signature; end if;

    select pg_get_functiondef(p.oid), array_to_string(p.proconfig, ',')
      into v_def, v_config
    from pg_proc p where p.oid = v_oid;

    if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
      raise exception 'Residual Integrity command is not SECURITY DEFINER: %', v_target.signature;
    end if;
    if coalesce(v_config, '') not like '%search_path=pg_catalog,%' then
      raise exception 'Residual Integrity command search_path is not pinned safely: % => %', v_target.signature, v_config;
    end if;
    if v_def not like '%perform private.v3_require_active_auth_session();%' then
      raise exception 'Residual Integrity command lacks active-session proof: %', v_target.signature;
    end if;
    if v_def not like '%private.studio2_user_has_capability(auth.uid(), ''' || v_target.capability || ''', null)%' then
      raise exception 'Residual Integrity command lacks actor capability proof: %', v_target.signature;
    end if;
    if has_function_privilege('service_role', v_oid, 'EXECUTE')
       or has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception 'Residual Integrity command is executable by transport/anonymous role: %', v_target.signature;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'Residual Integrity command lost authenticated semantic access: %', v_target.signature;
    end if;
  end loop;
end
$proof$;

do $cross_domain$
declare
  v_oid regprocedure := to_regprocedure('public.admin_create_rule_interpretation_from_integrity_case(uuid,uuid,text,text,text,timestamp with time zone)');
  v_def text;
  v_config text;
begin
  if v_oid is null then raise exception 'Rules/Integrity case command missing'; end if;
  select pg_get_functiondef(p.oid), array_to_string(p.proconfig, ',') into v_def, v_config
  from pg_proc p where p.oid = v_oid;
  if coalesce(v_config, '') not like '%search_path=pg_catalog,%' then raise exception 'Rules/Integrity command search_path is unsafe'; end if;
  if v_def not like '%perform private.v3_require_active_auth_session();%'
     or v_def not like '%private.studio2_user_has_capability(auth.uid(), ''rules.edit'', null)%'
     or v_def not like '%private.studio2_user_has_capability(auth.uid(), ''integrity.manage'', null)%' then
    raise exception 'Rules/Integrity command lacks live dual-capability scope';
  end if;
  if has_function_privilege('service_role', v_oid, 'EXECUTE')
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'Rules/Integrity command EXECUTE boundary is unsafe';
  end if;
end
$cross_domain$;

do $internal_expiry$
declare
  v_oid regprocedure := to_regprocedure('public.integrity_expire_stale_identity_approvals()');
  v_config text;
begin
  if v_oid is null then raise exception 'Stale identity expiry primitive missing'; end if;
  select array_to_string(p.proconfig, ',') into v_config from pg_proc p where p.oid = v_oid;
  if coalesce(v_config, '') not like '%search_path=pg_catalog,%' then raise exception 'Stale identity expiry primitive search_path is unsafe'; end if;
  if has_function_privilege('service_role', v_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'Stale identity expiry primitive is externally executable';
  end if;
end
$internal_expiry$;

rollback;
