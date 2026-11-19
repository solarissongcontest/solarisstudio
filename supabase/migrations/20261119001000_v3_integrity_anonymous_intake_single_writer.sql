begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select public.v3_register_migration_contract(
  'v3.integrity.anonymous-intake-single-writer',1,'forward_fix_only',false,null,
  'Retire the duplicate mature anonymous intake physical writer inside the existing receipted V3 anonymous case creation, preserving confidentiality, recovery encryption, history and public access'
);
do $preflight$
declare v_def text; v_role text; v_impl oid;
begin
  v_impl:=to_regprocedure('public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text)');
  if v_impl is null or to_regprocedure('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)') is null then
    raise exception 'Expected current anonymous intake pair missing' using errcode='55000';
  end if;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    where p.oid=to_regprocedure('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)')
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres';
  if v_def is null or strpos(v_def,'public_create_anonymous_integrity_case_impl(')=0
     or strpos(v_def,'request_fingerprint')=0
     or strpos(v_def,'recovery_secret_ciphertext')=0
     or strpos(v_def,'app.integrity_operation_id')=0 then
    raise exception 'Unexpected canonical anonymous receipt/owner definition' using errcode='55000';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,v_impl,'EXECUTE') then
      raise exception 'Competing anonymous case writer exposed to %',v_role using errcode='55000';
    end if;
  end loop;
end $preflight$;

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
  v_code text;
  v_secret_raw text;
  v_secret_pretty text;
  v_hash text;
  v_priority text := 'standard';
  v_attempt integer := 0;
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
  -- The real validation, case-access token, reporter message and
  -- audit/event writes now belong to this single receipted V3 operation.
  v_category := lower(trim(coalesce(v_category, '')));
  v_case_kind := lower(trim(coalesce(v_case_kind, 'report')));
  v_summary := trim(coalesce(v_summary, ''));
  v_details := trim(coalesce(v_details, ''));
  v_observed_facts := nullif(trim(coalesce(v_observed_facts, '')), '');
  v_uncertainties := nullif(trim(coalesce(v_uncertainties, '')), '');
  v_edition_reference := nullif(trim(coalesce(v_edition_reference, '')), '');

  if v_category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then raise exception 'Invalid integrity report category'; end if;
  if v_case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then raise exception 'Invalid case kind'; end if;
  if char_length(v_summary) < 5 or char_length(v_summary) > 180 then raise exception 'Summary must be between 5 and 180 characters'; end if;
  if char_length(v_details) < 20 or char_length(v_details) > 12000 then raise exception 'Details must be between 20 and 12000 characters'; end if;
  if coalesce(array_length(v_related_countries, 1), 0) > 12 then raise exception 'Too many related countries'; end if;

  if v_category = 'safety' or v_case_kind = 'safety' then v_priority := 'urgent';
  elsif v_category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then v_priority := 'high';
  elsif v_case_kind = 'rule_question' then v_priority := 'information'; end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.integrity_cases where public_code = v_code);
    if v_attempt > 8 then raise exception 'Could not allocate anonymous case code'; end if;
  end loop;

  v_secret_raw := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_secret_pretty := regexp_replace(v_secret_raw, '(.{4})(?=.)', '\1-', 'g');
  v_hash := encode(extensions.digest(convert_to(v_secret_raw, 'UTF8'), 'sha256'), 'hex');

  insert into public.integrity_cases(
    public_code, case_kind, category, identity_mode, reporter_user_id,
    summary, details, observed_facts, uncertainties, related_countries,
    edition_reference, status, priority
  ) values (
    v_code, v_case_kind, v_category, 'anonymous', null,
    v_summary, v_details, v_observed_facts, v_uncertainties,
    coalesce(v_related_countries, '{}'), v_edition_reference, 'received', v_priority
  ) returning id into v_case_id;

  insert into public.integrity_case_access(case_id, recovery_secret_hash)
  values (v_case_id, v_hash);
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', v_details, null);
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'case.created', 'Anonymous case received', null);

  v_base_result := jsonb_build_object('ok', true, 'case_code', v_code, 'recovery_key', v_secret_pretty, 'status', 'received', 'priority', v_priority, 'created_at', now());

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

revoke all on function public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text) from public;
grant execute on function public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text) to anon,authenticated,service_role;
drop function public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text) restrict;
do $postflight$
declare v_def text;
begin
  if to_regprocedure('public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text)') is not null then
    raise exception 'Duplicate anonymous intake writer survived' using errcode='55000';
  end if;
  select pg_get_functiondef(to_regprocedure('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)')) into v_def;
  if strpos(v_def,'public_create_anonymous_integrity_case_impl(')>0
     or strpos(v_def,'public.integrity_cases')=0
     or strpos(v_def,'public.integrity_case_access')=0
     or strpos(v_def,'public.integrity_case_messages')=0
     or strpos(v_def,'public.integrity_case_events')=0
     or strpos(v_def,'extensions.pgp_sym_encrypt(')=0
     or strpos(v_def,'recovery_secret_ciphertext')=0 then
    raise exception 'Anonymous intake validation, privacy, recovery replay or physical effects lost' using errcode='55000';
  end if;
  if not has_function_privilege('anon','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE') then
    raise exception 'Canonical anonymous public entrypoint grant drift' using errcode='55000';
  end if;
end $postflight$;
notify pgrst,'reload schema';
commit;
