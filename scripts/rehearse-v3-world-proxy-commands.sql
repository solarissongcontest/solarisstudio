\set ON_ERROR_STOP on
-- TG6 proxy negative authorization/receipt/overlap rehearsal.
-- Must execute only against a disposable LOCAL Supabase database.
begin;

do $seed$
declare
  v_owner uuid := gen_random_uuid();
  v_chair uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_owner_person uuid := gen_random_uuid();
  v_chair_person uuid := gen_random_uuid();
  v_proxy_person uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_organ uuid := gen_random_uuid();
  v_other_organ uuid := gen_random_uuid();
  v_office uuid := gen_random_uuid();
  v_rep uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_foreign_session uuid := gen_random_uuid();
  v_start timestamptz := now() + interval '1 day 10 minutes';
  v_end timestamptz := now() + interval '1 day 50 minutes';
begin
  if to_regprocedure('public.world_request_proxy_v1(uuid,uuid,uuid,timestamptz,timestamptz,text,bigint,uuid,text,uuid)') is null
     or to_regprocedure('public.world_approve_proxy_v1(uuid,text,bigint,uuid,text,uuid)') is null
  then
    raise exception 'TG6_PROXY_COMMANDS_MISSING';
  end if;

  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (v_owner,'authenticated','authenticated',v_owner::text || '@tg6-proxy.invalid',now(),now()),
    (v_chair,'authenticated','authenticated',v_chair::text || '@tg6-proxy.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg6-proxy.invalid',now(),now());

  insert into public.delegation_people(id,display_name,identity_key) values
    (v_owner_person,'TG6 Proxy Controller','tg6-proxy:' || v_owner_person::text),
    (v_chair_person,'TG6 Proxy Chair','tg6-proxy:' || v_chair_person::text),
    (v_proxy_person,'TG6 Proxy Substitute','tg6-proxy:' || v_proxy_person::text);
  insert into public.countries(id,name,short_code)
    values(v_country,'TG6 Proxy Country','ZZR');
  insert into public.country_accounts(user_id,country_id,status)
    values(v_owner,v_country,'active');

  -- Historical delegate is explicitly proven for this country. Neither a
  -- foreign country's representative nor an invented lore identity qualifies.
  insert into public.world_country_control_terms
    (country_id,person_id,user_id,started_at,ended_at,source,revision)
  values
    (v_country,v_proxy_person,null,now()-interval '90 days',
      now()-interval '60 days','tg6_rollback_fixture',1),
    (v_country,v_owner_person,v_owner,now(),null,'tg6_rollback_fixture',2);

  insert into public.world_organizations
    (id,slug,official_name,short_name,type,status,public_visibility)
  values
    (v_org,'tg6-proxy-' || replace(v_org::text,'-',''),'TG6 Proxy Institution','TG6 Proxy','international_organization','active','public'),
    (v_other_org,'tg6-proxy-' || replace(v_other_org::text,'-',''),'Other TG6 Proxy Institution','Other TG6','international_organization','active','public');

  insert into public.world_organization_organs
    (id,organization_id,slug,name,visibility,status)
  values
    (v_organ,v_org,'assembly','TG6 Assembly','public','active'),
    (v_other_organ,v_other_org,'assembly','Other TG6 Assembly','public','active');
  insert into public.world_organization_memberships
    (organization_id,country_id,membership_type,status)
  values(v_org,v_country,'member','member');

  insert into public.world_organization_representations
    (id,organization_id,country_id,person_id,user_id,role,voting_authority,source,revision)
  values(v_rep,v_org,v_country,v_owner_person,v_owner,'representative',true,'tg6_rollback_fixture',1);

  insert into public.world_organization_offices
    (id,organization_id,slug,title,office_type,appointment_method)
  values(v_office,v_org,'chair','TG6 Proxy Chair','executive_leader','appointment');
  insert into public.world_office_terms
    (office_id,holder_person_id,holder_user_id,represented_country_id,started_at,term_kind,status)
  values(v_office,v_chair_person,v_chair,v_country,now(),'appointed','active');
  insert into public.world_office_capabilities(office_id,capability)
  values(v_office,'world.proxy.approve');

  insert into public.world_sessions
    (id,organization_id,organ_id,title,sequence_number,starts_at,ends_at,venue_type,status)
  values
    (v_session,v_org,v_organ,'TG6 Valid Session',1,now()+interval '1 day',now()+interval '1 day 2 hours','online','scheduled'),
    (v_foreign_session,v_other_org,v_other_organ,'TG6 Foreign Session',1,now()+interval '1 day',now()+interval '1 day 2 hours','online','scheduled');

  perform set_config('solaris.tg6_proxy_fixture',jsonb_build_object(
    'owner',v_owner,'chair',v_chair,'outsider',v_outsider,
    'organizationId',v_org,'countryId',v_country,
    'representationId',v_rep,'proxyPersonId',v_proxy_person,
    'sessionId',v_session,'foreignSessionId',v_foreign_session,
    'validFrom',v_start,'validUntil',v_end,
    'requestOperationId',gen_random_uuid()
  )::text,true);
end
$seed$;

set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
do $anon$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  begin
    perform public.world_request_proxy_v1(
      (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
      (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
      (v->>'validUntil')::timestamptz,'Proxy for committee session',1,
      gen_random_uuid(),'tg6-anon:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_ANON_REQUEST_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: TG6 anonymous request forbidden';
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $outsider$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_request_proxy_v1(
      (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
      (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
      (v->>'validUntil')::timestamptz,'Proxy for committee session',1,
      gen_random_uuid(),'tg6-outsider:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_UNRELATED_REQUEST_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  if exists (
    select 1 from public.world_representation_proxies
  ) or jsonb_array_length(
    coalesce(public.world_proxy_review_queue_v1((v->>'organizationId')::uuid)->'items','[]'::jsonb)
  ) <> 0
  then
    raise exception 'TG6_PROXY_UNAUTHORIZED_REVIEW_READ';
  end if;
  if public.world_my_proxy_requests_v1((v->>'countryId')::uuid) is not null then
    raise exception 'TG6_PROXY_UNAUTHORIZED_COUNTRY_PROJECTION';
  end if;
  raise notice 'PASS: TG6 outsider cannot request for another country';
end
$outsider$;

do $controller$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
  v_receipt jsonb;
  v_replayed jsonb;
  v_proxy_id uuid;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'owner','role','authenticated')::text,true);

  -- The session's foreign-organization linkage must be denied.
  begin
    perform public.world_request_proxy_v1(
      (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
      (v->>'foreignSessionId')::uuid,(v->>'validFrom')::timestamptz,
      (v->>'validUntil')::timestamptz,'Proxy for wrong institution',1,
      gen_random_uuid(),'tg6-cross-org:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_CROSS_ORG_SESSION_ALLOWED';
  exception when check_violation then null;
  end;

  v_receipt := public.world_request_proxy_v1(
    (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
    (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
    (v->>'validUntil')::timestamptz,'Proxy for committee session',1,
    (v->>'requestOperationId')::uuid,'tg6-proxy:' || (v->>'requestOperationId')
  );
  v_proxy_id := (v_receipt #>> '{result,proxyId}')::uuid;
  if v_receipt->>'status' <> 'succeeded'
     or v_proxy_id is null
     or v_receipt #>> '{result,status}' <> 'requested'
  then
    raise exception 'TG6_PROXY_REQUEST_RECEIPT_INCOMPLETE';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(
      public.world_my_proxy_requests_v1((v->>'countryId')::uuid)->'items'
    ) item
    where item->>'id'=v_proxy_id::text
      and item->>'status'='requested'
  ) then
    raise exception 'TG6_PROXY_CONTROLLER_PERSONAL_PROJECTION_MISSING';
  end if;

  v_replayed := public.world_request_proxy_v1(
    (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
    (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
    (v->>'validUntil')::timestamptz,'Proxy for committee session',1,
    (v->>'requestOperationId')::uuid,'tg6-proxy:' || (v->>'requestOperationId')
  );
  if v_replayed #>> '{result,proxyId}' is distinct from v_proxy_id::text
     or coalesce((v_replayed->>'replayed')::boolean,false) is not true
  then
    raise exception 'TG6_PROXY_REQUEST_REPLAY_UNSTABLE';
  end if;

  begin
    perform public.world_request_proxy_v1(
      (v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
      (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
      (v->>'validUntil')::timestamptz,'Duplicate pending proxy',1,
      gen_random_uuid(),'tg6-duplicate:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_OVERLAPPING_REQUEST_ALLOWED';
  exception when unique_violation then null;
  end;

  perform set_config('solaris.tg6_proxy_fixture',
    (v || jsonb_build_object('proxyId',v_proxy_id))::text,true);
  raise notice 'PASS: TG6 exact controller request, foreign session denial, receipt replay and duplicate request guard';
end
$controller$;

do $unauthorized_approval$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_approve_proxy_v1(
      (v->>'proxyId')::uuid,'approved',1,
      gen_random_uuid(),'tg6-bad-approval:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_UNAUTHORIZED_APPROVAL_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$unauthorized_approval$;

do $authorized_approval$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
  v_receipt jsonb;
  v_replayed jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'chair',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
  if not exists (
    select 1 from public.world_representation_proxies
    where id=(v->>'proxyId')::uuid
  ) or not exists (
    select 1 from jsonb_array_elements(
      public.world_proxy_review_queue_v1((v->>'organizationId')::uuid)->'items'
    ) item
    where item->>'id'=v->>'proxyId'
      and item->>'status'='requested'
  ) then
    raise exception 'TG6_PROXY_AUTHORIZED_REVIEW_QUEUE_MISSING';
  end if;

  v_receipt := public.world_approve_proxy_v1(
    (v->>'proxyId')::uuid,'approved',1,
    gen_random_uuid(),'tg6-chair:' || gen_random_uuid()::text
  );
  if v_receipt->>'status' <> 'succeeded'
     or v_receipt #>> '{result,status}' <> 'approved'
     or v_receipt #>> '{result,revision}' <> '2'

  then
    raise exception 'TG6_PROXY_APPROVAL_RECEIPT_OR_STATUS_INCOMPLETE';
  end if;

  begin
    perform public.world_approve_proxy_v1(
      (v->>'proxyId')::uuid,'rejected',2,
      gen_random_uuid(),'tg6-reject-approved:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_APPROVED_REOPEN_ALLOWED';
  exception when check_violation then null;
  end;
  raise notice 'PASS: TG6 chair approval is scoped, revised, auditable and effective only in time window';
end
$authorized_approval$;
reset role;

-- These are privileged state assertions, deliberately NOT attempted as the
-- chair account: chair's approval authority is not general private-read RLS.
do $approved_state$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  if not exists (
    select 1 from public.world_representation_proxies
    where id=(v->>'proxyId')::uuid
      and status='approved' and approved_at is not null and revision=2
  ) then
    raise exception 'TG6_PROXY_APPROVAL_STATE_INCOMPLETE';
  end if;
  if private.world_proxy_is_effective(
    'approved',(v->>'validFrom')::timestamptz,(v->>'validUntil')::timestamptz,now()
  ) or not private.world_proxy_is_effective(
    'approved',(v->>'validFrom')::timestamptz,(v->>'validUntil')::timestamptz,
    (v->>'validFrom')::timestamptz+interval '1 minute'
  ) then
    raise exception 'TG6_PROXY_SERVER_TIME_EFFECTIVENESS_INVALID';
  end if;
end
$approved_state$;

-- Create a second pending proxy directly as the local test owner to verify
-- the approval race invariant independently of the request deduplication check.
do $extra$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
  v_id uuid := gen_random_uuid();
begin
  insert into public.world_representation_proxies
    (id,representation_id,proxy_person_id,session_id,valid_from,valid_until,reason,status)
  values(
    v_id,(v->>'representationId')::uuid,(v->>'proxyPersonId')::uuid,
    (v->>'sessionId')::uuid,(v->>'validFrom')::timestamptz,
    (v->>'validUntil')::timestamptz,'TG6 overlap regression','requested'
  );
  perform set_config('solaris.tg6_proxy_fixture',
    (v || jsonb_build_object('otherProxyId',v_id))::text,true);
end
$extra$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $overlap$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'chair',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
  begin
    perform public.world_approve_proxy_v1(
      (v->>'otherProxyId')::uuid,'approved',1,
      gen_random_uuid(),'tg6-double-approved:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_OVERLAPPING_APPROVAL_ALLOWED';
  exception when unique_violation then null;
  end;
  raise notice 'PASS: TG6 never approves overlapping acting proxies for one representation';
end
$overlap$;
reset role;

-- Revocation is a separately authorized immediate invalidation path. The
-- previous approval must no longer be time-effective, even inside its window.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $outsider_revoke$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_revoke_proxy_v1(
      (v->>'proxyId')::uuid,2,'Unauthorized attempted revocation',
      gen_random_uuid(),'tg6-invalid-revoke:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_OUTSIDER_REVOCATION_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$outsider_revoke$;

do $controller_revoke$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
  v_op uuid := gen_random_uuid();
  v_receipt jsonb;
  v_replayed jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'owner','role','authenticated')::text,true);

  v_receipt := public.world_revoke_proxy_v1(
    (v->>'proxyId')::uuid,2,'Country controller revoked acting proxy',
    v_op,'tg6-revoke:' || v_op::text
  );
  if v_receipt->>'status' <> 'succeeded'
    or v_receipt #>> '{result,status}' <> 'revoked'
    or v_receipt #>> '{result,revision}' <> '3'
  then
    raise exception 'TG6_PROXY_REVOCATION_RECEIPT_INVALID';
  end if;
  v_replayed := public.world_revoke_proxy_v1(
    (v->>'proxyId')::uuid,2,'Country controller revoked acting proxy',
    v_op,'tg6-revoke:' || v_op::text
  );
  if coalesce((v_replayed->>'replayed')::boolean,false) is not true
    or v_replayed #>> '{result,revision}' <> '3'
  then
    raise exception 'TG6_PROXY_REVOCATION_REPLAY_UNSTABLE';
  end if;

  begin
    perform public.world_revoke_proxy_v1(
      (v->>'proxyId')::uuid,3,'Attempt to revoke an already revoked proxy',
      gen_random_uuid(),'tg6-double-revoke:' || gen_random_uuid()::text
    );
    raise exception 'TG6_PROXY_REPEATED_REVOCATION_ALLOWED';
  exception when check_violation then null;
  end;
  raise notice 'PASS: TG6 country controller can immediately revoke once with stable receipt';
end
$controller_revoke$;
reset role;

do $revoked_state$
declare
  v jsonb := current_setting('solaris.tg6_proxy_fixture')::jsonb;
begin
  if not exists (
    select 1 from public.world_representation_proxies
    where id=(v->>'proxyId')::uuid
      and status='revoked' and revoked_at is not null
      and revision=3 and revocation_reason='Country controller revoked acting proxy'
  ) then
    raise exception 'TG6_PROXY_REVOCATION_NOT_PERSISTED';
  end if;
  if private.world_proxy_is_effective(
    'revoked',(v->>'validFrom')::timestamptz,(v->>'validUntil')::timestamptz,
    (v->>'validFrom')::timestamptz+interval '1 minute'
  ) then
    raise exception 'TG6_PROXY_REVOKED_STILL_EFFECTIVE';
  end if;
end
$revoked_state$;

rollback;
do $rolled_back$
begin
  if exists (select 1 from auth.users where email like '%@tg6-proxy.invalid')
     or exists (select 1 from public.world_organizations where slug like 'tg6-proxy-%')
  then
    raise exception 'TG6_PROXY_FIXTURE_PERSISTED';
  end if;
  raise notice 'PASS: TG6 proxy fixture fully rolled back';
end
$rolled_back$;
