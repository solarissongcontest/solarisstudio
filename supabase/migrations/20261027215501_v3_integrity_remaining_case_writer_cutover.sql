begin;

select public.v3_register_migration_contract(
  'v3.integrity.remaining-case-writer-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern reviewer recusal, internal notes, pre-clearance status effects and retention updates behind the canonical case revision/operation boundary'
);

alter function public.admin_recuse_from_integrity_case(uuid, text)
  rename to admin_recuse_from_integrity_case_impl;
alter function public.admin_add_integrity_case_note(uuid, text)
  rename to admin_add_integrity_case_note_impl;
alter function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[])
  rename to admin_record_integrity_preclearance_ruling_impl;
alter function public.admin_set_integrity_case_retention(uuid, timestamptz, text)
  rename to admin_set_integrity_case_retention_impl;

revoke all on function public.admin_recuse_from_integrity_case_impl(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_add_integrity_case_note_impl(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_record_integrity_preclearance_ruling_impl(uuid, text, text, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.admin_set_integrity_case_retention_impl(uuid, timestamptz, text)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_integrity_recuse_case_reviewer(
  p_case_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Provide a short recusal reason' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.recuse_reviewer', 'R3',
    jsonb_build_object('caseId', p_case_id, 'reason', btrim(p_reason), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.recuse_reviewer', true);
  perform set_config('app.integrity_rationale', btrim(p_reason), true);
  v_inner := public.admin_recuse_from_integrity_case_impl(p_case_id, p_reason);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

create or replace function public.studio2_integrity_add_case_note(
  p_case_id uuid,
  p_body text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.add_note', 'R2',
    jsonb_build_object('caseId', p_case_id, 'body', btrim(coalesce(p_body, '')), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.add_note', true);
  v_inner := public.admin_add_integrity_case_note_impl(p_case_id, p_body);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

create or replace function public.studio2_integrity_record_preclearance_ruling(
  p_case_id uuid,
  p_outcome text,
  p_summary text,
  p_rationale text,
  p_rule_ids text[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_rationale, ''))) < 20 then raise exception 'Pre-clearance rationale must be at least 20 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.preclearance', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'outcome', p_outcome, 'summary', btrim(coalesce(p_summary, '')),
      'rationale', btrim(coalesce(p_rationale, '')), 'ruleIds', to_jsonb(coalesce(p_rule_ids, '{}'::text[])),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.preclearance', true);
  perform set_config('app.integrity_rationale', btrim(p_rationale), true);
  v_inner := public.admin_record_integrity_preclearance_ruling_impl(p_case_id, p_outcome, p_summary, p_rationale, p_rule_ids);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

create or replace function public.studio2_integrity_set_case_retention(
  p_case_id uuid,
  p_retention_until timestamptz,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Retention reason must be at least 10 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.retention', 'R3',
    jsonb_build_object('caseId', p_case_id, 'retentionUntil', p_retention_until, 'reason', btrim(p_reason), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.retention', true);
  perform set_config('app.integrity_rationale', btrim(p_reason), true);
  v_inner := public.admin_set_integrity_case_retention_impl(p_case_id, p_retention_until, p_reason);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

revoke all on function public.studio2_integrity_recuse_case_reviewer(uuid, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_recuse_case_reviewer(uuid, text, uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_add_case_note(uuid, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_add_case_note(uuid, text, uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_record_preclearance_ruling(uuid, text, text, text, text[], uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_record_preclearance_ruling(uuid, text, text, text, text[], uuid, text, bigint) to authenticated, service_role;
revoke all on function public.studio2_integrity_set_case_retention(uuid, timestamptz, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_set_case_retention(uuid, timestamptz, text, uuid, text, bigint) to authenticated, service_role;

create or replace function public.admin_recuse_from_integrity_case(_case_id uuid, _reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_recuse_case_reviewer(_case_id, _reason, v_operation,
    encode(extensions.digest(convert_to('integrity-recuse-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version);
end $compat$;

create or replace function public.admin_add_integrity_case_note(_case_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_add_case_note(_case_id, _body, v_operation,
    encode(extensions.digest(convert_to('integrity-note-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version);
end $compat$;

create or replace function public.admin_record_integrity_preclearance_ruling(_case_id uuid, _outcome text, _summary text, _rationale text, _rule_ids text[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_record_preclearance_ruling(_case_id, _outcome, _summary, _rationale, _rule_ids, v_operation,
    encode(extensions.digest(convert_to('integrity-preclearance-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version);
end $compat$;

create or replace function public.admin_set_integrity_case_retention(_case_id uuid, _retention_until timestamptz, _reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_set_case_retention(_case_id, _retention_until, _reason, v_operation,
    encode(extensions.digest(convert_to('integrity-retention-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version);
end $compat$;

-- The older two-argument retention RPC is retained as a compatibility alias.
-- It delegates to the canonical retention command with an explicit legacy reason.
create or replace function public.admin_set_integrity_retention(_case_id uuid, _retention_until timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  return public.studio2_integrity_set_case_retention(_case_id, _retention_until, 'Legacy Organizer retention update', v_operation,
    encode(extensions.digest(convert_to('integrity-retention-legacy-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'), v_version);
end $compat$;

revoke all on function public.admin_recuse_from_integrity_case(uuid, text) from public, anon;
grant execute on function public.admin_recuse_from_integrity_case(uuid, text) to authenticated, service_role;
revoke all on function public.admin_add_integrity_case_note(uuid, text) from public, anon;
grant execute on function public.admin_add_integrity_case_note(uuid, text) to authenticated, service_role;
revoke all on function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[]) to authenticated, service_role;
revoke all on function public.admin_set_integrity_case_retention(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_set_integrity_case_retention(uuid, timestamptz, text) to authenticated, service_role;
revoke all on function public.admin_set_integrity_retention(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_integrity_retention(uuid, timestamptz) to authenticated, service_role;

comment on function public.admin_recuse_from_integrity_case(uuid, text) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_recuse_case_reviewer with stable operation identity and expected revision.';
comment on function public.admin_add_integrity_case_note(uuid, text) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_add_case_note with stable operation identity and expected revision.';
comment on function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[]) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_record_preclearance_ruling with stable operation identity and expected revision.';
comment on function public.admin_set_integrity_case_retention(uuid, timestamptz, text) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: Organizer uses studio2_integrity_set_case_retention with stable operation identity and expected revision.';
comment on function public.admin_set_integrity_retention(uuid, timestamptz) is 'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: remove with legacy Organizer retention caller.';

notify pgrst, 'reload schema';
commit;
