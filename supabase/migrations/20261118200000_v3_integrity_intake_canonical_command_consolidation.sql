begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- P04: the V3 create_* _impl functions are not independent physical writers:
-- they are transaction/receipt authorities trapped behind duplicate V3 RPC
-- wrappers. Move those exact validated implementations into the existing public
-- canonical entrypoints (same OID, signature and authorized grants), then
-- retire two redundant security-definer callable functions with RESTRICT.
-- The mature original case-creation primitives remain role-denied and carry
-- validation, privacy, history and recovery-secret semantics. Do not alter
-- historical migration files or expose a new entrypoint.
do $preflight$
declare
  v record;
  v_public text;
  v_impl text;
  v_original text;
begin
  for v_public,v_impl,v_original in
    select * from (values
      ('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)',
       'public.v3_public_create_anonymous_integrity_case_impl(uuid,text,text,text,text,text,text,text[],text,text)',
       'public.public_create_anonymous_integrity_case_impl('),
      ('public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)',
       'public.v3_create_protected_integrity_case_impl(uuid,text,text,text,text,text,text,text,text,text[],text)',
       'public.create_protected_integrity_case_impl(')
    ) as expected(command,implementation,validated_original)
  loop
    select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
           pg_get_functiondef(p.oid) as definition
    into v from pg_proc p where p.oid=to_regprocedure(v_public);
    if v.oid is null or v.owner <> 'postgres' or not v.prosecdef
       or strpos(v.definition, split_part(v_impl, '(', 1) || '(')=0 then
      raise exception 'Intake canonical wrapper changed before consolidation: %',v_public using errcode='55000';
    end if;
    select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
           pg_get_functiondef(p.oid) as definition
    into v from pg_proc p where p.oid=to_regprocedure(v_impl);
    if v.oid is null or v.owner <> 'postgres' or not v.prosecdef
       or strpos(v.definition,v_original)=0
       or strpos(v.definition,'idempotency')=0 then
      raise exception 'Intake verified implementation changed before consolidation: %',v_impl using errcode='55000';
    end if;
    if has_function_privilege('anon',v_impl,'EXECUTE')
       or has_function_privilege('authenticated',v_impl,'EXECUTE')
       or has_function_privilege('service_role',v_impl,'EXECUTE') then
      raise exception 'Internal V3 implementation directly accessible: %',v_impl using errcode='55000';
    end if;
  end loop;
end
$preflight$;

select public.v3_register_migration_contract(
  'v3.integrity.intake-canonical-command-consolidation',1,'forward_fix_only',false,null,
  'Fold V3 participant intake receipt/idempotency implementation into its canonical API owner; retire two redundant security-definer writer entrypoints without changing validated case creation, grants or history'
);

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
set search_path = pg_catalog, public, private, extensions
as $create_anonymous$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_replay_cipher_key text;
  v_fingerprint text;
  v_operation private.v3_anonymous_integrity_case_operations%rowtype;
  v_base_result jsonb;
  v_result jsonb;
  v_case_id uuid;
  v_recovery_secret text;
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_case_kind text := lower(btrim(coalesce(p_case_kind, 'report')));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_observed_facts text := nullif(btrim(coalesce(p_observed_facts, '')), '');
  v_uncertainties text := nullif(btrim(coalesce(p_uncertainties, '')), '');
  v_edition_reference text := nullif(btrim(coalesce(p_edition_reference, '')), '');
  v_related_countries text[];
begin
  -- The outer RPC is now the single operation authority. Preserve the old
  -- wrapper's exact transactional operation/event context before mutations.
  if p_operation_id is null then
    raise exception 'Operation id is required' using errcode = '22023';
  end if;
  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.create.anonymous', true);
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(array_agg(country order by country), '{}'::text[])
  into v_related_countries
  from unnest(coalesce(p_related_countries, '{}'::text[])) country;

  v_key_hash := encode(
    extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'),
    'hex'
  );
  v_replay_cipher_key := encode(
    extensions.digest(
      convert_to('integrity-case-replay:v1:' || v_key, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.anonymous',
    'R2',
    jsonb_build_object('identityMode', 'anonymous'),
    jsonb_build_object(
      'caseKind', v_case_kind,
      'category', v_category,
      'summary', v_summary,
      'details', v_details,
      'observedFacts', v_observed_facts,
      'uncertainties', v_uncertainties,
      'relatedCountries', to_jsonb(v_related_countries),
      'editionReference', v_edition_reference
    )
  );

  insert into private.v3_anonymous_integrity_case_operations (
    idempotency_key_hash,
    operation_id,
    request_fingerprint
  ) values (
    v_key_hash,
    p_operation_id,
    v_fingerprint
  )
  on conflict do nothing;

  select operation_row.*
  into v_operation
  from private.v3_anonymous_integrity_case_operations operation_row
  where operation_row.idempotency_key_hash = v_key_hash
  for update;

  if v_operation.operation_id is null
     or v_operation.operation_id is distinct from p_operation_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Retry the original report with its original submission identity, or create a new identity after editing.';
  end if;

  if v_operation.completed_at is not null then
    if v_operation.case_id is null
       or v_operation.result is null
       or v_operation.recovery_secret_ciphertext is null then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;

    begin
      v_recovery_secret := extensions.pgp_sym_decrypt(
        v_operation.recovery_secret_ciphertext,
        v_replay_cipher_key
      );
    exception when others then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end;

    return v_operation.result || jsonb_build_object(
      'ok', true,
      'operation_id', v_operation.operation_id,
      'recovery_key', v_recovery_secret,
      'replayed', true
    );
  end if;

  -- Mature primitive remains the validation/case-creation authority. Because it
  -- executes inside this transaction, a wrapper failure rolls back both case
  -- creation and replay-ledger state together.
  v_base_result := public.public_create_anonymous_integrity_case_impl(
    v_category,
    v_summary,
    v_details,
    v_observed_facts,
    v_uncertainties,
    v_related_countries,
    v_edition_reference,
    v_case_kind
  );

  if coalesce((v_base_result ->> 'ok')::boolean, false) is not true
     or nullif(v_base_result ->> 'case_code', '') is null
     or nullif(v_base_result ->> 'recovery_key', '') is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  select integrity_case.id
  into v_case_id
  from public.integrity_cases integrity_case
  where integrity_case.public_code = v_base_result ->> 'case_code';

  if v_case_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_recovery_secret := v_base_result ->> 'recovery_key';
  v_result := (v_base_result - 'recovery_key') || jsonb_build_object(
    'case_id', v_case_id,
    'operation_id', p_operation_id
  );

  update private.v3_anonymous_integrity_case_operations
  set
    case_id = v_case_id,
    recovery_secret_ciphertext = extensions.pgp_sym_encrypt(
      v_recovery_secret,
      v_replay_cipher_key,
      'cipher-algo=aes256'
    ),
    result = v_result,
    completed_at = now(),
    updated_at = now()
  where idempotency_key_hash = v_key_hash;

  return v_result || jsonb_build_object(
    'ok', true,
    'recovery_key', v_recovery_secret,
    'replayed', false
  );
end
$create_anonymous$;

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
set search_path = pg_catalog, public, private, extensions, auth
as $create_protected$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_identity_mode text := lower(btrim(coalesce(p_identity_mode, '')));
  v_case_kind text := lower(btrim(coalesce(p_case_kind, 'report')));
  v_category text := lower(btrim(coalesce(p_category, 'other')));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_observed_facts text := nullif(btrim(coalesce(p_observed_facts, '')), '');
  v_uncertainties text := nullif(btrim(coalesce(p_uncertainties, '')), '');
  v_edition_reference text := nullif(btrim(coalesce(p_edition_reference, '')), '');
  v_related_countries text[];
  v_scope jsonb;
  v_semantic_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_canonical_operation_id uuid;
  v_base_result jsonb;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  -- The outer RPC is now the single operation authority. Preserve the old
  -- wrapper's exact transactional operation/event context before mutations.
  if p_operation_id is null then
    raise exception 'Operation id is required' using errcode = '22023';
  end if;
  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.create.protected', true);
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(array_agg(country order by country), '{}'::text[])
  into v_related_countries
  from unnest(coalesce(p_related_countries, '{}'::text[])) country;

  v_scope := jsonb_build_object('identityMode', v_identity_mode);
  v_semantic_request := jsonb_build_object(
    'caseKind', v_case_kind,
    'category', v_category,
    'summary', v_summary,
    'details', v_details,
    'observedFacts', v_observed_facts,
    'uncertainties', v_uncertainties,
    'relatedCountries', to_jsonb(v_related_countries),
    'editionReference', v_edition_reference
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.protected',
    'R2',
    v_scope,
    v_semantic_request
  );

  -- Integrity intake is an end-user reporting/security surface, not an
  -- Organizer control mutation. Preserve that availability boundary while
  -- still using the canonical receipt schema and actor-bound exact-once key.
  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope
  ) values (
    p_operation_id,
    v_actor,
    v_key,
    p_operation_id,
    v_fingerprint,
    'integrity.case.create.protected',
    'R2',
    v_scope
  )
  on conflict do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = 'integrity.case.create.protected'
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.case.create.protected'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Retry the original report with its original submission identity, or create a new identity after editing.';
  end if;

  v_canonical_operation_id := v_receipt.operation_id;

  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'operation_id', v_canonical_operation_id,
      'receipt_id', v_canonical_operation_id,
      'replayed', true
    );
  end if;

  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  v_base_result := public.create_protected_integrity_case_impl(
    v_identity_mode,
    v_case_kind,
    v_category,
    v_summary,
    v_details,
    v_observed_facts,
    v_uncertainties,
    v_related_countries,
    v_edition_reference
  );

  if coalesce((v_base_result ->> 'ok')::boolean, false) is not true
     or nullif(v_base_result ->> 'case_id', '') is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  select integrity_case.*
  into v_case
  from public.integrity_cases integrity_case
  where integrity_case.id = (v_base_result ->> 'case_id')::uuid
    and integrity_case.reporter_user_id = v_actor;

  if v_case.id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_result := v_base_result || jsonb_build_object(
    'status', v_case.status,
    'priority', v_case.priority,
    'created_at', v_case.created_at
  );

  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  return v_result || jsonb_build_object(
    'ok', true,
    'operation_id', v_canonical_operation_id,
    'receipt_id', v_canonical_operation_id,
    'replayed', false
  );
end
$create_protected$;

-- Preserve exact original public RPC security contract after the
-- implementation is directly owned by each canonical command.
revoke all on function public.v3_public_create_anonymous_integrity_case(
  uuid,text,text,text,text,text,text,text[],text,text
) from public,anon,authenticated,service_role;
grant execute on function public.v3_public_create_anonymous_integrity_case(
  uuid,text,text,text,text,text,text,text[],text,text
) to anon,authenticated,service_role;
revoke all on function public.v3_create_protected_integrity_case(
  uuid,text,text,text,text,text,text,text,text,text[],text
) from public,anon,authenticated,service_role;
grant execute on function public.v3_create_protected_integrity_case(
  uuid,text,text,text,text,text,text,text,text,text[],text
) to authenticated,service_role;

-- RESTRICT fails closed if an unreviewed SQL dependency still calls the old
-- implementation (including external caller dependencies visible in catalog).
drop function public.v3_public_create_anonymous_integrity_case_impl(
  uuid,text,text,text,text,text,text,text[],text,text
) restrict;
drop function public.v3_create_protected_integrity_case_impl(
  uuid,text,text,text,text,text,text,text,text,text[],text
) restrict;

do $postflight$
declare
  v record;
  v_name text;
  v_original text;
  v_legacy_v3 text;
  v_role text;
begin
  for v_name,v_original,v_legacy_v3 in select * from (values
    ('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)',
      'public.public_create_anonymous_integrity_case_impl(',
      'public.v3_public_create_anonymous_integrity_case_impl('),
    ('public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)',
      'public.create_protected_integrity_case_impl(',
      'public.v3_create_protected_integrity_case_impl(')
  ) expected(name,original,old_impl)
  loop
    select p.oid, p.prosecdef, pg_get_userbyid(p.proowner) as owner,
           pg_get_functiondef(p.oid) as definition,
           coalesce(array_to_string(p.proconfig,','),'') as settings
    into v from pg_proc p where p.oid=to_regprocedure(v_name);
    if v.oid is null or v.owner <> 'postgres' or not v.prosecdef
       or strpos(v.settings,'search_path=pg_catalog')=0
       or strpos(v.definition,v_original)=0
       or strpos(v.definition,v_legacy_v3)>0
       or strpos(v.definition,'private.studio2_complete_operation(')=0
           and strpos(v.definition,'private.v3_anonymous_integrity_case_operations')=0
       or strpos(v.definition,'app.integrity_operation_id')=0 then
      raise exception 'Canonical participant intake did not preserve transaction/receipt authority: %',v_name using errcode='55000';
    end if;
  end loop;
  if to_regprocedure('public.v3_public_create_anonymous_integrity_case_impl(uuid,text,text,text,text,text,text,text[],text,text)') is not null
    or to_regprocedure('public.v3_create_protected_integrity_case_impl(uuid,text,text,text,text,text,text,text,text,text[],text)') is not null
  then raise exception 'Duplicate V3 internal intake writer survived retirement' using errcode='55000'; end if;
  if not has_function_privilege('anon',
      'public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE')
    or has_function_privilege('anon',
      'public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)','EXECUTE')
    or not has_function_privilege('authenticated',
      'public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)','EXECUTE')
    or exists (
      select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=to_regprocedure(
        'public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)')
        and acl.grantee=0 and acl.privilege_type='EXECUTE'
    )
  then raise exception 'Participant intake public role authority changed' using errcode='55000'; end if;
end
$postflight$;
notify pgrst, 'reload schema';
commit;
