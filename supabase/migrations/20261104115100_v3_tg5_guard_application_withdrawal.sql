begin;

-- TG5A: country-controlled pre-introduction GUARD application withdrawal.
-- Does not revoke, grant or change any actual international membership.
create or replace function public.world_withdraw_guard_application_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_application_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $withdraw$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_application public.world_membership_applications%rowtype;
  v_new_revision bigint;
  v_result jsonb;
begin
  if v_actor is null or p_country_id is null or p_organization_id is null then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;
  perform 1 from public.country_accounts account_row
    where account_row.country_id=p_country_id
      and account_row.user_id=v_actor and account_row.status='active'
    for share;
  if not found or not public.world_access_allowed(
    'world.membership.apply',p_organization_id,p_country_id,null,null,null
  ) then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;
  perform 1 from public.world_organizations org
    where org.id=p_organization_id and org.slug='guard' and org.status='active'
    for share;
  if not found then
    raise exception using errcode='22023', message='APPLICATION_UNAVAILABLE';
  end if;
  if p_application_id is null or p_expected_revision is null
     or p_expected_revision < 1 or p_operation_id is null
     or length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then
    raise exception using errcode='22023', message='VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.membership.application.withdraw','R2',
    jsonb_build_object('organizationId',p_organization_id,
      'countryId',p_country_id,'subjectType','world_membership_application',
      'subjectId',p_application_id),
    jsonb_build_object('applicationId',p_application_id,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- The row lock also serializes reviewer status transitions.
  select * into v_application
  from public.world_membership_applications app
  where app.id=p_application_id for update;
  if not found or v_application.organization_id is distinct from p_organization_id
     or v_application.country_id is distinct from p_country_id then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;
  if v_application.revision <> p_expected_revision then
    raise exception using errcode='40001', message='VERSION_CONFLICT';
  end if;
  -- An introduced application belongs to GAG process and cannot be silently
  -- withdrawn by changing an intake record.
  if v_application.status not in ('submitted','under_review') then
    raise exception using errcode='23514', message='APPLICATION_LOCKED';
  end if;

  update public.world_membership_applications
  set status='withdrawn', revision=revision+1
  where id=v_application.id and revision=p_expected_revision
  returning revision into v_new_revision;
  if v_new_revision is null then
    raise exception using errcode='40001', message='VERSION_CONFLICT';
  end if;

  perform private.v3_emit_domain_event(
    'world.membership.application.withdrawn',
    'world_membership_application',v_application.id::text,v_new_revision,
    v_operation_id,null,null,
    jsonb_build_object('applicationId',v_application.id,
      'organizationId',p_organization_id,'countryId',p_country_id,
      'status','withdrawn','revision',v_new_revision),
    1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'applicationId',v_application.id,
    'organizationId',p_organization_id,'countryId',p_country_id,
    'status','withdrawn','revision',v_new_revision,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$withdraw$;

revoke all on function public.world_withdraw_guard_application_v1(
  uuid,uuid,uuid,bigint,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.world_withdraw_guard_application_v1(
  uuid,uuid,uuid,bigint,uuid,text
) to authenticated, service_role;

comment on function public.world_withdraw_guard_application_v1(
  uuid,uuid,uuid,bigint,uuid,text
) is 'TG5A pre-GAG application withdrawal: current-controller-only, revision CAS, idempotent receipt, privacy-safe event and no membership mutations.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg5.guard-application-withdrawal',1,'forward_fix_only',false,null,
      'Country-authorized R2 withdrawal of an unintroduced GUARD application without changing international membership.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
