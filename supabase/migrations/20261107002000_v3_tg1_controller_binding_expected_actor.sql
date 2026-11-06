begin;

-- WORLD-01 TG1 forward fix. A durable-person binding is an R2 operation:
-- every NEW write MUST identify the canonical controller it observed.
-- Exact receipt replay remains possible for historical requests with NULL.
-- This does not transfer ownership; country_accounts remains sole authority.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg1.world-controller-binding-expected-actor', 1,
      'forward_fix_only', false, null,
      'Require non-null expected current country controller and compare under lock before durable-person binding; suppress future-start controller terms from the public current identity projection.'
    );
  end if;
end $contract$;

-- The projection must not present a future-dated open historical term as the
-- current controller. The active country account is still authoritative.
create or replace function public.world_country_identity_v1(p_country_id uuid default null)
returns table (
  country_id uuid,
  country_name text,
  short_code text,
  native_name text,
  controller_person_id uuid,
  controller_display_name text,
  control_started_at timestamptz,
  capital text,
  government_type text,
  leader_name text,
  leader_title text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $projection$
  select
    c.id, c.name, c.short_code, c.native_name,
    term.person_id, person.display_name, term.started_at,
    profile.capital, profile.government_type, profile.leader_name, profile.leader_title
  from public.countries c
  left join public.country_profiles profile on profile.country_id = c.id
  left join public.country_accounts current_account
    on current_account.country_id = c.id
   and current_account.status = 'active'
  left join public.world_country_control_terms term
    on term.country_id = c.id
   and term.ended_at is null
   and term.user_id = current_account.user_id
   and term.started_at <= now()
  left join public.delegation_people person on person.id = term.person_id
  where p_country_id is null or c.id = p_country_id
  order by c.name, c.id
$projection$;

revoke all on function public.world_country_identity_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.world_country_identity_v1(uuid)
  to anon, authenticated, service_role;

-- Preserve existing operation identity, idempotency, CAS error, row lock,
-- historical-revision semantics, domain event and durable receipt.
-- Only the missing expected-controller check becomes mandatory.
create or replace function public.world_bind_country_controller_person_v1(
  p_country_id uuid,
  p_person_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_current_user_id uuid default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $bind$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current_user_id uuid;
  v_existing public.world_country_control_terms%rowtype;
  v_revision bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('delegation.manage', null, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_country_id is null or p_person_id is null or v_reason is null or length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.country_control.bind_person',
    'R2',
    jsonb_build_object('countryId', p_country_id, 'subjectType', 'country'),
    jsonb_build_object('countryId', p_country_id, 'personId', p_person_id,
      'expectedCurrentUserId', p_expected_current_user_id, 'reason', v_reason)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;
  -- Preserve exact reconciliation for previously successful legacy operations
  -- with a null expected actor. New blind writes still fail atomically before
  -- any canonical country/person/history mutation.
  if p_expected_current_user_id is null then
    raise exception using errcode = '22023', message = 'EXPECTED_CONTROLLER_REQUIRED';
  end if;

  -- country_accounts remains sole current controller authority. A
  -- suspended/inactive account may have a historical row but must not gain a
  -- newly bound *current* political identity through this command.
  select ca.user_id into v_current_user_id
  from public.country_accounts ca
  where ca.country_id = p_country_id
    and ca.status = 'active'
  for update;
  if v_current_user_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if v_current_user_id is distinct from p_expected_current_user_id then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if not exists (select 1 from public.delegation_people person where person.id = p_person_id) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  select term.* into v_existing
  from public.world_country_control_terms term
  where term.country_id = p_country_id and term.ended_at is null
  for update;

  if v_existing.id is not null
     and v_existing.person_id = p_person_id
     and v_existing.user_id is not distinct from v_current_user_id then
    v_result := jsonb_build_object('ok', true, 'changed', false, 'countryId', p_country_id,
      'personId', p_person_id, 'revision', v_existing.revision, 'operationId', v_operation_id);
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
  end if;

  select coalesce(max(term.revision), 0) + 1 into v_revision
  from public.world_country_control_terms term where term.country_id = p_country_id;

  if v_existing.id is not null then
    update public.world_country_control_terms
    set ended_at = now(), reason_ended = 'Superseded by explicit durable controller-person binding.'
    where id = v_existing.id;
  end if;

  insert into public.world_country_control_terms (
    country_id, person_id, user_id, started_at, source, reason_started, revision
  ) values (
    p_country_id, p_person_id, v_current_user_id, now(),
    'world_bind_country_controller_person_v1', v_reason, v_revision
  );

  perform private.v3_emit_domain_event(
    'world.country_control_linked', 'world_country_control', p_country_id::text,
    v_revision, v_operation_id, null, null,
    jsonb_build_object('countryId', p_country_id, 'personId', p_person_id, 'revision', v_revision),
    1, array[]::text[]
  );

  v_result := jsonb_build_object('ok', true, 'changed', true, 'countryId', p_country_id,
    'personId', p_person_id, 'revision', v_revision, 'operationId', v_operation_id);
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$bind$;

revoke all on function public.world_bind_country_controller_person_v1(
  uuid,uuid,text,uuid,text,uuid,uuid
) from public, anon, authenticated;
grant execute on function public.world_bind_country_controller_person_v1(
  uuid,uuid,text,uuid,text,uuid,uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
