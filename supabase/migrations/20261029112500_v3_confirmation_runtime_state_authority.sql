begin;
select public.v3_register_migration_contract('v3.confirmation.runtime-state-authority',1,'forward_fix_only',false,null,'Keep Confirmation operation identities and server revisions owner-controlled; bind round retries to the complete semantic request and require a live actor before readback.');

-- Receipts and revisions are command-owned state, never service-role input.
revoke insert,update,delete,truncate on public.studio2_confirmation_round_versions,private.v3_confirmation_operations from public,anon,authenticated,service_role;
do $columns$
declare t regclass; cols text;
begin
 foreach t in array array['public.studio2_confirmation_round_versions'::regclass,'private.v3_confirmation_operations'::regclass] loop
  select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=t and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on %s from public,anon,authenticated,service_role',cols,cols,t);
 end loop;
end $columns$;

-- Preserve the existing command, locks, version advancement, audit and result.
-- Fail closed if its live implementation no longer matches this exact delta.
do $command$
declare d text; old_claim text; new_claim text;
begin
 d:=pg_get_functiondef('public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)'::regprocedure);
 old_claim:=$old$  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.round.' || p_change_kind,
    v_risk,
    jsonb_build_object(
      'roundId', p_round_id,
      'editionId', nullif(p_payload ->> 'editionId', ''),
      'expectedVersion', p_expected_version
    )
  );$old$;
 new_claim:=$new$  -- Resolve authority from the canonical round, including exact readback
  -- after deletion. A supplied edition field cannot authorize another round.
  if p_change_kind = 'create' then
    v_edition_id := nullif(p_payload ->> 'editionId', '')::uuid;
  else
    select edition_id into v_edition_id from public.submission_rounds where id=p_round_id;
    if v_edition_id is null then
      select (scope->>'editionId')::uuid into v_edition_id from public.studio2_operation_receipts
      where operation_id=p_operation_id and actor_id=auth.uid() and command='confirmation.round.'||p_change_kind;
    end if;
  end if;
  if v_edition_id is null or not private.studio2_user_has_capability(auth.uid(),'confirmation.manage',v_edition_id)
     or not public.studio2_access_allowed('confirmation.manage',v_edition_id,false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode='42501';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'confirmation.round.' || p_change_kind,
    v_risk,
    jsonb_build_object('roundId', p_round_id, 'editionId', v_edition_id),
    jsonb_build_object('payload', p_payload, 'expectedVersion', p_expected_version)
  );$new$;
 if position(old_claim in d)=0 or position(E'begin\n' in d)=0 then raise exception 'Confirmation round command upgrade precondition changed'; end if;
 d:=replace(d,old_claim,new_claim);
 d:=replace(d,E'begin\n',E'begin\n  perform private.v3_require_active_auth_session();\n');
 execute d;
end $command$;
alter function public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint) set search_path=pg_catalog,public,private,auth,pg_temp;
revoke all on function public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint) from public,anon,service_role;
grant execute on function public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint) to authenticated;
commit;
