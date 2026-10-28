begin;

select public.v3_register_migration_contract(
  'v3.integrity.residual-writer-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern remaining Integrity evidence, identity, publication and rule-link writers with live actor authority; isolate stale identity expiry'
);

do $actor_authority$
declare
  v_target record;
  v_oid regprocedure;
  v_definition text;
  v_pattern text;
  v_replacement text;
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
    if v_oid is null then
      raise exception 'Missing Integrity residual command: %', v_target.signature;
    end if;

    v_definition := pg_get_functiondef(v_oid);
    v_pattern := 'if not public\.studio2_access_allowed\(''' ||
      replace(v_target.capability, '.', '\.') ||
      ''',\s*null,\s*false\)';

    if (select count(*) from regexp_matches(v_definition, v_pattern, 'g')) <> 1 then
      raise exception 'Ambiguous Integrity residual authorization boundary: %', v_target.signature;
    end if;

    v_replacement :=
      'if not private.studio2_user_has_capability(auth.uid(), ''' ||
      v_target.capability ||
      ''', null) or not public.studio2_access_allowed(''' ||
      v_target.capability ||
      ''', null, false)';
    v_definition := regexp_replace(v_definition, v_pattern, v_replacement);

    if strpos(v_definition, 'perform private.v3_require_active_auth_session();') = 0 then
      v_definition := replace(
        v_definition,
        'if not private.studio2_user_has_capability(auth.uid(),',
        'perform private.v3_require_active_auth_session();' || chr(10) ||
        '  if not private.studio2_user_has_capability(auth.uid(),'
      );
    end if;

    execute v_definition;
    execute format('alter function %s set search_path = pg_catalog, public, private, auth, storage, extensions', v_oid::regprocedure);
    execute format('revoke all on function %s from public, anon, service_role', v_oid::regprocedure);
    execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
  end loop;
end
$actor_authority$;

-- Rules owns the created interpretation, but this command consumes protected
-- Integrity case/ruling truth and writes an Integrity audit event. Require a
-- live actor with both capabilities rather than treating service transport as
-- cross-domain authority.
do $rule_case_authority$
declare
  v_oid regprocedure := to_regprocedure('public.admin_create_rule_interpretation_from_integrity_case(uuid,uuid,text,text,text,timestamp with time zone)');
  v_definition text;
  v_pattern text := 'if not public\.studio2_access_allowed\(''rules\.edit'',\s*null,\s*false\)';
  v_replacement text :=
    'if not private.studio2_user_has_capability(auth.uid(), ''rules.edit'', null)' ||
    ' or not public.studio2_access_allowed(''rules.edit'', null, false)' ||
    ' or not private.studio2_user_has_capability(auth.uid(), ''integrity.manage'', null)';
begin
  if v_oid is null then raise exception 'Missing Rules/Integrity case interpretation command'; end if;
  v_definition := pg_get_functiondef(v_oid);
  if (select count(*) from regexp_matches(v_definition, v_pattern, 'g')) <> 1 then
    raise exception 'Ambiguous Rules/Integrity authorization boundary';
  end if;
  v_definition := regexp_replace(v_definition, v_pattern, v_replacement);
  if strpos(v_definition, 'perform private.v3_require_active_auth_session();') = 0 then
    v_definition := replace(
      v_definition,
      'if not private.studio2_user_has_capability(auth.uid(),',
      'perform private.v3_require_active_auth_session();' || chr(10) ||
      '  if not private.studio2_user_has_capability(auth.uid(),'
    );
  end if;
  execute v_definition;
  execute format('alter function %s set search_path = pg_catalog, public, private, auth, storage, extensions', v_oid::regprocedure);
  execute format('revoke all on function %s from public, anon, service_role', v_oid::regprocedure);
  execute format('grant execute on function %s to authenticated', v_oid::regprocedure);
end
$rule_case_authority$;

-- Deterministic expiry is an internal reconciliation primitive. It is invoked
-- from governed SECURITY DEFINER readers/commands and must not be externally
-- executable as a peer writer.
do $expiry_primitive$
declare
  v_oid regprocedure := to_regprocedure('public.integrity_expire_stale_identity_approvals()');
begin
  if v_oid is null then raise exception 'Missing stale identity approval expiry primitive'; end if;
  execute format('alter function %s set search_path = pg_catalog, public, private', v_oid::regprocedure);
  execute format('revoke all on function %s from public, anon, authenticated, service_role', v_oid::regprocedure);
end
$expiry_primitive$;

commit;
