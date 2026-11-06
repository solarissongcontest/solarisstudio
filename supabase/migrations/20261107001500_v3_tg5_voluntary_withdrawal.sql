begin;

-- WORLD-03 TG5C voluntary GUARD / UNITY withdrawal.
-- Reuse the TG2 membership, representation and proxy truth. No vote or new
-- membership store is created. Officeholder succession remains a hard blocker.
-- This migration must be merged after 20261107001000 and before 20261107002000.

-- This predicate is a conservative constitutional safety gate. A departure
-- cannot orphan an existing/scheduled officer or silently assign a successor.
-- Country links are historical identities, never account-login assumptions.
create or replace function private.world_membership_has_office_transition_v1(
  p_organization_id uuid, p_country_id uuid
)
returns boolean language sql stable security definer set search_path = pg_catalog
as $has_office$
  select exists (
    select 1
    from public.world_office_terms term_row
    join public.world_organization_offices office_row
      on office_row.id = term_row.office_id
    where office_row.organization_id = p_organization_id
      and term_row.status in ('active','scheduled')
      and term_row.actual_end_at is null
      and (
        term_row.represented_country_id = p_country_id
        or exists (
          select 1
          from public.world_country_control_terms controller_term
          where controller_term.country_id = p_country_id
            and controller_term.person_id = term_row.holder_person_id
        )
        or exists (
          select 1
          from public.world_organization_representations representation_row
          where representation_row.organization_id = p_organization_id
            and representation_row.country_id = p_country_id
            and representation_row.person_id = term_row.holder_person_id
        )
      )
  )
$has_office$;
revoke all on function private.world_membership_has_office_transition_v1(uuid,uuid)
  from public, anon, authenticated, service_role;

-- A single country-scoped projection with an explicit last-known state after
-- withdrawal. No private role/grant identifiers are returned.
create or replace function public.world_my_membership_withdrawal_v1(p_country_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog
as $read$
declare
  v_items jsonb;
begin
  if auth.uid() is null or p_country_id is null or not exists (
    select 1 from public.country_accounts account_row
    where account_row.user_id = auth.uid()
      and account_row.country_id = p_country_id
      and account_row.status = 'active'
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organizationId', item.organization_id,
        'organizationSlug',item.organization_slug,
        'organizationName',item.organization_name,
        'membershipId',item.membership_id,
        'membershipStatus',item.membership_status,
        'membershipType',item.membership_type,
        'joinedAt',item.joined_at,
        'endedAt',item.ended_at,
        'revision',item.revision,
        'requiresOfficeTransition',item.requires_office_transition,
        'canWithdraw',item.can_withdraw
      ) order by item.organization_slug
    ),'[]'::jsonb
  )
  into v_items
  from (
    select
      organization_row.id as organization_id,
      organization_row.slug as organization_slug,
      organization_row.short_name as organization_name,
      membership_row.id as membership_id,
      membership_row.status as membership_status,
      membership_row.membership_type,
      membership_row.joined_at,
      membership_row.ended_at,
      membership_row.revision,
      case when membership_row.id is not null and membership_row.ended_at is null
        then private.world_membership_has_office_transition_v1(
          organization_row.id,p_country_id
        ) else false end as requires_office_transition,
      case when membership_row.id is not null
          and membership_row.ended_at is null
          and membership_row.joined_at <= now()
          and membership_row.status in ('member','observer','associate','suspended')
          and public.world_access_allowed(
            'world.membership.withdraw',organization_row.id,p_country_id,null,null,null
          )
          and not private.world_membership_has_office_transition_v1(
            organization_row.id,p_country_id
          )
        then true else false end as can_withdraw
    from public.world_organizations organization_row
    left join lateral (
      select membership.*
      from public.world_organization_memberships membership
      where membership.organization_id=organization_row.id
        and membership.country_id=p_country_id
      order by (membership.ended_at is null) desc, membership.joined_at desc, membership.id desc
      limit 1
    ) membership_row on true
    where organization_row.slug in ('guard','unity')
  ) item;

  return jsonb_build_object('countryId',p_country_id,'items',v_items);
end
$read$;
revoke all on function public.world_my_membership_withdrawal_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.world_my_membership_withdrawal_v1(uuid)
  to authenticated,service_role;

create or replace function public.world_withdraw_membership_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_membership_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $withdraw$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_membership public.world_organization_memberships%rowtype;
  v_effective_at timestamptz := now();
  v_revision bigint;
  v_representations integer := 0;
  v_proxies integer := 0;
  v_result jsonb;
begin
  if v_actor is null or p_organization_id is null
     or p_country_id is null or p_membership_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_operation_id is null
     or length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  -- This share lock prevents the active country account from being revoked or
  -- transferred during authorization. Same country -> org lock order as TG5A.
  perform 1 from public.country_accounts account_row
    where account_row.country_id=p_country_id
      and account_row.user_id=v_actor
      and account_row.status='active'
    for share;
  if not found or not public.world_access_allowed(
    'world.membership.withdraw',p_organization_id,p_country_id,null,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  perform 1 from public.world_organizations org
    where org.id=p_organization_id
      and org.slug in ('guard','unity')
    for share;
  if not found then
    raise exception using errcode='22023',message='WITHDRAWAL_UNAVAILABLE';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.membership.withdraw','R2',
    jsonb_build_object(
      'organizationId',p_organization_id,'countryId',p_country_id,
      'subjectType','world_membership','subjectId',p_membership_id
    ),
    jsonb_build_object('membershipId',p_membership_id,'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Authoritative serializing parent for same-country representative writes.
  -- TG2 world_assign_organization_representative_v1 already locks this row
  -- before creating/replacing a representative.
  select membership.* into v_membership
  from public.world_organization_memberships membership
  where membership.id=p_membership_id
  for update;
  if not found
     or v_membership.organization_id is distinct from p_organization_id
     or v_membership.country_id is distinct from p_country_id then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if v_membership.revision <> p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_membership.ended_at is not null
     or v_membership.joined_at > v_effective_at
     or v_membership.status not in ('member','observer','associate','suspended') then
    raise exception using errcode='23514',message='MEMBERSHIP_NOT_EFFECTIVE';
  end if;

  -- Until the canonical acting-deputy and election-task writer is integrated,
  -- an institutional office is NEVER orphaned or silently resigned by a
  -- country withdrawal. The user receives a precise blocked-office state.
  if private.world_membership_has_office_transition_v1(
      p_organization_id,p_country_id
  ) then
    raise exception using errcode='23514',message='OFFICE_TRANSITION_REQUIRED';
  end if;

  -- End each open representation, including non-voting auxiliaries. A future
  -- starts_at is preserved (never rewrite history); its ends_at is set to
  -- starts_at, ensuring it cannot become effective after membership loss.
  -- Consistent parent -> representation -> proxy lock order reduces
  -- contention with TG2 representative assignment and TG6 proxy commands.
  update public.world_organization_representations representation_row
    set ends_at=greatest(v_effective_at,representation_row.starts_at)
  where representation_row.organization_id=p_organization_id
    and representation_row.country_id=p_country_id
    and representation_row.ends_at is null;
  get diagnostics v_representations = row_count;

  update public.world_representation_proxies proxy_row
    set status='revoked',revoked_at=v_effective_at,
        revision=proxy_row.revision+1
  from public.world_organization_representations representation_row
  where proxy_row.representation_id=representation_row.id
    and representation_row.organization_id=p_organization_id
    and representation_row.country_id=p_country_id
    and proxy_row.status in ('requested','approved');
  get diagnostics v_proxies = row_count;

  update public.world_organization_memberships membership
    set status='withdrawn',
        ended_at=v_effective_at,
        termination_reason='voluntary_country_withdrawal',
        revision=membership.revision+1
  where membership.id=v_membership.id
    and membership.revision=p_expected_revision
  returning membership.revision into v_revision;
  if v_revision is null then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;

  perform private.v3_emit_domain_event(
    'world.membership.withdrawn','world_membership',
    p_membership_id::text,v_revision,v_operation_id,null,null,
    jsonb_build_object(
      'organizationId',p_organization_id,
      'countryId',p_country_id,
      'membershipId',p_membership_id,
      'status','withdrawn',
      'endedAt',v_effective_at,
      'revision',v_revision,
      'representationsEnded',v_representations,
      'proxiesRevoked',v_proxies
    ),1,array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok',true,
    'organizationId',p_organization_id,
    'countryId',p_country_id,
    'membershipId',p_membership_id,
    'status','withdrawn',
    'endedAt',v_effective_at,
    'revision',v_revision,
    'representationsEnded',v_representations,
    'proxiesRevoked',v_proxies,
    'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$withdraw$;
revoke all on function public.world_withdraw_membership_v1(
  uuid,uuid,uuid,bigint,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.world_withdraw_membership_v1(
  uuid,uuid,uuid,bigint,uuid,text
) to authenticated,service_role;

comment on function public.world_withdraw_membership_v1(uuid,uuid,uuid,bigint,uuid,text)
  is 'TG5 voluntary GUARD/UNITY country withdrawal: active controller, exact revision and receipt, immediate membership/representative/proxy end; blocks officeholders pending canonical succession.';
comment on function public.world_my_membership_withdrawal_v1(uuid)
  is 'Country-controller scoped withdrawal projection with confirmed historical status and office-transition safety.';

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
    'v3.tg5.voluntary-membership-withdrawal',1,'forward_fix_only',false,null,
    'Governed voluntary country withdrawal of GUARD/UNITY membership with R2 receipt, row/CAS locks, representation and proxy revocation; office succession explicitly blocked pending canonical task/term writer.'
  );
 end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;