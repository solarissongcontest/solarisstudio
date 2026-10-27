begin;

select public.v3_register_migration_contract(
  'v3.integrity.adjudication-writer-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Move remaining case priority, reporter-response, finding and sanction adjudication writes behind retry-safe CAS-governed commands'
);

-- Preserve mature domain validation as implementation primitives, but remove
-- their API authority. Canonical commands below own operation identity, CAS,
-- receipts and the changed-event provenance established by the preceding
-- Integrity authority migrations.
alter function public.admin_set_integrity_priority(uuid, text)
  rename to admin_set_integrity_priority_impl;
alter function public.admin_reply_integrity_case(uuid, text, boolean)
  rename to admin_reply_integrity_case_impl;
alter function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean)
  rename to admin_record_integrity_finding_impl;
alter function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean)
  rename to admin_record_integrity_sanction_impl;

revoke all on function public.admin_set_integrity_priority_impl(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_reply_integrity_case_impl(uuid, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_record_integrity_finding_impl(uuid, text, text, text, text[], boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_record_integrity_sanction_impl(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_integrity_set_case_priority(
  p_case_id uuid,
  p_priority text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.priority', 'R3',
    jsonb_build_object('caseId', p_case_id, 'priority', p_priority, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.priority', true);
  perform public.admin_set_integrity_priority_impl(p_case_id, p_priority);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'priority', v_case.priority, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_reply_case(
  p_case_id uuid,
  p_body text,
  p_request_response boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.reply', 'R3',
    jsonb_build_object('caseId', p_case_id, 'body', btrim(coalesce(p_body, '')), 'requestResponse', coalesce(p_request_response, true), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reply', true);
  perform public.admin_reply_integrity_case_impl(p_case_id, p_body, coalesce(p_request_response, true));

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'status', v_case.status, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_record_finding(
  p_case_id uuid,
  p_outcome text,
  p_summary text,
  p_rationale text,
  p_rule_ids text[],
  p_visible_to_reporter boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_inner jsonb;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.finding', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'outcome', p_outcome, 'summary', btrim(coalesce(p_summary, '')),
      'rationale', btrim(coalesce(p_rationale, '')), 'ruleIds', to_jsonb(coalesce(p_rule_ids, '{}'::text[])),
      'visibleToReporter', coalesce(p_visible_to_reporter, true), 'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.finding', true);
  perform set_config('app.integrity_rationale', btrim(coalesce(p_rationale, '')), true);
  v_inner := public.admin_record_integrity_finding_impl(
    p_case_id, p_outcome, p_summary, p_rationale, coalesce(p_rule_ids, '{}'::text[]), coalesce(p_visible_to_reporter, true)
  );

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_record_sanction(
  p_case_id uuid,
  p_finding_id uuid,
  p_typical_level integer,
  p_final_level integer,
  p_target_type text,
  p_target_reference text,
  p_aggravating_factors text[],
  p_mitigating_factors text[],
  p_rationale text,
  p_visible_to_reporter boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_inner jsonb;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.sanction', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'findingId', p_finding_id, 'typicalLevel', p_typical_level,
      'finalLevel', p_final_level, 'targetType', p_target_type, 'targetReference', nullif(btrim(coalesce(p_target_reference, '')), ''),
      'aggravatingFactors', to_jsonb(coalesce(p_aggravating_factors, '{}'::text[])),
      'mitigatingFactors', to_jsonb(coalesce(p_mitigating_factors, '{}'::text[])),
      'rationale', btrim(coalesce(p_rationale, '')), 'visibleToReporter', coalesce(p_visible_to_reporter, true),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.sanction', true);
  perform set_config('app.integrity_rationale', btrim(coalesce(p_rationale, '')), true);
  v_inner := public.admin_record_integrity_sanction_impl(
    p_case_id, p_finding_id, p_typical_level, p_final_level, p_target_type, p_target_reference,
    coalesce(p_aggravating_factors, '{}'::text[]), coalesce(p_mitigating_factors, '{}'::text[]),
    p_rationale, coalesce(p_visible_to_reporter, true)
  );

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

revoke all on function public.studio2_integrity_set_case_priority(uuid, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_set_case_priority(uuid, text, uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_reply_case(uuid, text, boolean, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_reply_case(uuid, text, boolean, uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_record_finding(uuid, text, text, text, text[], boolean, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_record_finding(uuid, text, text, text, text[], boolean, uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_record_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_record_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean, uuid, text, bigint) to authenticated, service_role;

-- Compatibility shims retain the existing UI contract but no longer own state
-- mutation. They delegate to the governed command boundary using a fresh
-- operation identity and the row's current revision. Sunset after Organizer
-- callers send stable operation/idempotency identity and expected revisions.
create or replace function public.admin_set_integrity_priority(_case_id uuid, _priority text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_set_case_priority(
    _case_id, _priority, v_operation,
    encode(extensions.digest(convert_to('integrity-priority-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version
  );
end $compat$;

create or replace function public.admin_reply_integrity_case(_case_id uuid, _body text, _request_response boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_reply_case(
    _case_id, _body, _request_response, v_operation,
    encode(extensions.digest(convert_to('integrity-reply-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version
  );
end $compat$;

create or replace function public.admin_record_integrity_finding(_case_id uuid, _outcome text, _summary text, _rationale text, _rule_ids text[] default '{}', _visible_to_reporter boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_record_finding(
    _case_id, _outcome, _summary, _rationale, _rule_ids, _visible_to_reporter,
    v_operation, encode(extensions.digest(convert_to('integrity-finding-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version
  );
end $compat$;

create or replace function public.admin_record_integrity_sanction(
  _case_id uuid, _finding_id uuid, _typical_level integer, _final_level integer,
  _target_type text, _target_reference text, _aggravating_factors text[] default '{}',
  _mitigating_factors text[] default '{}', _rationale text default '', _visible_to_reporter boolean default true
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_record_sanction(
    _case_id, _finding_id, _typical_level, _final_level, _target_type, _target_reference,
    _aggravating_factors, _mitigating_factors, _rationale, _visible_to_reporter,
    v_operation, encode(extensions.digest(convert_to('integrity-sanction-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version
  );
end $compat$;

revoke all on function public.admin_set_integrity_priority(uuid, text) from public, anon;
grant execute on function public.admin_set_integrity_priority(uuid, text) to authenticated, service_role;
revoke all on function public.admin_reply_integrity_case(uuid, text, boolean) from public, anon;
grant execute on function public.admin_reply_integrity_case(uuid, text, boolean) to authenticated, service_role;
revoke all on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) from public, anon;
grant execute on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) to authenticated, service_role;
revoke all on function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean) from public, anon;
grant execute on function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean) to authenticated, service_role;

comment on function public.admin_set_integrity_priority(uuid, text) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_set_case_priority with stable operation identity and expected revision.';
comment on function public.admin_reply_integrity_case(uuid, text, boolean) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_reply_case with stable operation identity and expected revision.';
comment on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_record_finding with stable operation identity and expected revision.';
comment on function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_record_sanction with stable operation identity and expected revision.';

notify pgrst, 'reload schema';
commit;
