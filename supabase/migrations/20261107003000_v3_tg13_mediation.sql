begin;

-- TG13: mediation is official institutional state. Freeform diplomacy stays outside Solaris.
-- This is additive and uses TG2 country_accounts, organizations, capabilities and R2 operations.
do $migration$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg13.mediation', 1, 'forward_fix_only', false, null,
      'Governed, revision-checked Terra Solaris mediation requests and decisions; private until explicitly published.'
    );
  end if;
end $migration$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.mediation.request','world','Request mediation','File a mediation request for a currently controlled country.','operate'),
  ('world.mediation.respond','world','Respond to mediation','Accept or decline mediation for a currently controlled respondent country.','operate'),
  ('world.mediation.manage','world','Manage institutional mediation','Advance a mediation case within an explicitly granted organization scope.','approve')
on conflict (key) do nothing;

insert into public.world_country_controller_capabilities(capability)
values ('world.mediation.request'),('world.mediation.respond')
on conflict do nothing;

create table public.world_mediation_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  requester_country_id uuid not null references public.countries(id) on delete restrict,
  respondent_country_id uuid not null references public.countries(id) on delete restrict,
  issue_summary text not null,
  state text not null default 'requested',
  visibility text not null default 'private',
  -- Preserve the filing actor's stable opaque id even if login is later deleted.
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closure_reason text,
  revision bigint not null default 1,
  constraint world_mediation_distinct_parties check (requester_country_id <> respondent_country_id),
  constraint world_mediation_summary_length check (length(btrim(issue_summary)) between 20 and 5000),
  constraint world_mediation_revision_positive check (revision >= 1),
  constraint world_mediation_visibility_check check (visibility in ('private','public')),
  constraint world_mediation_state_check check (
    state in ('requested','accepted','open','negotiating','settled','failed','referred_to_court','closed')
  ),
  constraint world_mediation_closed_time_check check (
    (state = 'closed' and closed_at is not null) or (state <> 'closed' and closed_at is null)
  ),
  constraint world_mediation_closed_reason_check check (
    (state = 'closed' and length(btrim(coalesce(closure_reason,''))) >= 10)
    or state <> 'closed'
  )
);

create index world_mediation_cases_requester_idx
  on public.world_mediation_cases(requester_country_id, submitted_at desc);
create index world_mediation_cases_respondent_idx
  on public.world_mediation_cases(respondent_country_id, submitted_at desc);
create index world_mediation_cases_org_state_idx
  on public.world_mediation_cases(organization_id, state, submitted_at desc);

create table public.world_mediation_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.world_mediation_cases(id) on delete restrict,
  from_state text,
  to_state text not null,
  reason text,
  -- Never erase official action attribution when an auth account is deleted.
  actor_user_id uuid not null,
  operation_id uuid not null unique,
  revision bigint not null,
  occurred_at timestamptz not null default now(),
  unique (case_id, revision),
  constraint world_mediation_history_revision_check check (revision >= 1),
  constraint world_mediation_history_state_check check (
    to_state in ('requested','accepted','open','negotiating','settled','failed','referred_to_court','closed')
  )
);

create index world_mediation_history_case_idx
  on public.world_mediation_history(case_id, occurred_at, revision);

-- Private-by-default. Even visibility='public' is NOT a publication grant:
-- a later independently certified publication projection owns public display.
alter table public.world_mediation_cases enable row level security;
alter table public.world_mediation_history enable row level security;
revoke all on public.world_mediation_cases, public.world_mediation_history
  from public, anon, authenticated;
grant select on public.world_mediation_cases, public.world_mediation_history to authenticated;
grant all on public.world_mediation_cases, public.world_mediation_history to service_role;

create policy world_mediation_participant_read
on public.world_mediation_cases for select to authenticated
using (
  exists (
    select 1 from public.country_accounts ca
    where ca.user_id = auth.uid()
      and ca.status = 'active'
      and ca.country_id in (requester_country_id, respondent_country_id)
  )
  or public.world_access_allowed(
    'world.mediation.manage', organization_id, null, null, 'mediation', id
  )
);

create policy world_mediation_history_participant_read
on public.world_mediation_history for select to authenticated
using (
  exists (
    select 1 from public.world_mediation_cases mc where mc.id = case_id
  )
);

-- A request can be filed only by the actual live controller of its requesting country.
create function public.world_request_mediation_v1(
  p_organization_id uuid,
  p_requester_country_id uuid,
  p_respondent_country_id uuid,
  p_summary text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $request$
declare
  v_summary text := nullif(btrim(coalesce(p_summary,'')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_case_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null
    or not public.world_access_allowed(
      'world.mediation.request', p_organization_id, p_requester_country_id,
      null, null, null
    ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_organization_id is null or p_requester_country_id is null
    or p_respondent_country_id is null
    or p_requester_country_id = p_respondent_country_id
    or v_summary is null or length(v_summary) not between 20 and 5000
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not exists (
    select 1 from public.world_organizations o
    where o.id = p_organization_id and o.status in ('active','recognized')
  ) or not exists (
    select 1 from public.countries c where c.id = p_respondent_country_id
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, coalesce(p_correlation_id,p_operation_id),
    'world.mediation.request', 'R2',
    jsonb_build_object('organizationId',p_organization_id,
      'countryId',p_requester_country_id,'subjectType','world_mediation'),
    jsonb_build_object('organizationId',p_organization_id,
      'requesterCountryId',p_requester_country_id,
      'respondentCountryId',p_respondent_country_id,'summary',v_summary)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Revalidate controller after claim under its canonical country-account lock,
  -- avoiding a stale sign-in/session during ownership hand-off.
  perform 1 from public.country_accounts ca
  where ca.country_id = p_requester_country_id
    and ca.user_id = auth.uid() and ca.status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  insert into public.world_mediation_cases(
    organization_id,requester_country_id,respondent_country_id,
    issue_summary,submitted_by
  ) values (
    p_organization_id,p_requester_country_id,p_respondent_country_id,
    v_summary,auth.uid()
  ) returning id into v_case_id;

  insert into public.world_mediation_history(
    case_id,from_state,to_state,reason,actor_user_id,operation_id,revision
  ) values (v_case_id,null,'requested',v_summary,auth.uid(),v_operation_id,1);

  perform private.v3_emit_domain_event(
    'world.mediation.requested','world_mediation_case',v_case_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('caseId',v_case_id,'organizationId',p_organization_id,
      'requesterCountryId',p_requester_country_id,'respondentCountryId',p_respondent_country_id,
      'revision',1),
    1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'caseId',v_case_id,
    'state','requested','revision',1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $request$;

-- Respondent consent is required to begin mediation. Moderator cannot pretend to consent.
-- Only specifically granted organization mediators may advance a consensual case.
create function public.world_transition_mediation_v1(
  p_case_id uuid,
  p_target_state text,
  p_reason text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $transition$
declare
  v_case public.world_mediation_cases%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_respondent boolean;
  v_manager boolean;
begin
  if auth.uid() is null or p_case_id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
    or p_target_state is null
    or p_target_state not in ('accepted','open','negotiating','settled','failed','referred_to_court','closed')
    or length(coalesce(v_reason,'')) > 1500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  -- A definer can inspect a row, but must reveal no private detail to unauthorized users.
  select * into v_case from public.world_mediation_cases where id = p_case_id;
  if not found then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_respondent := public.world_access_allowed(
    'world.mediation.respond', v_case.organization_id,
    v_case.respondent_country_id,null,'mediation',v_case.id
  );
  v_manager := public.world_access_allowed(
    'world.mediation.manage',v_case.organization_id,
    null,null,'mediation',v_case.id
  );
  if (not v_respondent and not v_manager)
    or (v_case.state = 'requested' and not v_respondent)
    or (v_case.state <> 'requested' and not v_manager) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_target_state in ('settled','failed','referred_to_court','closed')
    and (v_reason is null or length(v_reason) < 10) then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.mediation.transition','R2',
    jsonb_build_object('organizationId',v_case.organization_id,
      'countryId',v_case.respondent_country_id,'subjectType','world_mediation',
      'subjectId',v_case.id),
    jsonb_build_object('caseId',p_case_id,'targetState',p_target_state,
      'reason',v_reason,'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select * into v_case from public.world_mediation_cases where id = p_case_id for update;
  if v_case.revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  -- Re-check authority under lock; controller/explicit scoped grants remain authoritative.
  v_respondent := public.world_access_allowed(
    'world.mediation.respond', v_case.organization_id,
    v_case.respondent_country_id,null,'mediation',v_case.id
  );
  v_manager := public.world_access_allowed(
    'world.mediation.manage',v_case.organization_id,
    null,null,'mediation',v_case.id
  );
  if (v_case.state = 'requested' and not v_respondent)
    or (v_case.state <> 'requested' and not v_manager) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  -- Bind respondent consent to its live country-controller row. A concurrent
  -- ownership transfer must invalidate acceptance, not authorize an old HoD.
  if v_case.state = 'requested' then
    perform 1 from public.country_accounts ca
    where ca.country_id = v_case.respondent_country_id
      and ca.user_id = auth.uid() and ca.status = 'active'
    for share;
    if not found then
      raise exception using errcode = '42501', message = 'AUTHORIZATION';
    end if;
  end if;
  if not (
    (v_case.state = 'requested' and p_target_state in ('accepted','failed'))
    or (v_case.state = 'accepted' and p_target_state in ('open','failed'))
    or (v_case.state = 'open' and p_target_state in ('negotiating','failed'))
    or (v_case.state = 'negotiating' and p_target_state in ('settled','failed','referred_to_court'))
    or (v_case.state in ('settled','failed','referred_to_court') and p_target_state = 'closed')
  ) then
    raise exception using errcode = '23514', message = 'INVALID_TRANSITION';
  end if;

  update public.world_mediation_cases
  set state = p_target_state, revision = revision + 1, updated_at = now(),
    closed_at = case when p_target_state = 'closed' then now() else null end,
    closure_reason = case when p_target_state = 'closed' then v_reason else null end
  where id = p_case_id;

  insert into public.world_mediation_history(
    case_id,from_state,to_state,reason,actor_user_id,operation_id,revision
  ) values (
    p_case_id,v_case.state,p_target_state,v_reason,auth.uid(),v_operation_id,v_case.revision+1
  );
  perform private.v3_emit_domain_event(
    'world.mediation.transitioned','world_mediation_case',p_case_id::text,
    v_case.revision+1,v_operation_id,null,null,
    jsonb_build_object('caseId',p_case_id,'organizationId',v_case.organization_id,
      'fromState',v_case.state,'toState',p_target_state,'revision',v_case.revision+1),
    1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'caseId',p_case_id,
    'state',p_target_state,'revision',v_case.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $transition$;

revoke all on function public.world_request_mediation_v1(uuid,uuid,uuid,text,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.world_transition_mediation_v1(uuid,text,text,bigint,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.world_request_mediation_v1(uuid,uuid,uuid,text,uuid,text,uuid)
  to authenticated,service_role;
grant execute on function public.world_transition_mediation_v1(uuid,text,text,bigint,uuid,text,uuid)
  to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
