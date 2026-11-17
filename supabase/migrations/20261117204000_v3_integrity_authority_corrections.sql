begin;

select public.v3_register_migration_contract(
  'v3.integrity.authority-corrections',
  1,
  'forward_fix_only',
  false,
  null,
  'Align appeal operations with the existing R0-R3 receipt contract, preserve participant appeal availability during platform maintenance, and revoke raw event-table DML'
);

-- Integrity appeals are time-bounded participant/security submissions. Like
-- protected case intake, claiming a participant appeal receipt must not depend
-- on Organizer platform operating mode. Use the same actor-bound durable
-- receipt semantics directly rather than studio2_claim_operation.
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

  v_result := public.reporter_submit_integrity_appeal_impl(
    p_case_id, p_sanction_id, v_grounds
  ) || jsonb_build_object(
    'operation_id', v_operation,
    'receipt_id', v_operation
  );

  perform private.studio2_complete_operation(v_operation, v_result);
  return v_result || jsonb_build_object('ok', true, 'replayed', false);
end
$submit$;

revoke all on function public.v3_submit_integrity_appeal(uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.v3_submit_integrity_appeal(uuid, text, uuid, uuid, text) to authenticated, service_role;

-- The shared operation contract currently defines R0-R3. Appeal resolution is
-- a high-risk R3 governed operation; do not invent an unsupported R4 label.
create or replace function public.studio2_integrity_resolve_appeal(
  p_appeal_id uuid,
  p_outcome text,
  p_decision_rationale text,
  p_replacement_level integer,
  p_aggravating_factors text[],
  p_mitigating_factors text[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_claim jsonb;
  v_operation uuid;
  v_appeal public.integrity_case_appeals%rowtype;
  v_original public.integrity_case_sanctions%rowtype;
  v_replacement_id uuid;
  v_label text;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected appeal version are required' using errcode = '22023';
  end if;
  if p_outcome not in ('upheld','reduced','increased','overturned','rejected_ineligible') then
    raise exception 'Invalid appeal outcome' using errcode = '22023';
  end if;

  p_decision_rationale := btrim(coalesce(p_decision_rationale, ''));
  if char_length(p_decision_rationale) < 20 or char_length(p_decision_rationale) > 12000 then
    raise exception 'Appeal rationale must be between 20 and 12000 characters' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'integrity.appeal.resolve',
    'R3',
    jsonb_build_object(
      'appealId', p_appeal_id,
      'outcome', p_outcome,
      'decisionRationale', p_decision_rationale,
      'replacementLevel', p_replacement_level,
      'aggravatingFactors', to_jsonb(coalesce(p_aggravating_factors, '{}'::text[])),
      'mitigatingFactors', to_jsonb(coalesce(p_mitigating_factors, '{}'::text[])),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal
  from public.integrity_case_appeals
  where id = p_appeal_id
  for update;

  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then
    raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = '40001';
  end if;
  if v_appeal.status not in ('submitted','under_review') then
    raise exception 'Appeal has already been decided' using errcode = '23514';
  end if;
  if v_appeal.assigned_reviewer is null then
    raise exception 'Assign a fresh appeal reviewer before deciding the appeal' using errcode = '23514';
  end if;
  if v_appeal.assigned_reviewer <> auth.uid() then
    raise exception 'Only the assigned appeal reviewer may decide this appeal' using errcode = '42501';
  end if;

  select * into v_original
  from public.integrity_case_sanctions
  where id = v_appeal.sanction_id
  for update;
  if v_original.id is null then raise exception 'Appealed sanction not found' using errcode = 'P0002'; end if;

  if p_outcome in ('reduced','increased') then
    if p_replacement_level not between 1 and 10 then
      raise exception 'Replacement sanction level must be between 1 and 10' using errcode = '22023';
    end if;
    if p_outcome = 'reduced' and p_replacement_level >= v_original.final_level then
      raise exception 'A reduced appeal outcome must use a lower sanction level' using errcode = '23514';
    end if;
    if p_outcome = 'increased' and p_replacement_level <= v_original.final_level then
      raise exception 'An increased appeal outcome must use a higher sanction level' using errcode = '23514';
    end if;

    v_label := public.integrity_sanction_label(p_replacement_level);
    insert into public.integrity_case_sanctions(
      case_id, finding_id, typical_level, final_level, sanction_label,
      target_type, target_reference, aggravating_factors, mitigating_factors,
      rationale, status, supersedes_sanction_id, visible_to_reporter, created_by
    ) values (
      v_original.case_id,
      v_original.finding_id,
      v_original.final_level,
      p_replacement_level,
      v_label,
      v_original.target_type,
      v_original.target_reference,
      coalesce(p_aggravating_factors, '{}'),
      coalesce(p_mitigating_factors, '{}'),
      p_decision_rationale,
      'active',
      v_original.id,
      v_original.visible_to_reporter,
      auth.uid()
    ) returning id into v_replacement_id;

    update public.integrity_case_sanctions
    set status = 'modified_on_appeal'
    where id = v_original.id;
  elsif p_outcome = 'overturned' then
    update public.integrity_case_sanctions
    set status = 'overturned'
    where id = v_original.id;
  end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.resolve', true);
  perform set_config('app.integrity_rationale', p_decision_rationale, true);

  update public.integrity_case_appeals
  set status = p_outcome,
      decision_rationale = p_decision_rationale,
      replacement_sanction_id = v_replacement_id,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_appeal_id;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id;
  v_result := jsonb_build_object(
    'ok', true,
    'appeal_id', p_appeal_id,
    'outcome', p_outcome,
    'replacement_sanction_id', v_replacement_id,
    'version', v_appeal.version,
    'operation_id', v_operation
  );
  return private.studio2_complete_operation(v_operation, v_result);
end
$apply$;

revoke all on function public.studio2_integrity_resolve_appeal(
  uuid, text, text, integer, text[], text[], uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_integrity_resolve_appeal(
  uuid, text, text, integer, text[], text[], uuid, text, bigint
) to authenticated, service_role;

-- Domain events are append-only consequences of sanctioned commands/triggers,
-- not a service-role side channel into Integrity audit history.
revoke insert, update, delete, truncate on table public.integrity_case_events
  from anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
