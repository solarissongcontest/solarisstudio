begin;

-- TG6 proxy commands. A proxy is a bounded acting identity, never a second
-- delegation/organization membership and never an independent voting right.
-- This follows TG2 representation identity and TG6 institutional sessions.
alter table public.world_representation_proxies
  add column if not exists approved_at timestamptz;

alter table public.world_representation_proxies
  add constraint world_proxy_session_id_fk
  foreign key (session_id) references public.world_sessions(id)
  on update restrict on delete restrict;

create index if not exists world_proxy_representation_window_idx
  on public.world_representation_proxies(representation_id, valid_from, valid_until)
  where status in ('requested','approved');

-- Approval authority must also include a narrow read of pending proxy rows.
-- TG2's legacy proxy SELECT policy grants representatives and private-view
-- managers, but not an institutional reviewer with only world.proxy.approve.
-- This internal boolean helper uses a definer boundary so a private parent
-- representation does not disappear behind unrelated table SELECT RLS.
create or replace function private.world_proxy_review_read_allowed_v1(
  p_representation_id uuid,
  p_session_id uuid,
  p_proxy_id uuid
)
returns boolean language sql stable security definer
set search_path = pg_catalog
as $read_allowed$
  select coalesce(
    auth.uid() is not null
    and p_representation_id is not null
    and p_proxy_id is not null
    and exists (
      select 1
      from public.world_organization_representations rep_row
      left join public.world_sessions session_row
        on session_row.id=p_session_id
       and session_row.organization_id=rep_row.organization_id
      where rep_row.id=p_representation_id
        and (p_session_id is null or session_row.id is not null)
        and public.world_access_allowed(
          'world.proxy.approve',
          rep_row.organization_id,rep_row.country_id,
          session_row.organ_id,'proxy',p_proxy_id
        )
    ),
    false
  )
$read_allowed$;

revoke all on function private.world_proxy_review_read_allowed_v1(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.world_proxy_review_read_allowed_v1(uuid,uuid,uuid)
  to authenticated,service_role;

drop policy if exists world_proxies_reviewer_scoped_read
  on public.world_representation_proxies;
create policy world_proxies_reviewer_scoped_read
on public.world_representation_proxies for select to authenticated
using (
  private.world_proxy_review_read_allowed_v1(representation_id,session_id,id)
);

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg6.world-proxy-request-decision',
      1, 'forward_fix_only', false, null,
      'Country-controller/representative proxy request and institutional approval/rejection: exact representation, optional same-organization session, bounded time, revision CAS, operation receipt, serialized overlap protection and non-sensitive domain events.'
    );
  end if;
end
$contract$;

create or replace function public.world_request_proxy_v1(
  p_representation_id uuid,
  p_proxy_person_id uuid,
  p_session_id uuid,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text,
  p_expected_representation_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $request$
declare
  v_actor uuid := auth.uid();
  v_rep public.world_organization_representations%rowtype;
  v_session public.world_sessions%rowtype;
  v_actor_person_id uuid;
  v_proxy_user_id uuid;
  v_operation jsonb;
  v_operation_id uuid;
  v_proxy_id uuid;
  v_result jsonb;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if v_actor is null or p_representation_id is null
     or p_proxy_person_id is null or p_expected_representation_revision is null
     or p_operation_id is null or p_idempotency_key is null
  then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  -- Row lock serializes concurrent proxy requests for one representation.
  select * into v_rep
  from public.world_organization_representations
  where id=p_representation_id for update;

  if v_rep.id is null
     or v_rep.ends_at is not null
     or not v_rep.voting_authority
     or not (v_rep.user_id = v_actor or exists (
       select 1 from public.country_accounts account_row
       where account_row.country_id=v_rep.country_id
         and account_row.user_id=v_actor
         and account_row.status='active'
     ))
     or not public.world_access_allowed(
       'world.proxy.request',
       v_rep.organization_id,v_rep.country_id,null,
       'representation',v_rep.id
     )
  then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  if p_session_id is not null then
    select * into v_session from public.world_sessions
    where id=p_session_id for share;
    if v_session.id is null
       or v_session.organization_id <> v_rep.organization_id
    then
      raise exception using errcode='23514',message='SESSION_NOT_ELIGIBLE';
    end if;
  end if;

  if p_valid_from is null or p_valid_until is null
     or p_valid_until <= p_valid_from
     or p_valid_until - p_valid_from > interval '14 days'
     or length(v_reason) not between 5 and 500
     or p_proxy_person_id = v_rep.person_id
     or (p_session_id is not null and (
       p_valid_from < v_session.starts_at
       or p_valid_until > v_session.ends_at
     ))
  then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  v_operation := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.proxy.request','R2',
    jsonb_build_object(
      'representationId',v_rep.id,
      'organizationId',v_rep.organization_id,
      'countryId',v_rep.country_id,
      'subjectType','world_proxy'
    ),
    jsonb_build_object(
      'proxyPersonId',p_proxy_person_id,
      'sessionId',p_session_id,
      'validFrom',p_valid_from,
      'validUntil',p_valid_until,
      'reason',v_reason,
      'expectedRepresentationRevision',p_expected_representation_revision
    )
  );
  v_operation_id := (v_operation->>'operationId')::uuid;
  if coalesce((v_operation->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Current-time/membership checks belong AFTER receipt claim so that a
  -- successful request can be safely replayed after its validity window.
  if p_valid_until <= now()
     or p_valid_from < now() - interval '5 minutes'
     or p_valid_from > now() + interval '1 year'
     or (p_session_id is not null and v_session.status not in ('scheduled','open','recessed'))
     or not exists (
       select 1 from public.delegation_people person_row
       where person_row.id=p_proxy_person_id
     )
     or not exists (
       select 1 from public.world_organization_memberships member_row
       where member_row.organization_id=v_rep.organization_id
         and member_row.country_id=v_rep.country_id
         and member_row.ended_at is null
         and member_row.status='member'
     )
  then
    raise exception using errcode='23514',message='NOT_ELIGIBLE';
  end if;

  if v_rep.revision is distinct from p_expected_representation_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;

  if exists (
    select 1 from public.world_representation_proxies existing
    where existing.representation_id=v_rep.id
      and existing.status in ('requested','approved')
      and existing.revoked_at is null
      and existing.valid_from < p_valid_until
      and p_valid_from < existing.valid_until
  ) then
    raise exception using errcode='23505',message='PROXY_ALREADY_PENDING';
  end if;

  -- Never trust a browser-supplied auth-user/person mapping. An optional proxy
  -- login is linked only when current canonical country control proves it.
  select term_row.user_id into v_proxy_user_id
  from public.world_country_control_terms term_row
  join public.country_accounts account_row
    on account_row.country_id=term_row.country_id
   and account_row.user_id=term_row.user_id
   and account_row.status='active'
  where term_row.person_id=p_proxy_person_id
    and term_row.ended_at is null
    and term_row.user_id is not null
  order by term_row.started_at desc, term_row.id desc
  limit 1;

  select term_row.person_id into v_actor_person_id
  from public.world_country_control_terms term_row
  where term_row.country_id=v_rep.country_id
    and term_row.user_id=v_actor
    and term_row.ended_at is null
  limit 1;
  if v_actor_person_id is null and v_rep.user_id=v_actor then
    v_actor_person_id := v_rep.person_id;
  end if;

  insert into public.world_representation_proxies (
    representation_id,proxy_person_id,proxy_user_id,session_id,
    valid_from,valid_until,reason,status,requested_by_person_id
  ) values (
    v_rep.id,p_proxy_person_id,v_proxy_user_id,p_session_id,
    p_valid_from,p_valid_until,v_reason,'requested',v_actor_person_id
  ) returning id into v_proxy_id;

  -- No private reason, login identifier or voter credentials in public events.
  perform private.v3_emit_domain_event(
    'world.proxy.requested','world_proxy',v_proxy_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('proxyId',v_proxy_id,'representationId',v_rep.id,
      'organizationId',v_rep.organization_id,'countryId',v_rep.country_id,
      'sessionId',p_session_id,'status','requested'),
    1,array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok',true,'proxyId',v_proxy_id,'representationId',v_rep.id,
    'status','requested','revision',1,'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$request$;

create or replace function public.world_approve_proxy_v1(
  p_proxy_id uuid,
  p_target_status text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $decide$
declare
  v_actor uuid := auth.uid();
  v_proxy public.world_representation_proxies%rowtype;
  v_rep public.world_organization_representations%rowtype;
  v_representation_id uuid;
  v_organ_id uuid;
  v_approver_person_id uuid;
  v_operation jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if v_actor is null or p_proxy_id is null or p_expected_revision is null
     or p_operation_id is null or p_idempotency_key is null
  then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_target_status not in ('approved','rejected') or p_target_status is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  -- Lock in consistent order to prevent concurrent approvals for overlapping
  -- proxies on the same representation. Never use per-proxy locks alone.
  select representation_id into v_representation_id
  from public.world_representation_proxies where id=p_proxy_id;
  if v_representation_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  select * into v_rep
  from public.world_organization_representations
  where id=v_representation_id for update;
  select * into v_proxy
  from public.world_representation_proxies
  where id=p_proxy_id and representation_id=v_rep.id for update;
  if v_proxy.id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  if v_proxy.session_id is not null then
    select session_row.organ_id into v_organ_id
    from public.world_sessions session_row
    where session_row.id=v_proxy.session_id
      and session_row.organization_id=v_rep.organization_id
      and session_row.status in ('scheduled','open','recessed');
  end if;

  if not public.world_access_allowed(
    'world.proxy.approve',v_rep.organization_id,v_rep.country_id,
    v_organ_id,'proxy',v_proxy.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_operation := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.proxy.decide','R2',
    jsonb_build_object('proxyId',v_proxy.id,
      'representationId',v_rep.id,'organizationId',v_rep.organization_id,
      'countryId',v_rep.country_id,'subjectType','world_proxy'),
    jsonb_build_object('targetStatus',p_target_status,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_operation->>'operationId')::uuid;
  if coalesce((v_operation->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  if v_proxy.revision <> p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_proxy.status <> 'requested' or v_proxy.revoked_at is not null then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;

  if p_target_status='approved' then
    if v_proxy.valid_until <= now()
       or v_rep.ends_at is not null
       or not v_rep.voting_authority
       or (v_proxy.session_id is not null and v_organ_id is null)
       or not exists (
         select 1 from public.world_organization_memberships member_row
         where member_row.organization_id=v_rep.organization_id
           and member_row.country_id=v_rep.country_id
           and member_row.status='member' and member_row.ended_at is null
       )
    then
      raise exception using errcode='23514',message='NOT_ELIGIBLE';
    end if;

    if exists (
      select 1 from public.world_representation_proxies other_proxy
      where other_proxy.representation_id=v_rep.id
        and other_proxy.id <> v_proxy.id
        and other_proxy.status='approved'
        and other_proxy.revoked_at is null
        and other_proxy.valid_from < v_proxy.valid_until
        and v_proxy.valid_from < other_proxy.valid_until
    ) then
      raise exception using errcode='23505',message='OVERLAPPING_APPROVED_PROXY';
    end if;
  end if;

  select holder.holder_person_id into v_approver_person_id
  from public.world_office_terms holder
  join public.world_organization_offices office_row
    on office_row.id=holder.office_id
   and office_row.organization_id=v_rep.organization_id
  join public.world_office_capabilities permission_row
    on permission_row.office_id=office_row.id
   and permission_row.capability='world.proxy.approve'
  where holder.holder_user_id=v_actor
    and holder.status='active' and holder.actual_end_at is null
  order by holder.started_at desc,holder.id desc
  limit 1;

  update public.world_representation_proxies
  set status=p_target_status,
      approved_at=case when p_target_status='approved' then now() else null end,
      approved_by_person_id=v_approver_person_id,
      revision=revision+1
  where id=v_proxy.id;

  perform private.v3_emit_domain_event(
    case when p_target_status='approved' then 'world.proxy.approved'
         else 'world.proxy.rejected' end,
    'world_proxy',v_proxy.id::text,v_proxy.revision+1,
    v_operation_id,null,null,
    jsonb_build_object('proxyId',v_proxy.id,'representationId',v_rep.id,
      'organizationId',v_rep.organization_id,'countryId',v_rep.country_id,
      'status',p_target_status),
    1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'proxyId',v_proxy.id,
    'status',p_target_status,'revision',v_proxy.revision+1,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$decide$;

-- A bounded reviewer inbox must filter EACH item using its exact institutional
-- scope. Checking the organization once would leak country-/object-granted
-- private proxy requests.
create or replace function public.world_proxy_review_queue_v1(p_organization_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog
as $review_queue$
  select case when auth.uid() is null or p_organization_id is null then null
    else jsonb_build_object(
      'organizationId',p_organization_id,
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',item.id,
          'representationId',item.representation_id,
          'countryId',item.country_id,
          'proxyPersonId',item.proxy_person_id,
          'proxyPersonName',item.proxy_name,
          'sessionId',item.session_id,
          'sessionTitle',item.session_title,
          'validFrom',item.valid_from,
          'validUntil',item.valid_until,
          'reason',item.reason,
          'status',item.status,
          'revision',item.revision,
          'createdAt',item.created_at
        ) order by item.created_at,item.id)
        from (
          select p.id,p.representation_id,p.proxy_person_id,
            rep.country_id,person_row.display_name as proxy_name,
            p.session_id,session_row.title as session_title,
            p.valid_from,p.valid_until,p.reason,p.status,p.revision,p.created_at
          from public.world_representation_proxies p
          join public.world_organization_representations rep
            on rep.id=p.representation_id
          join public.delegation_people person_row on person_row.id=p.proxy_person_id
          left join public.world_sessions session_row
            on session_row.id=p.session_id
           and session_row.organization_id=rep.organization_id
          where rep.organization_id=p_organization_id
            and p.status='requested'
            and p.valid_until > now()
            and (p.session_id is null or session_row.id is not null)
            and public.world_access_allowed(
              'world.proxy.approve',
              rep.organization_id,rep.country_id,session_row.organ_id,'proxy',p.id
            )
          order by p.created_at,p.id
          limit 25
        ) item
      ),'[]'::jsonb)
    )
  end
$review_queue$;

create or replace function public.world_my_proxy_requests_v1(p_country_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog
as $my_proxies$
  select case
    when auth.uid() is null or p_country_id is null
      or not exists (
        select 1 from public.country_accounts account_row
        where account_row.country_id=p_country_id
          and account_row.user_id=auth.uid()
          and account_row.status='active'
      )
    then null
    else jsonb_build_object(
      'countryId',p_country_id,
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',item.id,
          'organizationId',item.organization_id,
          'organizationName',item.organization_name,
          'representationId',item.representation_id,
          'proxyPersonId',item.proxy_person_id,
          'proxyPersonName',item.proxy_name,
          'sessionId',item.session_id,
          'sessionTitle',item.session_title,
          'validFrom',item.valid_from,
          'validUntil',item.valid_until,
          'reason',item.reason,
          'status',item.status,
          'revision',item.revision,
          'createdAt',item.created_at,
          'approvedAt',item.approved_at,
          'timeEffective',private.world_proxy_is_effective(
            item.status,item.valid_from,item.valid_until,now()
          )
        ) order by item.created_at desc,item.id desc)
        from (
          select p.id,rep.organization_id,org.short_name as organization_name,
            p.representation_id,p.proxy_person_id,
            person_row.display_name as proxy_name,
            p.session_id,session_row.title as session_title,
            p.valid_from,p.valid_until,p.reason,p.status,p.revision,
            p.created_at,p.approved_at
          from public.world_representation_proxies p
          join public.world_organization_representations rep
            on rep.id=p.representation_id
          join public.world_organizations org on org.id=rep.organization_id
          join public.delegation_people person_row on person_row.id=p.proxy_person_id
          left join public.world_sessions session_row
            on session_row.id=p.session_id
           and session_row.organization_id=rep.organization_id
          where rep.country_id=p_country_id
          order by p.created_at desc,p.id desc
          limit 20
        ) item
      ),'[]'::jsonb)
    )
  end
$my_proxies$;

revoke all on function public.world_proxy_review_queue_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_proxy_review_queue_v1(uuid)
  to authenticated,service_role;
revoke all on function public.world_my_proxy_requests_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_my_proxy_requests_v1(uuid)
  to authenticated,service_role;

comment on function public.world_proxy_review_queue_v1(uuid) is
  'TG6 maximum 25 reviewable proxy requests; item-by-item canonical world.proxy.approve check, no raw login identifiers and no cross-organization session leakage.';
comment on function public.world_my_proxy_requests_v1(uuid) is
  'TG6 latest 20 proxy requests for an active country controller; no other country histories or auth-user IDs. timeEffective is only a time window indicator, not an authorization to cast a ballot.';

revoke all on function public.world_request_proxy_v1(
  uuid,uuid,uuid,timestamptz,timestamptz,text,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_request_proxy_v1(
  uuid,uuid,uuid,timestamptz,timestamptz,text,bigint,uuid,text,uuid
) to authenticated,service_role;

revoke all on function public.world_approve_proxy_v1(
  uuid,text,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_approve_proxy_v1(
  uuid,text,bigint,uuid,text,uuid
) to authenticated,service_role;

comment on function public.world_request_proxy_v1(
  uuid,uuid,uuid,timestamptz,timestamptz,text,bigint,uuid,text,uuid
) is 'TG6 receipted proxy request; only an active representative/controlled country can request a bounded, identity-proven acting proxy. Does not grant voting rights.';
comment on function public.world_approve_proxy_v1(
  uuid,text,bigint,uuid,text,uuid
) is 'TG6 institutionally authorized, revision-bound proxy approval/rejection with serialized overlapping-proxy prevention. Approval is not a second country vote.';

notify pgrst,'reload schema';
commit;
