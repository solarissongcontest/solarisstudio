begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select public.v3_register_migration_contract(
  'v3.integrity.participant-appeal-single-writer',1,'forward_fix_only',false,null,
  'Retire competing participant appeal physical writers, retaining existing V3 command/receipt ownership and validating anonymous recovery credentials before replay'
);
do $preflight$
declare v_command text; v_impl text; v_call text; v_role text; v_def text; v_oid oid;
begin
  for v_command,v_impl,v_call in select * from (values
    ('public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','public.reporter_submit_integrity_appeal_impl(uuid,uuid,text)','reporter_submit_integrity_appeal_impl('),
    ('public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text)','public_submit_anonymous_integrity_appeal_impl(')
  ) expected(command,implementation,call)
  loop
    v_oid:=to_regprocedure(v_command);
    if v_oid is null or to_regprocedure(v_impl) is null then
      raise exception 'Missing canonical appeal or internal physical writer: %, %',v_command,v_impl using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      where p.oid=v_oid and p.prosecdef and pg_get_userbyid(p.proowner)='postgres';
    if v_def is null or strpos(v_def,v_call)=0
       or strpos(v_def,'app.integrity_operation_id')=0
       or strpos(v_def,'request_fingerprint')=0 then
      raise exception 'Canonical appeal receipt owner drift: %',v_command using errcode='55000';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,to_regprocedure(v_impl),'EXECUTE') then
        raise exception 'Competing appeal primitive exposed to role %: %',v_role,v_impl using errcode='55000';
      end if;
    end loop;
  end loop;
end $preflight$;

create or replace function public.v3_submit_integrity_appeal(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_id uuid,
  p_sanction_id uuid,
  p_grounds text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $submit$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_grounds text := btrim(coalesce(p_grounds, ''));
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_operation uuid;
  v_result jsonb;
  v_effective_at timestamptz;
  v_id uuid;
  v_deadline timestamptz;
  v_timely boolean;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity is required' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object('caseId', p_case_id, 'sanctionId', p_sanction_id);
  v_request := jsonb_build_object('grounds', v_grounds);
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.appeal.submit.protected', 'R3', v_scope, v_request
  );

  insert into public.studio2_operation_receipts(
    operation_id, actor_id, idempotency_key, correlation_id,
    request_fingerprint, command, risk_class, scope
  ) values (
    p_operation_id, v_actor, v_key, p_operation_id,
    v_fingerprint, 'integrity.appeal.submit.protected', 'R3', v_scope
  )
  on conflict do nothing;

  select receipt.* into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = 'integrity.appeal.submit.protected'
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.appeal.submit.protected'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  v_operation := v_receipt.operation_id;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object(
      'ok', true, 'operation_id', v_operation, 'receipt_id', v_operation, 'replayed', true
    );
  end if;
  if v_receipt.status <> 'processing' then
    raise exception 'STATE_CHANGED' using errcode = 'P0001';
  end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.submit.protected', true);

  -- The canonical receipted operation now owns the mature validation,
  -- reviewer-safe sanction linkage, one physical appeal, and its audit event.
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.integrity_cases c
    where c.id = p_case_id and c.reporter_user_id = auth.uid() and c.identity_mode in ('sealed', 'confidential')
  ) then raise exception 'Case not available'; end if;

  v_grounds := trim(coalesce(v_grounds, ''));
  if char_length(v_grounds) < 20 or char_length(v_grounds) > 12000 then raise exception 'Appeal grounds must be between 20 and 12000 characters'; end if;
  select effective_at into v_effective_at
  from public.integrity_case_sanctions
  where id = p_sanction_id and case_id = p_case_id and status = 'active' and visible_to_reporter = true;
  if v_effective_at is null then raise exception 'Appealable sanction not found'; end if;
  if exists (select 1 from public.integrity_case_appeals where sanction_id = p_sanction_id and submitted_via <> 'organizer') then raise exception 'An appeal has already been submitted for this sanction'; end if;

  v_deadline := v_effective_at + interval '48 hours';
  v_timely := now() <= v_deadline;
  insert into public.integrity_case_appeals(
    case_id, sanction_id, grounds, submitted_by_user_id, submitted_via,
    deadline_at, was_timely, status
  ) values (
    p_case_id, p_sanction_id, v_grounds, auth.uid(), 'protected_reporter',
    v_deadline, v_timely, case when v_timely then 'submitted' else 'rejected_late' end
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (
    p_case_id,
    'appeal.submitted',
    case when v_timely then 'Appeal submitted within the 48-hour window' else 'Appeal submitted after the 48-hour window' end,
    auth.uid()
  );
  v_result := jsonb_build_object('ok', true, 'appeal_id', v_id, 'was_timely', v_timely, 'deadline_at', v_deadline);
  v_result := v_result || jsonb_build_object(
    'operation_id', v_operation, 'receipt_id', v_operation
  );

  perform private.studio2_complete_operation(v_operation, v_result);
  return v_result || jsonb_build_object('ok', true, 'replayed', false);
end
$submit$;

create or replace function public.v3_public_submit_anonymous_integrity_appeal(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_code text,
  p_recovery_key text,
  p_sanction_id uuid,
  p_grounds text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $submit$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_fingerprint text;
  v_row private.v3_anonymous_integrity_appeal_operations%rowtype;
  v_result jsonb;
  v_case_id uuid;
  v_hash text;
  v_effective_at timestamptz;
  v_deadline timestamptz;
  v_timely boolean;
  v_id uuid;
  v_grounds text := btrim(coalesce(p_grounds,''));
begin
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then raise exception 'Valid operation identity is required' using errcode = '22023'; end if;
  v_key_hash := encode(extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'), 'hex');
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.appeal.submit.anonymous', 'R3',
    jsonb_build_object('caseCode', upper(btrim(coalesce(p_case_code, ''))), 'sanctionId', p_sanction_id),
    jsonb_build_object('grounds', btrim(coalesce(p_grounds, '')))
  );

  insert into private.v3_anonymous_integrity_appeal_operations(idempotency_key_hash, operation_id, request_fingerprint)
  values (v_key_hash, p_operation_id, v_fingerprint)
  on conflict do nothing;

  select * into v_row
  from private.v3_anonymous_integrity_appeal_operations
  where idempotency_key_hash = v_key_hash
  for update;

  if v_row.operation_id is distinct from p_operation_id or v_row.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  -- An anonymous replay cannot return a stored private receipt without
  -- the reporter's recovery secret, even when the operation key is known.
  if char_length(v_grounds) < 20 or char_length(v_grounds) > 12000 then
    raise exception 'Appeal grounds must be between 20 and 12000 characters';
  end if;
  v_hash := encode(extensions.digest(
    convert_to(public.integrity_normalize_secret(p_recovery_key),'UTF8'),'sha256'
  ),'hex');
  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code)=upper(btrim(coalesce(p_case_code,'')))
    and c.identity_mode='anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1
  for update of c;
  if v_case_id is null then
    v_result := jsonb_build_object(
      'ok',false,'error','Case code or recovery key is incorrect.',
      'operation_id',p_operation_id,'replayed',false
    );
    if v_row.completed_at is not null then return v_result; end if;
    update private.v3_anonymous_integrity_appeal_operations
      set result=v_result,completed_at=now()
      where idempotency_key_hash=v_key_hash;
    return v_result;
  end if;

  if v_row.completed_at is not null then
    return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.submit.anonymous', true);
  -- Preserve the original sanction/48-hour window, one-appeal invariant,
  -- anonymous author identity and immutable event path in this single owner.
  select effective_at into v_effective_at
  from public.integrity_case_sanctions
  where id = p_sanction_id and case_id = v_case_id and status = 'active' and visible_to_reporter = true;
  if v_effective_at is null then raise exception 'Appealable sanction not found'; end if;
  if exists (select 1 from public.integrity_case_appeals where sanction_id = p_sanction_id and submitted_via <> 'organizer') then raise exception 'An appeal has already been submitted for this sanction'; end if;

  v_deadline := v_effective_at + interval '48 hours';
  v_timely := now() <= v_deadline;
  insert into public.integrity_case_appeals(
    case_id, sanction_id, grounds, submitted_by_user_id, submitted_via,
    deadline_at, was_timely, status
  ) values (
    v_case_id, p_sanction_id, v_grounds, null, 'anonymous_recovery',
    v_deadline, v_timely, case when v_timely then 'submitted' else 'rejected_late' end
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (
    v_case_id,
    'appeal.submitted',
    case when v_timely then 'Anonymous appeal submitted within the 48-hour window' else 'Anonymous appeal submitted after the 48-hour window' end,
    null
  );
  v_result := jsonb_build_object('ok', true, 'appeal_id', v_id, 'was_timely', v_timely, 'deadline_at', v_deadline);
  v_result := v_result || jsonb_build_object('operation_id',p_operation_id,'replayed',false);

  update private.v3_anonymous_integrity_appeal_operations
  set result = v_result, completed_at = now()
  where idempotency_key_hash = v_key_hash;
  return v_result;
end
$submit$;

revoke all on function public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text) from public,anon;
grant execute on function public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text) to authenticated,service_role;
revoke all on function public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text) from public;
grant execute on function public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text) to anon,authenticated,service_role;
-- RESTRICT stops adoption on an unexpected SQL dependency; no replacement
-- callable primitive, trigger removal or catalog policy exemption.
drop function public.reporter_submit_integrity_appeal_impl(uuid,uuid,text) restrict;
drop function public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text) restrict;
do $postflight$
declare v_definition text;
begin
  if to_regprocedure('public.reporter_submit_integrity_appeal_impl(uuid,uuid,text)') is not null
     or to_regprocedure('public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text)') is not null then
    raise exception 'Retired participant appeal implementation survived' using errcode='55000';
  end if;
  select pg_get_functiondef(to_regprocedure('public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)')) into v_definition;
  if strpos(v_definition,'reporter_submit_integrity_appeal_impl(')>0
     or strpos(v_definition,'public.integrity_case_appeals')=0
     or strpos(v_definition,'public.integrity_case_events')=0
     or strpos(v_definition,'private.studio2_complete_operation(')=0 then
    raise exception 'Registered appeal physical writer/receipt not owned by command' using errcode='55000';
  end if;
  select pg_get_functiondef(to_regprocedure('public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)')) into v_definition;
  if strpos(v_definition,'public_submit_anonymous_integrity_appeal_impl(')>0
     or strpos(v_definition,'public.integrity_case_appeals')=0
     or strpos(v_definition,'public.integrity_case_events')=0
     or strpos(v_definition,'a.recovery_secret_hash = v_hash')=0
     or strpos(v_definition,'v_row.completed_at is not null')=0 then
    raise exception 'Anonymous appeal owner/replay credential not retained' using errcode='55000';
  end if;
  if has_function_privilege('anon','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('anon','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE') then
    raise exception 'Participant appeal public role grants were changed' using errcode='55000';
  end if;
end $postflight$;
notify pgrst, 'reload schema';
commit;
