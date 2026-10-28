begin;
select public.v3_register_migration_contract(
  'v3.publication.direct-write-cutover',1,'forward_fix_only',false,null,
  'Repository application callers use governed publication RPCs; the due-publication scheduler is owner-executed SECURITY DEFINER. Retire residual API-role raw publication-control and execution DML while preserving bounded reads and exact RPC authority.'
);
revoke insert,update,delete,truncate on public.studio2_show_publication_controls,
  public.studio2_show_publication_executions from public,anon,authenticated,service_role;
-- Preserve the mature publication/result-release machinery, changing only
-- admission and retry ordering. Match exact reviewed anchors and fail closed
-- if another migration changed the canonical implementation unexpectedly.
do $replay$
declare
  v_definition text := pg_get_functiondef('public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)'::regprocedure);
  v_anchor text := '  perform private.studio2_ensure_show_publication_control(p_show_id);';
  v_scope text := E'''showId'', p_show_id,\n      ''fromState'', v_from,';
begin
  if strpos(v_definition,'v_publication_request jsonb;')>0 then return; end if;
  if strpos(v_definition,'  v_from text;')=0 or strpos(v_definition,v_anchor)=0 or strpos(v_definition,v_scope)=0 then
    raise exception 'Unrecognized canonical publication command; admission/replay patch refused';
  end if;
  v_definition:=replace(v_definition,'  v_from text;',E'  v_from text;\n  v_publication_request jsonb;\n  v_prior_receipt public.studio2_operation_receipts%rowtype;');
  v_definition:=replace(v_definition,v_anchor,$admission$
  perform private.v3_require_active_auth_session();
  if private.studio2_publication_has_outcomes(private.studio2_normalise_publication_config(p_config))
     or private.studio2_publication_has_outcomes(v_show.publication_config) then
    if not public.studio2_access_allowed('results.publish',v_show.edition_id,false) then
      raise exception 'Missing scoped results.publish authority' using errcode='42501';
    end if;
  elsif not public.studio2_access_allowed('edition.manage',v_show.edition_id,false) then
    raise exception 'Missing scoped edition.manage authority' using errcode='42501';
  end if;
  v_publication_request:=jsonb_build_object('showId',p_show_id,'targetState',v_target,
    'config',private.studio2_normalise_publication_config(p_config),
    'scheduledFor',p_scheduled_for,'expectedVersion',p_expected_version);
  select receipt.* into v_prior_receipt from public.studio2_operation_receipts receipt
  where receipt.operation_id=p_operation_id or
    (receipt.actor_id=v_actor and receipt.command='publication.show.change' and receipt.idempotency_key=p_idempotency_key)
  order by case when receipt.operation_id=p_operation_id then 0 else 1 end limit 1 for update;
  if found then
    if v_prior_receipt.actor_id is distinct from v_actor or v_prior_receipt.command<>'publication.show.change'
       or v_prior_receipt.idempotency_key is distinct from p_idempotency_key
       or v_prior_receipt.scope->'request' is distinct from v_publication_request then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode='P0001';
    end if;
    if v_prior_receipt.status<>'succeeded' then raise exception 'OPERATION_IN_PROGRESS' using errcode='55000'; end if;
    return v_prior_receipt.result;
  end if;
  perform private.studio2_ensure_show_publication_control(p_show_id);
$admission$);
  v_definition:=replace(v_definition,v_scope,E'''showId'', p_show_id,\n      ''request'', v_publication_request,\n      ''fromState'', v_from,');
  execute v_definition;
end
$replay$;
commit;
