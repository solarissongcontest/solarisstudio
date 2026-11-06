begin;

-- TG2 membership lifecycle authority: an open membership row alone is
-- insufficient to authorize the representative-assignment operation if
-- the official joining instant is in the future. Preserve the existing
-- single-writer command, CAS, locks, receipts, events and member statuses.
do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg2.membership-effective-representation',1,'forward_fix_only',false,null,
   'Prevent future-dated membership relationships conferring representative assignment authority before joined_at.'
  );
 end if;
end $contract$;

create or replace function public.world_assign_organization_representative_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_person_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_revision bigint default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $assign$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_existing public.world_organization_representations%rowtype;
  v_membership_id uuid;
  v_previous_revision bigint;
  v_representation_id uuid;
  v_revision bigint;
  v_user_id uuid;
  v_result jsonb;
begin
  if not public.world_access_allowed(
    'world.representation.manage', p_organization_id, p_country_id, null, null, null
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_organization_id is null or p_country_id is null or p_person_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  -- Official representation replacement must always use a caller-observed
  -- revision, including zero for the first assignment. No blind writes.
  if p_expected_revision is null then
    raise exception using errcode = '22023', message = 'EXPECTED_REVISION_REQUIRED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.representation.assign',
    'R2',
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'subjectType', 'world_representation'
    ),
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'personId', p_person_id,
      'expectedRevision', p_expected_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- The membership is the serializing parent for this organization/country.
  -- Lock and validate it before reading representation or revision state, so
  -- two first assignments cannot both observe an empty representative slot.
  -- Membership close/suspension commands must use this same row authority.
  select membership_row.id into v_membership_id
  from public.world_organization_memberships membership_row
  where membership_row.organization_id = p_organization_id
    and membership_row.country_id = p_country_id
    and membership_row.ended_at is null
    -- A future legal admission may have been recorded but is not effective
    -- until its canonical joined_at instant. Never grant representation early.
    and membership_row.joined_at <= now()
    and membership_row.status in ('member','observer','associate')
  for update;
  if v_membership_id is null then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if not exists (
    select 1 from public.delegation_people person_row
    where person_row.id = p_person_id
  ) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  select representation_row.*
  into v_existing
  from public.world_organization_representations representation_row
  where representation_row.organization_id = p_organization_id
    and representation_row.country_id = p_country_id
    and representation_row.ends_at is null
    and representation_row.role = 'representative'
    and representation_row.voting_authority
  for update;

  -- Compare against the durable latest revision, not only the current open
  -- row: an ended representation is still a concurrent history transition.
  select coalesce(max(representation_row.revision), 0)
  into v_previous_revision
  from public.world_organization_representations representation_row
  where representation_row.organization_id = p_organization_id
    and representation_row.country_id = p_country_id;

  if v_previous_revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_existing.id is not null and v_existing.person_id = p_person_id then
    v_result := jsonb_build_object(
      'ok', true,
      'changed', false,
      'representationId', v_existing.id,
      'revision', v_existing.revision,
      'operationId', v_operation_id
    );
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', false);
  end if;

  v_revision := v_previous_revision + 1;

  if v_existing.id is not null then
    update public.world_organization_representations
    set ends_at = now()
    where id = v_existing.id;
  end if;

  select term_row.user_id
  into v_user_id
  from public.world_country_control_terms term_row
  where term_row.country_id = p_country_id
    and term_row.person_id = p_person_id
    and term_row.ended_at is null;

  insert into public.world_organization_representations(
    organization_id,
    country_id,
    person_id,
    user_id,
    role,
    voting_authority,
    starts_at,
    source,
    revision
  ) values (
    p_organization_id,
    p_country_id,
    p_person_id,
    v_user_id,
    'representative',
    true,
    now(),
    case when v_user_id is null then 'explicit_person' else 'country_controller' end,
    v_revision
  )
  returning id into v_representation_id;

  perform private.v3_emit_domain_event(
    'world.representation.changed',
    'world_representation',
    v_representation_id::text,
    v_revision,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'representationId', v_representation_id,
      'personId', p_person_id,
      'revision', v_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'representationId', v_representation_id,
    'revision', v_revision,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$assign$;

revoke all on function public.world_assign_organization_representative_v1(
 uuid,uuid,uuid,uuid,text,bigint,uuid
) from public,anon,authenticated;
grant execute on function public.world_assign_organization_representative_v1(
 uuid,uuid,uuid,uuid,text,bigint,uuid
) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
