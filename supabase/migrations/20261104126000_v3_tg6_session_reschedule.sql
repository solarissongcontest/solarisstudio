begin;

-- TG6 forward-only session scheduling extension. The existing world_sessions
-- row remains the sole authority, created by #1950. Never clone sessions
-- into a parallel calendar, admin draft or browser-owned state.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg6.world-session-reschedule',1,'forward_fix_only',false,null,
      'Scope-authorized scheduling/venue revisions of existing scheduled sessions with UTC instants, expected-revision CAS, R2 receipts, audit event and private manager projection.'
    );
  end if;
end
$contract$;

-- Include external meeting links only for authorized officers. Public session
-- projections deliberately omit private external URLs.
create or replace function public.world_session_schedule_manage_v1(p_session_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog
as $manager$
declare
  v_session public.world_sessions%rowtype;
begin
  if auth.uid() is null or p_session_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  select * into v_session from public.world_sessions where id=p_session_id;
  if v_session.id is null or not public.world_access_allowed(
    'world.session.manage',v_session.organization_id,null,
    v_session.organ_id,'session',v_session.id
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  return jsonb_build_object(
    'sessionId',v_session.id,
    'organizationId',v_session.organization_id,
    'organId',v_session.organ_id,
    'title',v_session.title,
    'status',v_session.status,
    'startsAt',v_session.starts_at,
    'endsAt',v_session.ends_at,
    'venueType',v_session.venue_type,
    'venueLabel',v_session.venue_label,
    'externalUrl',v_session.external_url,
    'revision',v_session.revision
  );
end
$manager$;

create or replace function public.world_session_reschedule_v1(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_venue_type text,
  p_venue_label text,
  p_external_url text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $reschedule$
declare
  v_session public.world_sessions%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_venue_label text:=nullif(btrim(coalesce(p_venue_label,'')),'');
  v_external_url text:=nullif(btrim(coalesce(p_external_url,'')),'');
begin
  if auth.uid() is null or p_session_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
  then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at
     or p_venue_type is null
     or p_venue_type not in ('online','external','physical','hybrid')
     or length(coalesce(p_venue_label,'')) > 180
     or (v_external_url is not null and v_external_url !~ '^https://[^[:space:]]+$')
     or p_expected_revision is null or p_expected_revision < 1
  then raise exception using errcode='22023',message='VALIDATION'; end if;

  -- Session row serialization prevents races with opening, cancellation,
  -- publication, minute approvals and other schedule edits.
  select * into v_session
  from public.world_sessions
  where id=p_session_id for update;
  if v_session.id is null or not public.world_access_allowed(
    'world.session.manage',v_session.organization_id,null,
    v_session.organ_id,'session',v_session.id
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.session.reschedule','R2',
    jsonb_build_object(
      'sessionId',v_session.id,'organizationId',v_session.organization_id,
      'organId',v_session.organ_id,'subjectType','world_session'
    ),
    jsonb_build_object(
      'startsAt',p_starts_at,'endsAt',p_ends_at,'venueType',p_venue_type,
      'venueLabel',v_venue_label,'externalUrl',v_external_url,
      'expectedRevision',p_expected_revision
    )
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  if v_session.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_session.status <> 'scheduled' or p_starts_at <= now() then
    raise exception using errcode='23514',message='SESSION_NOT_RESCHEDULABLE';
  end if;
  if not exists (
    select 1
    from public.world_organizations organization_row
    join public.world_organization_organs organ_row
      on organ_row.organization_id=organization_row.id
    where organization_row.id=v_session.organization_id
      and organization_row.status='active'
      and organ_row.id=v_session.organ_id
      and organ_row.status='active'
  ) then
    raise exception using errcode='23514',message='INACTIVE_INSTITUTION';
  end if;

  -- Existing approved or pending proxy mandates were issued against the
  -- original session window. Do not silently move a meeting beyond one
  -- of those still-live authorizations. The TG6 proxy request path holds a
  -- share lock on the session, so new requests serialize with this update.
  if exists (
    select 1 from public.world_representation_proxies proxy_row
    where proxy_row.session_id=p_session_id
      and proxy_row.status in ('requested','approved')
      and proxy_row.revoked_at is null
      and proxy_row.valid_until > now()
      and (
        proxy_row.valid_from < p_starts_at
        or proxy_row.valid_until > p_ends_at
      )
  ) then
    raise exception using errcode='23514',
      message='SESSION_PROXY_WINDOW_CONFLICT';
  end if;

  update public.world_sessions
  set starts_at=p_starts_at,
      ends_at=p_ends_at,
      venue_type=p_venue_type,
      venue_label=v_venue_label,
      external_url=v_external_url,
      updated_at=now(),
      revision=revision+1
  where id=p_session_id;

  -- Event describes the scheduling change without exposing a private
  -- meeting room URL or login identifiers to asynchronous consumers.
  perform private.v3_emit_domain_event(
    'world.session.rescheduled','world_session',v_session.id::text,
    v_session.revision+1,v_operation_id,null,null,
    jsonb_build_object(
      'sessionId',v_session.id,'organizationId',v_session.organization_id,
      'organId',v_session.organ_id,'previousStartsAt',v_session.starts_at,
      'previousEndsAt',v_session.ends_at,'startsAt',p_starts_at,
      'endsAt',p_ends_at,'venueType',p_venue_type,'revision',v_session.revision+1
    ),1,array[]::text[]
  );
  v_result:=jsonb_build_object(
    'ok',true,'operationId',v_operation_id,'sessionId',v_session.id,
    'revision',v_session.revision+1,'startsAt',p_starts_at,
    'endsAt',p_ends_at
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$reschedule$;

revoke all on function public.world_session_schedule_manage_v1(uuid),
  public.world_session_reschedule_v1(
    uuid,timestamptz,timestamptz,text,text,text,bigint,uuid,text,uuid
  ) from public,anon,authenticated,service_role;
grant execute on function public.world_session_schedule_manage_v1(uuid)
  to authenticated,service_role;
grant execute on function public.world_session_reschedule_v1(
  uuid,timestamptz,timestamptz,text,text,text,bigint,uuid,text,uuid
) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
