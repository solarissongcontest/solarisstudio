begin;

select public.v3_register_migration_contract(
  'v3.integrity.intake-event-provenance',
  1,
  'forward_fix_only',
  false,
  null,
  'Bind case creation and appeal submission to stable operation identity while retaining narrow legacy compatibility shims'
);

-- Preserve the mature validation/writer primitives as internal implementations.
alter function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text)
  rename to public_create_anonymous_integrity_case_impl;
alter function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text)
  rename to create_protected_integrity_case_impl;

create or replace function public.public_create_anonymous_integrity_case(
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null,
  _case_kind text default 'report'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare
  v_operation uuid;
begin
  begin
    v_operation := nullif(current_setting('app.integrity_operation_id', true), '')::uuid;
  exception when others then
    v_operation := null;
  end;
  if v_operation is null then
    v_operation := extensions.gen_random_uuid();
    perform set_config('app.integrity_operation_id', v_operation::text, true);
    perform set_config('app.integrity_command', 'integrity.case.create.anonymous.compatibility', true);
  end if;

  return public.public_create_anonymous_integrity_case_impl(
    _category, _summary, _details, _observed_facts, _uncertainties,
    _related_countries, _edition_reference, _case_kind
  );
end
$compat$;

revoke all on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) from public;
grant execute on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) to anon, authenticated, service_role;

create or replace function public.create_protected_integrity_case(
  _identity_mode text,
  _case_kind text,
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare
  v_operation uuid;
begin
  begin
    v_operation := nullif(current_setting('app.integrity_operation_id', true), '')::uuid;
  exception when others then
    v_operation := null;
  end;
  if v_operation is null then
    v_operation := extensions.gen_random_uuid();
    perform set_config('app.integrity_operation_id', v_operation::text, true);
    perform set_config('app.integrity_command', 'integrity.case.create.protected.compatibility', true);
  end if;

  return public.create_protected_integrity_case_impl(
    _identity_mode, _case_kind, _category, _summary, _details,
    _observed_facts, _uncertainties, _related_countries, _edition_reference
  );
end
$compat$;

revoke all on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) to authenticated, service_role;

-- Wrap the retry-safe V3 case intake so the operation receipt and canonical
-- case_changed event carry the same operation identity.
alter function public.v3_public_create_anonymous_integrity_case(uuid, text, text, text, text, text, text, text[], text, text)
  rename to v3_public_create_anonymous_integrity_case_impl;

create or replace function public.v3_public_create_anonymous_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_category text,
  p_summary text,
  p_details text,
  p_observed_facts text default null,
  p_uncertainties text default null,
  p_related_countries text[] default '{}',
  p_edition_reference text default null,
  p_case_kind text default 'report'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $wrapper$
begin
  if p_operation_id is null then raise exception 'Operation id is required' using errcode = '22023'; end if;
  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.create.anonymous', true);
  return public.v3_public_create_anonymous_integrity_case_impl(
    p_operation_id, p_idempotency_key, p_category, p_summary, p_details,
    p_observed_facts, p_uncertainties, p_related_countries, p_edition_reference, p_case_kind
  );
end
$wrapper$;

revoke all on function public.v3_public_create_anonymous_integrity_case(uuid, text, text, text, text, text, text, text[], text, text) from public;
grant execute on function public.v3_public_create_anonymous_integrity_case(uuid, text, text, text, text, text, text, text[], text, text) to anon, authenticated, service_role;

alter function public.v3_create_protected_integrity_case(uuid, text, text, text, text, text, text, text, text, text[], text)
  rename to v3_create_protected_integrity_case_impl;

create or replace function public.v3_create_protected_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_identity_mode text,
  p_case_kind text,
  p_category text,
  p_summary text,
  p_details text,
  p_observed_facts text default null,
  p_uncertainties text default null,
  p_related_countries text[] default '{}',
  p_edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $wrapper$
begin
  if p_operation_id is null then raise exception 'Operation id is required' using errcode = '22023'; end if;
  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.create.protected', true);
  return public.v3_create_protected_integrity_case_impl(
    p_operation_id, p_idempotency_key, p_identity_mode, p_case_kind, p_category,
    p_summary, p_details, p_observed_facts, p_uncertainties, p_related_countries, p_edition_reference
  );
end
$wrapper$;

revoke all on function public.v3_create_protected_integrity_case(uuid, text, text, text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.v3_create_protected_integrity_case(uuid, text, text, text, text, text, text, text, text, text[], text) to authenticated, service_role;

-- Appeal submission implementations are renamed so both V3 and legacy callers
-- share one validation path instead of competing writers.
alter function public.reporter_submit_integrity_appeal(uuid, uuid, text)
  rename to reporter_submit_integrity_appeal_impl;
alter function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text)
  rename to public_submit_anonymous_integrity_appeal_impl;

create table if not exists private.v3_anonymous_integrity_appeal_operations (
  idempotency_key_hash text primary key,
  operation_id uuid not null unique,
  request_fingerprint text not null,
  result jsonb null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint v3_anonymous_integrity_appeal_key_hash_check check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint v3_anonymous_integrity_appeal_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$')
);
revoke all on table private.v3_anonymous_integrity_appeal_operations from public, anon, authenticated;
grant all on table private.v3_anonymous_integrity_appeal_operations to service_role;

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
  v_claim jsonb;
  v_operation uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'Operation id is required' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.appeal.submit.protected', 'R3',
    jsonb_build_object('caseId', p_case_id, 'sanctionId', p_sanction_id, 'grounds', btrim(coalesce(p_grounds, '')))
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.submit.protected', true);
  v_result := public.reporter_submit_integrity_appeal_impl(p_case_id, p_sanction_id, p_grounds)
    || jsonb_build_object('operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$submit$;

revoke all on function public.v3_submit_integrity_appeal(uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.v3_submit_integrity_appeal(uuid, text, uuid, uuid, text) to authenticated, service_role;

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
  if v_row.completed_at is not null then
    return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.submit.anonymous', true);
  v_result := public.public_submit_anonymous_integrity_appeal_impl(
    p_case_code, p_recovery_key, p_sanction_id, p_grounds
  ) || jsonb_build_object('operation_id', p_operation_id, 'replayed', false);

  update private.v3_anonymous_integrity_appeal_operations
  set result = v_result, completed_at = now()
  where idempotency_key_hash = v_key_hash;
  return v_result;
end
$submit$;

revoke all on function public.v3_public_submit_anonymous_integrity_appeal(uuid, text, text, text, uuid, text) from public;
grant execute on function public.v3_public_submit_anonymous_integrity_appeal(uuid, text, text, text, uuid, text) to anon, authenticated, service_role;

-- Narrow compatibility paths for existing participant UI. They no longer own
-- validation or canonical state mutation; both delegate to the V3 submission
-- authority. Sunset after participant callers carry stable retry identity.
create or replace function public.reporter_submit_integrity_appeal(_case_id uuid, _sanction_id uuid, _grounds text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid();
begin
  return public.v3_submit_integrity_appeal(
    v_operation,
    encode(extensions.digest(convert_to('integrity-appeal-protected-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    _case_id, _sanction_id, _grounds
  );
end
$compat$;

revoke all on function public.reporter_submit_integrity_appeal(uuid, uuid, text) from public, anon;
grant execute on function public.reporter_submit_integrity_appeal(uuid, uuid, text) to authenticated, service_role;

create or replace function public.public_submit_anonymous_integrity_appeal(_case_code text, _recovery_key text, _sanction_id uuid, _grounds text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid();
begin
  return public.v3_public_submit_anonymous_integrity_appeal(
    v_operation,
    encode(extensions.digest(convert_to('integrity-appeal-anonymous-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    _case_code, _recovery_key, _sanction_id, _grounds
  );
end
$compat$;

revoke all on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) from public;
grant execute on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) to anon, authenticated, service_role;

comment on function public.reporter_submit_integrity_appeal(uuid, uuid, text) is
  'Temporary participant compatibility shim; canonical submission authority is v3_submit_integrity_appeal.';
comment on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) is
  'Temporary anonymous compatibility shim; canonical submission authority is v3_public_submit_anonymous_integrity_appeal.';

notify pgrst, 'reload schema';
commit;
