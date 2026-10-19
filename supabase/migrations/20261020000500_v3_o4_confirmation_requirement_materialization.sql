begin;

select public.v3_register_migration_contract(
  'v3.o4.confirmation-requirement-materialization',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-impact preview plus version-bound, idempotent and receipted Confirmation requirement materialization while preserving the existing serialized requirement generator.'
);

create or replace function private.studio2_confirmation_requirement_materialization_state(
  p_edition_id uuid,
  p_country_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $state$
declare
  v_country_count integer;
  v_requested_count integer := cardinality(coalesce(p_country_ids, '{}'::uuid[]));
  v_requested_ids uuid[];
  v_targets jsonb := '[]'::jsonb;
  v_create_targets jsonb := '[]'::jsonb;
  v_state jsonb;
  v_fingerprint text;
begin
  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Valid edition id is required' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_country_count
  from public.countries;

  if p_country_ids is not null and v_requested_count > v_country_count then
    raise exception 'Confirmation requirement batch exceeds the canonical country universe'
      using errcode = '22023';
  end if;

  if p_country_ids is not null then
    select coalesce(array_agg(distinct requested_id order by requested_id), '{}'::uuid[])
    into v_requested_ids
    from unnest(coalesce(p_country_ids, '{}'::uuid[])) requested_id;

    if exists (
      select 1
      from unnest(v_requested_ids) requested_id
      left join public.countries country on country.id = requested_id
      where country.id is null
    ) then
      raise exception 'Confirmation requirement batch contains an unknown country'
        using errcode = '22023';
    end if;
  else
    v_requested_ids := null;
  end if;

  with target_countries as (
    select distinct account.country_id
    from public.country_accounts account
    where p_country_ids is null
      and account.status = 'active'
      and account.country_id is not null

    union

    select requested_id
    from unnest(coalesce(v_requested_ids, '{}'::uuid[])) requested_id
    where p_country_ids is not null
  ),
  target_state as (
    select
      country.id as country_id,
      country.name as country_name,
      country.short_code as country_code,
      requirement.id as requirement_id,
      requirement.generation,
      requirement.status,
      requirement.updated_at,
      requirement.id is null as will_create
    from target_countries target
    join public.countries country on country.id = target.country_id
    left join public.studio2_confirmation_requirements requirement
      on requirement.edition_id = p_edition_id
     and requirement.country_id = target.country_id
     and requirement.superseded_at is null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'countryId', state.country_id,
        'countryName', state.country_name,
        'countryCode', state.country_code,
        'currentRequirementId', state.requirement_id,
        'currentGeneration', state.generation,
        'currentStatus', state.status,
        'currentUpdatedAt', state.updated_at,
        'willCreate', state.will_create
      )
      order by lower(state.country_name), state.country_id
    ),
    '[]'::jsonb
  )
  into v_targets
  from target_state state;

  select coalesce(jsonb_agg(target.value order by target.ordinality), '[]'::jsonb)
  into v_create_targets
  from jsonb_array_elements(v_targets) with ordinality as target(value, ordinality)
  where coalesce((target.value ->> 'willCreate')::boolean, false);

  v_state := jsonb_build_object(
    'editionId', p_edition_id,
    'targetMode', case when p_country_ids is null then 'all_active' else 'explicit' end,
    'requestedCountryIds', case
      when p_country_ids is null then null
      else to_jsonb(v_requested_ids)
    end,
    'targetReason', 'Edition confirmation required by TSBC',
    'targetGeneration', 1,
    'targetCount', jsonb_array_length(v_targets),
    'createCount', jsonb_array_length(v_create_targets),
    'targets', v_targets,
    'createTargets', v_create_targets
  );

  v_fingerprint := encode(
    extensions.digest(
      convert_to(v_state::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return v_state || jsonb_build_object('impactFingerprint', v_fingerprint);
end
$state$;

revoke all on function private.studio2_confirmation_requirement_materialization_state(uuid, uuid[])
  from public, anon, authenticated;

create or replace function public.admin_confirmation_requirement_materialization_preview(
  p_edition_id uuid,
  p_country_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_preview jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.solaris_confirmation_admin_allowed()
     or not public.studio2_access_allowed('delegation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  v_preview := private.studio2_confirmation_requirement_materialization_state(
    p_edition_id,
    p_country_ids
  );

  return v_preview || jsonb_build_object('serverTime', now());
end
$preview$;

revoke all on function public.admin_confirmation_requirement_materialization_preview(uuid, uuid[])
  from public, anon;
grant execute on function public.admin_confirmation_requirement_materialization_preview(uuid, uuid[])
  to authenticated, service_role;

create or replace function public.admin_confirmation_apply_requirement_materialization(
  p_edition_id uuid,
  p_country_ids uuid[],
  p_expected_fingerprint text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_input_state jsonb;
  v_preview jsonb;
  v_resulting_preview jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_target_ids uuid[] := '{}'::uuid[];
  v_legacy_result jsonb;
  v_created_requirements jsonb := '[]'::jsonb;
  v_result jsonb;
  v_failure jsonb;
  v_expected_fingerprint text := lower(nullif(btrim(coalesce(p_expected_fingerprint, '')), ''));
  v_actual_fingerprint text;
  v_create_count integer;
  v_created_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.solaris_confirmation_admin_allowed()
     or not public.studio2_access_allowed('delegation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if v_expected_fingerprint is null
     or v_expected_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid reviewed impact fingerprint is required'
      using errcode = '22023';
  end if;

  -- Validate and normalize the caller's target set before the semantic operation
  -- is claimed. The state itself is re-read under the edition lock below.
  v_input_state := private.studio2_confirmation_requirement_materialization_state(
    p_edition_id,
    p_country_ids
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_correlation_id,
    'confirmation.requirement.materialize',
    'R2',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'targetMode', v_input_state ->> 'targetMode',
      'requestedCountryIds', v_input_state -> 'requestedCountryIds',
      'expectedFingerprint', v_expected_fingerprint
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded'
       and jsonb_typeof(v_claim -> 'result') = 'object' then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'reconciliationRequired', true,
      'serverTime', now()
    );
  end if;

  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-requirements:' || p_edition_id::text, 0)
  );

  -- Recompute the exact impact after the same lock used by the legacy canonical
  -- generator has been acquired. Apply only the target set that was reviewed.
  v_preview := private.studio2_confirmation_requirement_materialization_state(
    p_edition_id,
    p_country_ids
  );
  v_actual_fingerprint := v_preview ->> 'impactFingerprint';

  if v_actual_fingerprint is distinct from v_expected_fingerprint then
    v_failure := private.studio2_fail_operation(
      v_operation_id,
      'VERSION_CONFLICT',
      jsonb_build_object(
        'expectedFingerprint', v_expected_fingerprint,
        'actualFingerprint', v_actual_fingerprint,
        'targetCount', coalesce((v_preview ->> 'targetCount')::integer, 0),
        'createCount', coalesce((v_preview ->> 'createCount')::integer, 0)
      )
    );

    return jsonb_build_object(
      'ok', false,
      'replayed', false,
      'operationId', v_operation_id,
      'status', 'failed',
      'error', jsonb_build_object(
        'code', 'VERSION_CONFLICT',
        'metadata', coalesce(v_failure -> 'error' -> 'metadata', '{}'::jsonb)
      ),
      'reconciliationRequired', false,
      'currentPreview', v_preview,
      'serverTime', now()
    );
  end if;

  select coalesce(array_agg((target.value ->> 'countryId')::uuid order by target.ordinality), '{}'::uuid[])
  into v_target_ids
  from jsonb_array_elements(v_preview -> 'targets') with ordinality as target(value, ordinality);

  v_create_count := coalesce((v_preview ->> 'createCount')::integer, 0);

  -- Keep the existing generator as the one canonical writer. The nested block
  -- gives us a subtransaction: if a compatibility race violates the reviewed
  -- impact, its writes are rolled back while the outer operation receipt can be
  -- durably failed and reconciled.
  begin
    v_legacy_result := public.admin_confirmation_ensure_requirements(
      p_edition_id,
      v_target_ids
    );
    v_created_count := coalesce((v_legacy_result ->> 'created')::integer, 0);

    if v_created_count is distinct from v_create_count then
      raise exception 'Confirmation requirement impact changed during apply'
        using errcode = '40001';
    end if;

    perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  exception
    when unique_violation or serialization_failure then
      v_failure := private.studio2_fail_operation(
        v_operation_id,
        'VERSION_CONFLICT',
        jsonb_build_object(
          'expectedFingerprint', v_expected_fingerprint,
          'actualFingerprint', private.studio2_confirmation_requirement_materialization_state(
            p_edition_id,
            p_country_ids
          ) ->> 'impactFingerprint'
        )
      );

      return jsonb_build_object(
        'ok', false,
        'replayed', false,
        'operationId', v_operation_id,
        'status', 'failed',
        'error', jsonb_build_object('code', 'VERSION_CONFLICT'),
        'reconciliationRequired', false,
        'serverTime', now()
      );
    when others then
      v_failure := private.studio2_fail_operation(
        v_operation_id,
        'DATABASE',
        jsonb_build_object('sqlstate', sqlstate)
      );

      return jsonb_build_object(
        'ok', false,
        'replayed', false,
        'operationId', v_operation_id,
        'status', 'failed',
        'error', jsonb_build_object('code', 'DATABASE'),
        'reconciliationRequired', false,
        'serverTime', now()
      );
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', requirement.id,
        'countryId', country.id,
        'countryName', country.name,
        'countryCode', country.short_code,
        'generation', requirement.generation,
        'status', requirement.status
      )
      order by lower(country.name), country.id
    ),
    '[]'::jsonb
  )
  into v_created_requirements
  from jsonb_array_elements(v_preview -> 'createTargets') target
  join public.countries country on country.id = (target ->> 'countryId')::uuid
  join public.studio2_confirmation_requirements requirement
    on requirement.edition_id = p_edition_id
   and requirement.country_id = country.id
   and requirement.superseded_at is null;

  v_resulting_preview := private.studio2_confirmation_requirement_materialization_state(
    p_edition_id,
    p_country_ids
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'materialize_confirmation_requirements',
    'studio2_confirmation_requirements',
    p_edition_id::text,
    jsonb_build_object(
      'impactFingerprint', v_expected_fingerprint,
      'targetCount', v_preview -> 'targetCount',
      'createCount', v_preview -> 'createCount',
      'targetMode', v_preview -> 'targetMode',
      'requestedCountryIds', v_preview -> 'requestedCountryIds'
    ),
    jsonb_build_object(
      'created', v_created_count,
      'createdRequirements', v_created_requirements,
      'resultingFingerprint', v_resulting_preview ->> 'impactFingerprint'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'editionId', p_edition_id,
    'appliedFingerprint', v_expected_fingerprint,
    'resultingFingerprint', v_resulting_preview ->> 'impactFingerprint',
    'targetCount', v_preview -> 'targetCount',
    'created', v_created_count,
    'createdRequirements', v_created_requirements,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.admin_confirmation_apply_requirement_materialization(
  uuid, uuid[], text, uuid, text, uuid
) from public, anon;
grant execute on function public.admin_confirmation_apply_requirement_materialization(
  uuid, uuid[], text, uuid, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
