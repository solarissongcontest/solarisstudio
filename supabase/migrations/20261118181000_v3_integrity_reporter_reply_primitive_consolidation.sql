begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.reporter-reply-primitive-consolidation',1,'forward_fix_only',false,null,
  'Retire redundant registered/anonymous reporter reply internal writers, keeping token privacy, full CAS, idempotent receipts, request state and immutable case history'
);

do $preflight$
declare v_command text; v_implementation text; v_call text; v_proc oid; v_definition text; v_role text;
begin
  for v_command,v_implementation,v_call in
    select * from (values
      ('public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)',
       'public.reporter_reply_integrity_case_impl(uuid,text)',
       'reporter_reply_integrity_case_impl('),
      ('public.v3_public_reply_anonymous_integrity_case(uuid,text,text,text,text,bigint)',
       'public.public_reply_anonymous_integrity_case_impl(text,text,text)',
       'public_reply_anonymous_integrity_case_impl(')
    ) aliases(command,implementation,call_name)
  loop
    v_proc := to_regprocedure(v_command);
    if v_proc is null or to_regprocedure(v_implementation) is null then
      raise exception 'Reporter reply V3 command/internal implementation missing: %, %',
        v_command,v_implementation using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p where p.oid=v_proc and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=pg_catalog%';
    if v_definition is null or strpos(v_definition,v_call)=0
       or strpos(v_definition,'PT409')=0
       or strpos(v_definition,'app.integrity_operation_id')=0
       or strpos(v_definition,'request_fingerprint')=0 then
      raise exception 'Reporter reply command owner/CAS/receipt definition drift: %',
        v_command using errcode='55000';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,to_regprocedure(v_implementation),'EXECUTE') then
        raise exception 'Internal reporter writer exposed to API role %: %',
          v_role,v_implementation using errcode='55000';
      end if;
    end loop;
  end loop;
end $preflight$;

create or replace function public.v3_reporter_reply_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_id uuid,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_message text := btrim(coalesce(p_body, ''));
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object('caseId', p_case_id);
  v_request := jsonb_build_object('body', v_message, 'expectedVersion', p_expected_version);
  v_fingerprint := private.studio2_request_fingerprint('integrity.case.reporter_reply', 'R3', v_scope, v_request);

  insert into public.studio2_operation_receipts(
    operation_id, actor_id, idempotency_key, correlation_id,
    request_fingerprint, command, risk_class, scope
  ) values (
    p_operation_id, v_actor, v_key, p_operation_id,
    v_fingerprint, 'integrity.case.reporter_reply', 'R3', v_scope
  ) on conflict do nothing;

  select receipt.* into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (receipt.actor_id = v_actor and receipt.command = 'integrity.case.reporter_reply' and receipt.idempotency_key = v_key)
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.case.reporter_reply'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'operation_id', v_receipt.operation_id, 'replayed', true);
  end if;
  if v_receipt.status <> 'processing' then raise exception 'STATE_CHANGED' using errcode = 'P0001'; end if;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null or v_case.reporter_user_id is distinct from v_actor then
    raise exception 'Case not available' using errcode = '42501';
  end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409';
  end if;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply', true);
  -- The governed case/reporter CAS and receipt already own this transaction.
  -- Preserve the legacy body checks, request progression and reporter-visible
  -- snapshot while retiring a separately named physical mutation primitive.
  if char_length(v_message) < 2 or char_length(v_message) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (p_case_id, 'reporter', v_message, v_actor);
  update public.integrity_case_requests
  set status = 'responded', responded_at = now()
  where case_id = p_case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases
  set status = case when status = 'waiting_for_reporter' then 'under_review' else status end,
      updated_at = now()
  where id = p_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (p_case_id, 'reporter.message', 'Reporter response received', v_actor);
  v_result := public.integrity_case_snapshot(p_case_id);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'snapshot', v_result,
    'case_id', p_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'receipt_id', p_operation_id
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$body$;

create or replace function public.v3_public_reply_anonymous_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_code text,
  p_recovery_key text,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_fingerprint text;
  v_row private.v3_anonymous_integrity_response_operations%rowtype;
  v_case_id uuid;
  v_case public.integrity_cases%rowtype;
  v_hash text;
  v_inner jsonb;
  v_result jsonb;
begin
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_key_hash := encode(extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'), 'hex');
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.reporter_reply.anonymous', 'R3',
    jsonb_build_object('caseCode', upper(btrim(coalesce(p_case_code, '')))),
    jsonb_build_object('body', btrim(coalesce(p_body, '')), 'expectedVersion', p_expected_version)
  );

  insert into private.v3_anonymous_integrity_response_operations(idempotency_key_hash, operation_id, request_fingerprint)
  values (v_key_hash, p_operation_id, v_fingerprint)
  on conflict do nothing;

  select * into v_row
  from private.v3_anonymous_integrity_response_operations
  where idempotency_key_hash = v_key_hash
  for update;

  if v_row.operation_id is distinct from p_operation_id or v_row.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_row.completed_at is not null then
    return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(p_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.* into v_case
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(btrim(coalesce(p_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1
  for update of c;
  if v_case.id is null then raise exception 'Case code or recovery key is incorrect' using errcode = '42501'; end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409';
  end if;
  v_case_id := v_case.id;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply.anonymous', true);
  -- The anonymous recovery-token guard above is already locked with the case
  -- revision and receipt fingerprint. Retain the original private-safe result,
  -- message limits, request completion and event semantics in this one owner.
  if char_length(btrim(coalesce(p_body, ''))) < 2
     or char_length(btrim(coalesce(p_body, ''))) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', btrim(coalesce(p_body, '')), null);
  update public.integrity_case_requests
  set status = 'responded', responded_at = now()
  where case_id = v_case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases
  set status = case when status = 'waiting_for_reporter' then 'under_review' else status end,
      updated_at = now()
  where id = v_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'reporter.message', 'Additional information received', null);
  v_inner := jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));

  select * into v_case from public.integrity_cases where id = v_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'result', v_inner,
    'case_id', v_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'replayed', false
  );
  update private.v3_anonymous_integrity_response_operations
  set result = v_result, completed_at = now()
  where idempotency_key_hash = v_key_hash;
  return v_result;
end
$body$;

-- Reaffirm existing public ingress policy; do not create a privileged API.
revoke all on function public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)
  from public, anon;
grant execute on function public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)
  to authenticated, service_role;
revoke all on function public.v3_public_reply_anonymous_integrity_case(uuid,text,text,text,text,bigint)
  from public;
grant execute on function public.v3_public_reply_anonymous_integrity_case(uuid,text,text,text,text,bigint)
  to anon, authenticated, service_role;

-- Unexpected SQL dependents must block adoption rather than disappearing.
drop function public.reporter_reply_integrity_case_impl(uuid,text) restrict;
drop function public.public_reply_anonymous_integrity_case_impl(text,text,text) restrict;

do $postflight$
begin
  if to_regprocedure('public.reporter_reply_integrity_case_impl(uuid,text)') is not null
     or to_regprocedure('public.public_reply_anonymous_integrity_case_impl(text,text,text)') is not null
     or pg_get_functiondef(to_regprocedure('public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)'))
         like '%reporter_reply_integrity_case_impl(%'
     or pg_get_functiondef(to_regprocedure('public.v3_public_reply_anonymous_integrity_case(uuid,text,text,text,text,bigint)'))
         like '%public_reply_anonymous_integrity_case_impl(%' then
    raise exception 'A competing reporter reply implementation survived' using errcode='55000';
  end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
