begin;

-- TG5A: voluntary GUARD membership intake. The application is NOT admission.
-- Existing world_organization_memberships remains the only membership truth.
create table public.world_membership_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  official_state_designation text not null,
  government_system text not null,
  motivation text not null,
  contributions text not null,
  international_commitment text not null,
  status text not null default 'submitted',
  operation_id uuid not null unique references public.studio2_operation_receipts(operation_id) on delete restrict,
  submitted_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_membership_application_status_check
    check (status in ('submitted','under_review','introduced','approved','rejected','withdrawn')),
  constraint world_membership_application_revision_check check (revision > 0),
  constraint world_membership_application_field_lengths_check check (
    length(btrim(official_state_designation)) between 2 and 160
    and length(btrim(government_system)) between 2 and 200
    and length(btrim(motivation)) between 20 and 3000
    and length(btrim(contributions)) between 20 and 3000
    and length(btrim(international_commitment)) between 20 and 3000
  )
);
create unique index world_membership_applications_one_active_idx
  on public.world_membership_applications(organization_id, country_id)
  where status in ('submitted','under_review','introduced');
create index world_membership_applications_country_history_idx
  on public.world_membership_applications(country_id, submitted_at desc);

alter table public.world_membership_applications enable row level security;
revoke all on public.world_membership_applications from public, anon, authenticated;
grant select on public.world_membership_applications to authenticated;
grant all on public.world_membership_applications to service_role;

create policy world_membership_applications_country_read
on public.world_membership_applications for select to authenticated
using (
  exists (
    select 1 from public.country_accounts account_row
    where account_row.country_id = world_membership_applications.country_id
      and account_row.user_id = auth.uid()
      and account_row.status = 'active'
  )
  or public.world_access_allowed(
    'world.membership.review', organization_id, country_id, null, null, null
  )
);

create or replace function public.world_submit_guard_membership_application_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_official_state_designation text,
  p_government_system text,
  p_motivation text,
  p_contributions text,
  p_international_commitment text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $submit$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_id uuid;
  v_result jsonb;
  v_designation text := btrim(coalesce(p_official_state_designation, ''));
  v_government text := btrim(coalesce(p_government_system, ''));
  v_motivation text := btrim(coalesce(p_motivation, ''));
  v_contributions text := btrim(coalesce(p_contributions, ''));
  v_commitment text := btrim(coalesce(p_international_commitment, ''));
begin
  if v_actor is null or p_country_id is null or p_organization_id is null
      or not exists (
        select 1 from public.country_accounts account_row
        where account_row.country_id = p_country_id
          and account_row.user_id = v_actor
          and account_row.status = 'active'
      )
      or not public.world_access_allowed(
        'world.membership.apply', p_organization_id, p_country_id, null, null, null
      ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- The first intake is GUARD-specific: UNITY membership is automatic/rejoin-governed.
  if not exists (
    select 1 from public.world_organizations org
    where org.id = p_organization_id
      and org.slug = 'guard'
      and org.status = 'active'
      and org.public_visibility = 'public'
  ) then
    raise exception using errcode = '22023', message = 'APPLICATION_UNAVAILABLE';
  end if;

  if length(v_designation) not between 2 and 160
    or length(v_government) not between 2 and 200
    or length(v_motivation) not between 20 and 3000
    or length(v_contributions) not between 20 and 3000
    or length(v_commitment) not between 20 and 3000
    or p_operation_id is null
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'world.membership.application.submit',
    'R2',
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'subjectType', 'world_membership_application'
    ),
    jsonb_build_object(
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'officialDesignation', v_designation,
      'governmentSystem', v_government,
      'motivation', v_motivation,
      'contributions', v_contributions,
      'commitment', v_commitment
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if exists (
    select 1 from public.world_organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.country_id = p_country_id
      and membership.ended_at is null
  ) then
    raise exception using errcode = '23514', message = 'ALREADY_MEMBER';
  end if;
  if exists (
    select 1 from public.world_membership_applications application
    where application.organization_id = p_organization_id
      and application.country_id = p_country_id
      and application.status in ('submitted', 'under_review', 'introduced')
  ) then
    raise exception using errcode = '23505', message = 'APPLICATION_ALREADY_PENDING';
  end if;

  insert into public.world_membership_applications (
    organization_id, country_id, submitted_by,
    official_state_designation, government_system,
    motivation, contributions, international_commitment, operation_id
  ) values (
    p_organization_id, p_country_id, v_actor,
    v_designation, v_government,
    v_motivation, v_contributions, v_commitment, v_operation_id
  ) returning id into v_id;

  perform private.v3_emit_domain_event(
    'world.membership.application.submitted',
    'world_membership_application',
    v_id::text,
    1,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'applicationId', v_id,
      'organizationId', p_organization_id,
      'countryId', p_country_id,
      'status', 'submitted'
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'applicationId', v_id,
    'organizationId', p_organization_id,
    'countryId', p_country_id,
    'status', 'submitted',
    'revision', 1,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$submit$;

revoke all on function public.world_submit_guard_membership_application_v1(
  uuid,uuid,text,text,text,text,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.world_submit_guard_membership_application_v1(
  uuid,uuid,text,text,text,text,text,uuid,text
) to authenticated, service_role;

comment on table public.world_membership_applications is
  'TG5 application intake only. An application never creates membership, representation or constitutional approval.';
comment on function public.world_submit_guard_membership_application_v1(
  uuid,uuid,text,text,text,text,text,uuid,text
) is 'Country-controller-only receipted GUARD application. Admission requires a separate GAG vote and governed activation.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg5.guard-membership-intake',1,'forward_fix_only',false,null,
      'TG5A governed GUARD application intake with scoped RLS, one pending application, idempotent operation and DomainEvent; no premature membership activation.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
