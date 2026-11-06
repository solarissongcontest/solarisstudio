begin;

-- WORLD-03 TG5B. Private, governed procedural review of GUARD applications.
-- Review and introduction are not decisions on membership or GAG ballots.
create table public.world_membership_application_review_history (
  application_id uuid not null references public.world_membership_applications(id) on delete restrict,
  revision bigint not null check (revision > 1),
  previous_status text not null check (previous_status in ('submitted','under_review')),
  next_status text not null check (next_status in ('under_review','introduced')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_person_id uuid references public.delegation_people(id) on delete restrict,
  operation_id uuid not null unique references public.studio2_operation_receipts(operation_id) on delete restrict,
  changed_at timestamptz not null default now(),
  primary key (application_id, revision),
  constraint tg5_review_history_transition_check check (
    (previous_status='submitted' and next_status='under_review')
    or (previous_status='under_review' and next_status='introduced')
  )
);
alter table public.world_membership_application_review_history enable row level security;
revoke all on public.world_membership_application_review_history from public, anon, authenticated, service_role;
comment on table public.world_membership_application_review_history is
  'Private append-only TG5 GUARD application review transitions; never admission authority.';

-- Read only the requested application phase in fixed-size keyset pages.
-- The definer boundary is authorized against the caller's live office/grant authority,
-- not from a route guard or cached client-side title.
create or replace function public.world_guard_review_inbox_v1(
  p_status text default 'submitted',
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog
as $inbox$
declare
  v_org_id uuid;
  v_org_name text;
  v_items jsonb;
  v_next jsonb := null;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;
  if p_status not in ('submitted','under_review','introduced')
    or ((p_before_submitted_at is null) <> (p_before_id is null)) then
    raise exception using errcode='22023', message='VALIDATION';
  end if;
  select org.id,org.short_name into v_org_id,v_org_name
  from public.world_organizations org
  where org.slug='guard' and org.status='active'
    and org.public_visibility='public';
  if v_org_id is null
    or not public.world_access_allowed(
      'world.membership.review',v_org_id,null,null,null,null
    ) then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',page.id,
      'countryId',page.country_id,
      'countryName',page.country_name,
      'countryCode',page.short_code,
      'officialDesignation',page.official_state_designation,
      'governmentSystem',page.government_system,
      'motivation',page.motivation,
      'contributions',page.contributions,
      'commitment',page.international_commitment,
      'status',page.status,
      'submittedAt',page.submitted_at,
      'revision',page.revision
    ) order by page.submitted_at desc,page.id desc
  ),'[]'::jsonb)
  into v_items
  from (
    select application.id, application.country_id,
      country.name as country_name,country.short_code,
      application.official_state_designation,application.government_system,
      application.motivation,application.contributions,
      application.international_commitment,application.status,
      application.submitted_at,application.revision
    from public.world_membership_applications application
    join public.countries country on country.id=application.country_id
    where application.organization_id=v_org_id
      and application.status=p_status
      and (
        p_before_submitted_at is null
        or (application.submitted_at, application.id)
            < (p_before_submitted_at,p_before_id)
      )
    order by application.submitted_at desc,application.id desc
    limit 21
  ) page;
  if jsonb_array_length(v_items)>20 then
    v_next := jsonb_build_object(
      'submittedAt',v_items->19->>'submittedAt',
      'id',v_items->19->>'id'
    );
    v_items := v_items - 20;
  end if;
  return jsonb_build_object(
    'organizationId',v_org_id,
    'organizationName',v_org_name,
    'canIntroduce',public.world_access_allowed(
      'world.membership.introduce',v_org_id,null,null,null,null
    ),
    'status',p_status,
    'items',v_items,
    'nextCursor',v_next
  );
end
$inbox$;

revoke all on function public.world_guard_review_inbox_v1(text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.world_guard_review_inbox_v1(text,timestamptz,uuid)
  to authenticated,service_role;

-- Only two procedural transitions are possible. A separate certified
-- GAG vote + admission command is REQUIRED to modify membership or approval.
create or replace function public.world_review_guard_application_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_application_id uuid,
  p_expected_revision bigint,
  p_action text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $review$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_application public.world_membership_applications%rowtype;
  v_previous_status text;
  v_next_status text;
  v_capability text;
  v_revision bigint;
  v_person_id uuid;
  v_result jsonb;
begin
  if v_actor is null or p_organization_id is null
     or p_country_id is null or p_application_id is null then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_operation_id is null
     or length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160
     or p_action not in ('review','introduce') then
    raise exception using errcode='22023', message='VALIDATION';
  end if;
  v_capability := case p_action
    when 'review' then 'world.membership.review'
    when 'introduce' then 'world.membership.introduce'
  end;

  -- Lock organization before the application, matching the intake/withdrawal
  -- lock ordering and blocking invalid post-deactivation transitions.
  perform 1 from public.world_organizations org
  where org.id=p_organization_id and org.slug='guard'
    and org.status='active' and org.public_visibility='public'
  for share;
  if not found or not public.world_access_allowed(
      v_capability,p_organization_id,p_country_id,null,null,null
    ) then
    raise exception using errcode='42501', message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.membership.application.' || p_action,'R2',
    jsonb_build_object(
      'organizationId',p_organization_id,
      'countryId',p_country_id,
      'subjectType','world_membership_application',
      'subjectId',p_application_id
    ),
    jsonb_build_object(
      'applicationId',p_application_id,
      'expectedRevision',p_expected_revision,
      'action',p_action
    )
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select application.* into v_application
  from public.world_membership_applications application
  where application.id=p_application_id for update;
  if not found
     or v_application.organization_id is distinct from p_organization_id
     or v_application.country_id is distinct from p_country_id then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if v_application.revision <> p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  v_previous_status := v_application.status;
  if (p_action='review' and v_previous_status='submitted') then
    v_next_status := 'under_review';
  elsif (p_action='introduce' and v_previous_status='under_review') then
    v_next_status := 'introduced';
  else
    raise exception using errcode='23514',message='APPLICATION_LOCKED';
  end if;

  update public.world_membership_applications
  set status=v_next_status,revision=revision+1
  where id=p_application_id and revision=p_expected_revision
  returning revision into v_revision;
  if v_revision is null then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;

  -- Persist real durable person identity only if an existing active office term
  -- already binds that person to the current user.
  select term_row.holder_person_id into v_person_id
  from public.world_office_terms term_row
  join public.world_organization_offices office_row
    on office_row.id=term_row.office_id
  where office_row.organization_id=p_organization_id
    and term_row.holder_user_id=v_actor
    and term_row.status='active' and term_row.ends_at is null
  order by term_row.starts_at desc,term_row.id desc
  limit 1;

  insert into public.world_membership_application_review_history(
    application_id,revision,previous_status,next_status,
    actor_user_id,actor_person_id,operation_id
  ) values (
    p_application_id,v_revision,v_previous_status,v_next_status,
    v_actor,v_person_id,v_operation_id
  );

  perform private.v3_emit_domain_event(
    case p_action
      when 'review' then 'world.membership.application.review_started'
      else 'world.membership.application.introduced'
    end,
    'world_membership_application',p_application_id::text,v_revision,
    v_operation_id,null,null,
    jsonb_build_object(
      'applicationId',p_application_id,'organizationId',p_organization_id,
      'countryId',p_country_id,'status',v_next_status,'revision',v_revision
    ),1,array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok',true,'applicationId',p_application_id,
    'organizationId',p_organization_id,'countryId',p_country_id,
    'status',v_next_status,'revision',v_revision,
    'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$review$;

revoke all on function public.world_review_guard_application_v1(
  uuid,uuid,uuid,bigint,text,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.world_review_guard_application_v1(
  uuid,uuid,uuid,bigint,text,uuid,text
) to authenticated,service_role;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
    'v3.tg5.guard-application-review',1,'forward_fix_only',false,null,
    'Private bounded GUARD reviewer inbox, CAS/idempotent procedural transitions, audit and public-safe events; never admit members without certified GAG vote.'
  );
 end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;