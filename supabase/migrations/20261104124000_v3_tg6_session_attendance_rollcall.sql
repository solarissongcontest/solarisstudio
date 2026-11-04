begin;

-- TG6 institutional roll-call. Attendance is a procedural fact only. It is
-- NOT a voter eligibility snapshot, ballot, proxy approval, quorum decision,
-- or independent representation identity.
create table public.world_session_attendance (
  session_id uuid not null references public.world_sessions(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  representation_id uuid not null
    references public.world_organization_representations(id) on delete restrict,
  status text not null,
  proxy_id uuid references public.world_representation_proxies(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (session_id,country_id),
  constraint world_session_attendance_status_check
    check (status in ('present','absent','proxy')),
  constraint world_session_attendance_proxy_pair_check
    check ((status = 'proxy') = (proxy_id is not null)),
  constraint world_session_attendance_revision_check check (revision >= 1)
);
create index world_session_attendance_representation_idx
  on public.world_session_attendance(representation_id,session_id);

alter table public.world_session_attendance enable row level security;
revoke all on table public.world_session_attendance
  from public,anon,authenticated,service_role;
grant all on table public.world_session_attendance to service_role;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values ('world.session.attendance.manage','world','Manage institutional roll call',
  'Record session attendance for authorized countries, with bounded approved proxy evidence.','operate')
on conflict (key) do nothing;

-- Same approved institutional operators as existing TG6 session management;
-- never infer permissions from a frontend-facing title.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id,'world.session.attendance.manage'
from public.world_organization_offices office_row
join public.world_organizations organization_row
  on organization_row.id=office_row.organization_id
join (values ('guard','chairperson'),('unity','secretary-general'))
  officer(organization_slug,office_slug)
  on officer.organization_slug=organization_row.slug
 and officer.office_slug=office_row.slug
on conflict do nothing;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg6.world-session-attendance',
      1,'forward_fix_only',false,null,
      'TG6 scoped, receipted institutional attendance with one status per member country/session, optional proven time-effective approved proxy, revision CAS and private bounded projections; not electoral quorum or ballot authority.'
    );
  end if;
end
$contract$;

create or replace function public.world_record_session_attendance_v1(
  p_session_id uuid,
  p_country_id uuid,
  p_representation_id uuid,
  p_status text,
  p_proxy_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $record$
declare
  v_session public.world_sessions%rowtype;
  v_rep public.world_organization_representations%rowtype;
  v_existing public.world_session_attendance%rowtype;
  v_proxy public.world_representation_proxies%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_new_revision bigint;
  v_result jsonb;
begin
  if auth.uid() is null or p_session_id is null or p_country_id is null
     or p_representation_id is null or p_operation_id is null
     or p_idempotency_key is null
  then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_status is null or p_status not in ('present','absent','proxy')
     or (p_status='proxy') is distinct from (p_proxy_id is not null)
  then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  -- Single session row lock serializes all attendance writes and prevents
  -- concurrent conflicting insert/update revision paths for the same meeting.
  select * into v_session from public.world_sessions
  where id=p_session_id for update;
  if v_session.id is null or not public.world_access_allowed(
    'world.session.attendance.manage',
    v_session.organization_id,null,v_session.organ_id,
    'session',v_session.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  select * into v_rep
  from public.world_organization_representations
  where id=p_representation_id for share;
  if v_rep.id is null
     or v_rep.organization_id <> v_session.organization_id
     or v_rep.country_id <> p_country_id
     or v_rep.role <> 'representative'
  then
    raise exception using errcode='23514',message='INVALID_REPRESENTATION';
  end if;

  -- Claim before changing revisions or session/member/proxy time-dependent
  -- state, so lost responses remain reconcilable after session closure.
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.session.attendance.record','R2',
    jsonb_build_object('sessionId',p_session_id,'countryId',p_country_id,
      'organizationId',v_session.organization_id,
      'subjectType','world_session_attendance'),
    jsonb_build_object('representationId',p_representation_id,
      'status',p_status,'proxyId',p_proxy_id,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  if v_session.status not in ('open','recessed')
     or v_session.ends_at <= now()
     or v_rep.ends_at is not null
     or not exists (
       select 1 from public.world_organization_memberships member_row
       where member_row.organization_id=v_session.organization_id
         and member_row.country_id=p_country_id
         and member_row.status in ('member','observer','associate')
         and (member_row.status <> 'member' or v_rep.voting_authority)
         and member_row.ended_at is null
     )
  then
    raise exception using errcode='23514',message='SESSION_OR_MEMBER_NOT_ELIGIBLE';
  end if;

  if p_status='proxy' then
    select * into v_proxy from public.world_representation_proxies
    where id=p_proxy_id and representation_id=v_rep.id for share;
    if v_proxy.id is null or not v_rep.voting_authority
       or v_proxy.revoked_at is not null
       or (v_proxy.session_id is not null and v_proxy.session_id <> p_session_id)
       or not private.world_proxy_is_effective(
         v_proxy.status,v_proxy.valid_from,v_proxy.valid_until,now()
       )
    then
      raise exception using errcode='23514',message='PROXY_NOT_EFFECTIVE';
    end if;
    if not exists (
      select 1 from public.world_organization_memberships member_row
      where member_row.organization_id=v_session.organization_id
        and member_row.country_id=p_country_id
        and member_row.status='member'
        and member_row.ended_at is null
    ) then
      raise exception using errcode='23514',message='PROXY_NOT_ELIGIBLE';
    end if;
  end if;

  select * into v_existing from public.world_session_attendance
  where session_id=p_session_id and country_id=p_country_id for update;
  if v_existing.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;

  if v_existing.session_id is null then
    insert into public.world_session_attendance(
      session_id,country_id,representation_id,status,proxy_id,recorded_at,revision
    ) values (
      p_session_id,p_country_id,p_representation_id,p_status,p_proxy_id,now(),1
    );
    v_new_revision := 1;
  else
    update public.world_session_attendance
    set representation_id=p_representation_id,status=p_status,
        proxy_id=p_proxy_id,recorded_at=now(),revision=revision+1
    where session_id=p_session_id and country_id=p_country_id;
    v_new_revision := v_existing.revision+1;
  end if;

  perform private.v3_emit_domain_event(
    'world.session.attendance.recorded','world_session_attendance',
    p_session_id::text || ':' || p_country_id::text,
    v_new_revision,v_operation_id,null,null,
    jsonb_build_object('sessionId',p_session_id,'countryId',p_country_id,
      'representationId',p_representation_id,'status',p_status,
      'proxyId',p_proxy_id,'revision',v_new_revision),
    1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,
    'sessionId',p_session_id,'countryId',p_country_id,
    'status',p_status,'proxyId',p_proxy_id,
    'revision',v_new_revision,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$record$;

-- The private editor lists only known members with current representation,
-- available APPROVED and time-effective proxies for THIS meeting, and the one
-- existing attendance row per country. It never exposes raw login IDs, reasons
-- for private proxy nominations, or any electoral eligibility/quorum verdict.
create or replace function public.world_session_attendance_manage_v1(
  p_session_id uuid
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog
as $manage$
declare
  v_session public.world_sessions%rowtype;
  v_countries jsonb;
begin
  if auth.uid() is null or p_session_id is null then return null; end if;
  select * into v_session from public.world_sessions
    where id=p_session_id;
  if v_session.id is null or not public.world_access_allowed(
    'world.session.attendance.manage',
    v_session.organization_id,null,v_session.organ_id,
    'session',v_session.id
  ) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'countryId',member.country_id,
    'countryName',member.country_name,
    'membershipStatus',member.membership_status,
    'representationId',member.representation_id,
    'representativeName',member.representative_name,
    'attendance',member.attendance,
    'proxies',member.proxies
  ) order by member.country_name,member.country_id),'[]'::jsonb)
  into v_countries
  from (
    select country_row.id as country_id,country_row.name as country_name,
      membership_row.status as membership_status,
      rep.id as representation_id,
      rep_person.display_name as representative_name,
      case when attendance.session_id is null then null
        else jsonb_build_object('status',attendance.status,
          'proxyId',attendance.proxy_id,
          'revision',attendance.revision,
          'recordedAt',attendance.recorded_at)
      end as attendance,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,
          'proxyPersonId',p.proxy_person_id,
          'proxyPersonName',proxy_person.display_name,
          'validFrom',p.valid_from,'validUntil',p.valid_until
        ) order by p.valid_until,p.id)
        from (
          select *
          from public.world_representation_proxies p
          where p.representation_id=rep.id
            and (p.session_id is null or p.session_id=v_session.id)
            and p.revoked_at is null
            and private.world_proxy_is_effective(
              p.status,p.valid_from,p.valid_until,now()
            )
          order by p.valid_until,p.id
          limit 5
        ) p
        join public.delegation_people proxy_person
          on proxy_person.id=p.proxy_person_id
      ),'[]'::jsonb) as proxies
    from public.world_organization_memberships membership_row
    join public.countries country_row on country_row.id=membership_row.country_id
    join lateral (
      select candidate.*
      from public.world_organization_representations candidate
      where candidate.organization_id=membership_row.organization_id
        and candidate.country_id=membership_row.country_id
        and candidate.ends_at is null
        and candidate.role='representative'
        and (membership_row.status <> 'member' or candidate.voting_authority)
      order by candidate.voting_authority desc,
        candidate.starts_at desc,candidate.id desc
      limit 1
    ) rep on true
    join public.delegation_people rep_person on rep_person.id=rep.person_id
    left join public.world_session_attendance attendance
      on attendance.session_id=v_session.id
     and attendance.country_id=country_row.id
    where membership_row.organization_id=v_session.organization_id
      and membership_row.ended_at is null
      and membership_row.status in ('member','observer','associate')
    order by country_row.name,country_row.id
    limit 100
  ) member;

  return jsonb_build_object(
    'sessionId',v_session.id,
    'organizationId',v_session.organization_id,
    'organId',v_session.organ_id,
    'title',v_session.title,
    'status',v_session.status,
    'revision',v_session.revision,
    'countries',v_countries
  );
end
$manage$;

-- Active country controller may inspect their own one row. No cross-country
-- list access, and a representative without country control sees nothing here.
create or replace function public.world_my_session_attendance_v1(
  p_session_id uuid,p_country_id uuid
)
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $mine$
  select case when auth.uid() is null or p_session_id is null or p_country_id is null
      or not exists (
        select 1 from public.country_accounts country_account
        where country_account.country_id=p_country_id
          and country_account.user_id=auth.uid()
          and country_account.status='active'
      ) then null
    else (
      select jsonb_build_object(
        'sessionId',attendance.session_id,
        'countryId',attendance.country_id,
        'representationId',attendance.representation_id,
        'status',attendance.status,
        'proxyId',attendance.proxy_id,
        'revision',attendance.revision,
        'recordedAt',attendance.recorded_at
      )
      from public.world_session_attendance attendance
      where attendance.session_id=p_session_id
        and attendance.country_id=p_country_id
    )
  end
$mine$;

revoke all on function public.world_record_session_attendance_v1(
  uuid,uuid,uuid,text,uuid,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_record_session_attendance_v1(
  uuid,uuid,uuid,text,uuid,bigint,uuid,text,uuid
) to authenticated,service_role;
revoke all on function public.world_session_attendance_manage_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_session_attendance_manage_v1(uuid)
  to authenticated,service_role;
revoke all on function public.world_my_session_attendance_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.world_my_session_attendance_v1(uuid,uuid)
  to authenticated,service_role;

comment on table public.world_session_attendance is
  'TG6 procedural attendance only. One row per session/country with optional approved time-effective proxy; this does NOT determine voting eligibility or quorum.';
comment on function public.world_record_session_attendance_v1(
  uuid,uuid,uuid,text,uuid,bigint,uuid,text,uuid
) is
  'TG6 receipted and revision-bound meeting roll-call mutation for a scoped institutional attendance officer; never issues a ballot.';
comment on function public.world_session_attendance_manage_v1(uuid) is
  'TG6 manager-only 100-country attendance and approved current proxy projection; no private user IDs and no election-result authority.';

notify pgrst,'reload schema';
commit;
