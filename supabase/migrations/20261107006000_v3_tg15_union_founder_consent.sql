begin;

-- TG15 independent-union recognition application + voluntary founder consent.
-- This is NOT recognition and cannot materialize world_organizations; final
-- charter/vote authority is deliberately reserved for the TG4/TG8 consumers.
do $migration$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg15.union-founder-consent',1,'forward_fix_only',false,null,
      'Private UNITY recognition application and country-controller founder consent, never recognition without certified Charter/GA vote.'
    );
  end if;
end $migration$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.union.apply','world','Propose an independent union','Start a privately governed UNITY union-recognition application for a controlled country.','operate'),
  ('world.union.founder.respond','world','Respond to founding invitation','Accept or decline founding status for a currently controlled country.','operate'),
  ('world.union.founder.invite','world','Invite founding country','Propose a founding country for an existing recognition application.','operate'),
  ('world.union.review','world','Review union recognition','Explicit UNITY recognition review authority, not a substitute for a certified vote.','approve'),
  ('world.union.recognize','world','Execute certified recognition','Materialize an independent organization only after certified GA recognition.','approve')
on conflict (key) do nothing;

insert into public.world_country_controller_capabilities(capability)
values ('world.union.apply'),('world.union.founder.respond'),('world.union.founder.invite')
on conflict do nothing;

create table public.world_union_recognition_applications (
  id uuid primary key default gen_random_uuid(),
  unity_organization_id uuid not null references public.world_organizations(id) on delete restrict,
  lead_country_id uuid not null references public.countries(id) on delete restrict,
  proposed_name text not null,
  proposed_short_name text not null,
  mission text not null,
  governance text not null,
  scope text not null,
  founding_charter_document_id uuid,
  exception_requested boolean not null default false,
  status text not null default 'collecting_founders',
  proposed_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_union_name_check check(length(btrim(proposed_name)) between 5 and 180),
  constraint world_union_short_name_check check(length(btrim(proposed_short_name)) between 2 and 64),
  constraint world_union_mission_check check(length(btrim(mission)) between 20 and 5000),
  constraint world_union_governance_check check(length(btrim(governance)) between 20 and 5000),
  constraint world_union_scope_check check(length(btrim(scope)) between 10 and 2000),
  constraint world_union_status_check check(
    status in ('collecting_founders','submitted','under_review','ballot_pending',
      'recognized','rejected','withdrawn')
  ),
  constraint world_union_revision_check check(revision >= 1)
);

create unique index world_union_pending_short_name_uidx
  on public.world_union_recognition_applications(lower(btrim(proposed_short_name)))
  where status in ('collecting_founders','submitted','under_review','ballot_pending');
create index world_union_apps_lead_idx
  on public.world_union_recognition_applications(lead_country_id,created_at desc);

create table public.world_union_recognition_founders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.world_union_recognition_applications(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by_user_id uuid,
  unique (application_id,country_id),
  constraint world_union_founder_status_check check (status in ('invited','accepted','declined')),
  constraint world_union_founder_response_check check (
    (status='invited' and responded_at is null and responded_by_user_id is null)
    or (status in ('accepted','declined') and responded_at is not null
      and responded_by_user_id is not null)
  )
);
create index world_union_founders_country_idx
  on public.world_union_recognition_founders(country_id,application_id,status);

create table public.world_union_recognition_actions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.world_union_recognition_applications(id) on delete restrict,
  action text not null,
  actor_user_id uuid not null,
  subject_country_id uuid references public.countries(id) on delete restrict,
  operation_id uuid not null unique,
  revision bigint not null,
  created_at timestamptz not null default now(),
  unique (application_id,revision),
  constraint world_union_action_type_check check (
    action in ('applied','founder_invited','founder_accepted','founder_declined')
  ),
  constraint world_union_action_revision_check check(revision >= 1)
);

create function private.world_union_recognition_action_immutable()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $immutable$
begin
  raise exception using errcode='42501',message='IMMUTABLE_RECOGNITION_ACTION';
end $immutable$;
revoke all on function private.world_union_recognition_action_immutable()
  from public,anon,authenticated,service_role;
create trigger world_union_recognition_actions_append_only
before update or delete on public.world_union_recognition_actions
for each row execute function private.world_union_recognition_action_immutable();

alter table public.world_union_recognition_applications enable row level security;
alter table public.world_union_recognition_founders enable row level security;
alter table public.world_union_recognition_actions enable row level security;
revoke all on public.world_union_recognition_applications,
  public.world_union_recognition_founders,public.world_union_recognition_actions
from public,anon,authenticated,service_role;
grant select on public.world_union_recognition_applications,
  public.world_union_recognition_founders,public.world_union_recognition_actions
to authenticated,service_role;

-- SECURITY DEFINER avoids recursive RLS across application and founder rows.
-- It uses current country_accounts authority and explicit world-scoped grants.
create function private.world_union_recognition_can_read(p_application_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $allowed$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.world_union_recognition_applications a
      where a.id=p_application_id and (
        exists (select 1 from public.country_accounts ca
          where ca.user_id=auth.uid() and ca.status='active'
            and ca.country_id=a.lead_country_id)
        or exists (
          select 1 from public.world_union_recognition_founders f
          join public.country_accounts ca on ca.country_id=f.country_id
          where f.application_id=a.id and ca.user_id=auth.uid() and ca.status='active'
        )
        or public.world_access_allowed(
          'world.union.review',a.unity_organization_id,null,null,
          'union-recognition',a.id
        )
      )
    ),false
  )
$allowed$;
revoke all on function private.world_union_recognition_can_read(uuid)
from public,anon,authenticated;
grant execute on function private.world_union_recognition_can_read(uuid)
to authenticated,service_role;

create policy world_union_app_participant_read
on public.world_union_recognition_applications for select to authenticated
using (private.world_union_recognition_can_read(id));
create policy world_union_founder_participant_read
on public.world_union_recognition_founders for select to authenticated
using (private.world_union_recognition_can_read(application_id));
create policy world_union_action_participant_read
on public.world_union_recognition_actions for select to authenticated
using (private.world_union_recognition_can_read(application_id));

create function public.world_start_union_recognition_v1(
  p_unity_organization_id uuid,
  p_lead_country_id uuid,
  p_proposed_name text,
  p_proposed_short_name text,
  p_mission text,
  p_governance text,
  p_scope text,
  p_exception_requested boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $apply$
declare
  v_name text := nullif(btrim(coalesce(p_proposed_name,'')),'');
  v_short_name text := nullif(btrim(coalesce(p_proposed_short_name,'')),'');
  v_mission text := nullif(btrim(coalesce(p_mission,'')),'');
  v_governance text := nullif(btrim(coalesce(p_governance,'')),'');
  v_scope text := nullif(btrim(coalesce(p_scope,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_application_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or not public.world_access_allowed(
    'world.union.apply',p_unity_organization_id,p_lead_country_id,null,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_unity_organization_id is null or p_lead_country_id is null
    or v_name is null or length(v_name) not between 5 and 180
    or v_short_name is null or length(v_short_name) not between 2 and 64
    or v_mission is null or length(v_mission) not between 20 and 5000
    or v_governance is null or length(v_governance) not between 20 and 5000
    or v_scope is null or length(v_scope) not between 10 and 2000
    or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  if not exists (
    select 1 from public.world_organizations unity
    where unity.id=p_unity_organization_id and unity.slug='unity'
      and unity.status in ('active','recognized')
  ) then
    raise exception using errcode='23514',message='UNITY_UNAVAILABLE';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.union.recognition.apply','R2',
    jsonb_build_object('organizationId',p_unity_organization_id,
      'countryId',p_lead_country_id,'subjectType','world_union_recognition'),
    jsonb_build_object('proposedName',v_name,'proposedShortName',v_short_name,
      'mission',v_mission,'governance',v_governance,'scope',v_scope,
      'exceptionRequested',coalesce(p_exception_requested,false))
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Replays must reconcile before the name collision check, because a
  -- previously successful application necessarily reserves its own name.
  if exists (
    select 1 from public.world_organizations o
    where lower(btrim(o.short_name)) = lower(v_short_name)
      or lower(btrim(o.official_name)) = lower(v_name)
  ) then
    raise exception using errcode='23505',message='NAME_ALREADY_USED';
  end if;


  perform 1 from public.country_accounts ca
  where ca.user_id=auth.uid() and ca.country_id=p_lead_country_id
    and ca.status='active'
  for share;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  insert into public.world_union_recognition_applications (
    unity_organization_id,lead_country_id,proposed_name,proposed_short_name,
    mission,governance,scope,exception_requested,proposed_by_user_id
  ) values (
    p_unity_organization_id,p_lead_country_id,v_name,v_short_name,
    v_mission,v_governance,v_scope,coalesce(p_exception_requested,false),auth.uid()
  ) returning id into v_application_id;

  insert into public.world_union_recognition_founders (
    application_id,country_id,status,responded_at,responded_by_user_id
  ) values (v_application_id,p_lead_country_id,'accepted',now(),auth.uid());

  insert into public.world_union_recognition_actions (
    application_id,action,actor_user_id,subject_country_id,operation_id,revision
  ) values (v_application_id,'applied',auth.uid(),p_lead_country_id,v_operation_id,1);

  perform private.v3_emit_domain_event(
    'world.union.recognition_application_started','world_union_recognition',
    v_application_id::text,1,v_operation_id,null,null,
    jsonb_build_object('applicationId',v_application_id,
      'unityOrganizationId',p_unity_organization_id,
      'leadCountryId',p_lead_country_id,'revision',1),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'applicationId',v_application_id,
    'status','collecting_founders','revision',1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $apply$;

create function public.world_invite_union_founder_v1(
  p_application_id uuid,
  p_country_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $invite$
declare
  v_app public.world_union_recognition_applications%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or p_application_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_country_id is null or p_expected_revision is null or p_expected_revision<1
    or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select * into v_app from public.world_union_recognition_applications
  where id=p_application_id;
  if not found or not public.world_access_allowed(
    'world.union.founder.invite',v_app.unity_organization_id,
    v_app.lead_country_id,null,'union-recognition',v_app.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.union.recognition.invite_founder','R2',
    jsonb_build_object('organizationId',v_app.unity_organization_id,
      'countryId',v_app.lead_country_id,'subjectType','world_union_recognition',
      'subjectId',v_app.id),
    jsonb_build_object('applicationId',v_app.id,'countryId',p_country_id,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select * into v_app from public.world_union_recognition_applications
  where id=p_application_id for update;
  if v_app.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_app.status <> 'collecting_founders' or p_country_id=v_app.lead_country_id
    or not exists (select 1 from public.countries c where c.id=p_country_id)
    or (select count(*) from public.world_union_recognition_founders f
      where f.application_id=p_application_id) >= 100 then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;
  perform 1 from public.country_accounts ca
  where ca.user_id=auth.uid() and ca.country_id=v_app.lead_country_id
    and ca.status='active'
  for share;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  insert into public.world_union_recognition_founders(application_id,country_id)
  values(p_application_id,p_country_id);
  update public.world_union_recognition_applications
  set revision=revision+1,updated_at=now()
  where id=p_application_id;
  insert into public.world_union_recognition_actions(
    application_id,action,actor_user_id,subject_country_id,operation_id,revision
  ) values (
    p_application_id,'founder_invited',auth.uid(),p_country_id,
    v_operation_id,v_app.revision+1
  );
  perform private.v3_emit_domain_event(
    'world.union.founder_invited','world_union_recognition',
    p_application_id::text,v_app.revision+1,v_operation_id,null,null,
    jsonb_build_object('applicationId',p_application_id,'countryId',p_country_id,
      'revision',v_app.revision+1),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'applicationId',p_application_id,
    'status','collecting_founders','revision',v_app.revision+1,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $invite$;

create function public.world_respond_union_founder_v1(
  p_application_id uuid,
  p_country_id uuid,
  p_accept boolean,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $respond$
declare
  v_app public.world_union_recognition_applications%rowtype;
  v_founder public.world_union_recognition_founders%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_receipt jsonb;
  v_accepted_count integer;
begin
  if auth.uid() is null or p_application_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_country_id is null or p_accept is null or p_expected_revision is null
    or p_expected_revision<1 or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select * into v_app from public.world_union_recognition_applications
  where id=p_application_id;
  if not found or not public.world_access_allowed(
    'world.union.founder.respond',v_app.unity_organization_id,p_country_id,
    null,'union-recognition',v_app.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.union.recognition.respond_founder','R2',
    jsonb_build_object('organizationId',v_app.unity_organization_id,
      'countryId',p_country_id,'subjectType','world_union_recognition',
      'subjectId',v_app.id),
    jsonb_build_object('applicationId',v_app.id,'countryId',p_country_id,
      'accept',p_accept,'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  select * into v_app from public.world_union_recognition_applications
  where id=p_application_id for update;
  if v_app.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_app.status <> 'collecting_founders' then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;
  select * into v_founder from public.world_union_recognition_founders
  where application_id=p_application_id and country_id=p_country_id
  for update;
  if not found or v_founder.status <> 'invited' then
    raise exception using errcode='23514',message='INVITATION_UNAVAILABLE';
  end if;
  perform 1 from public.country_accounts ca
  where ca.user_id=auth.uid() and ca.country_id=p_country_id and ca.status='active'
  for share;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  update public.world_union_recognition_founders
  set status=case when p_accept then 'accepted' else 'declined' end,
    responded_at=now(),responded_by_user_id=auth.uid()
  where id=v_founder.id;
  update public.world_union_recognition_applications
  set revision=revision+1,updated_at=now()
  where id=p_application_id;
  select count(*) into v_accepted_count
  from public.world_union_recognition_founders
  where application_id=p_application_id and status='accepted';

  insert into public.world_union_recognition_actions(
    application_id,action,actor_user_id,subject_country_id,operation_id,revision
  ) values (
    p_application_id,case when p_accept then 'founder_accepted' else 'founder_declined' end,
    auth.uid(),p_country_id,v_operation_id,v_app.revision+1
  );
  perform private.v3_emit_domain_event(
    'world.union.founder_responded','world_union_recognition',
    p_application_id::text,v_app.revision+1,v_operation_id,null,null,
    jsonb_build_object('applicationId',p_application_id,'countryId',p_country_id,
      'accepted',p_accept,'acceptedFounderCount',v_accepted_count,
      'revision',v_app.revision+1),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'applicationId',p_application_id,
    'status','collecting_founders','revision',v_app.revision+1,
    'acceptedFounderCount',v_accepted_count,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_receipt);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $respond$;

revoke all on function public.world_start_union_recognition_v1(
  uuid,uuid,text,text,text,text,text,boolean,uuid,text,uuid)
from public,anon,authenticated;
revoke all on function public.world_invite_union_founder_v1(uuid,uuid,bigint,uuid,text,uuid)
from public,anon,authenticated;
revoke all on function public.world_respond_union_founder_v1(
  uuid,uuid,boolean,bigint,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.world_start_union_recognition_v1(
  uuid,uuid,text,text,text,text,text,boolean,uuid,text,uuid)
to authenticated,service_role;
grant execute on function public.world_invite_union_founder_v1(uuid,uuid,bigint,uuid,text,uuid)
to authenticated,service_role;
grant execute on function public.world_respond_union_founder_v1(
  uuid,uuid,boolean,bigint,uuid,text,uuid)
to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
