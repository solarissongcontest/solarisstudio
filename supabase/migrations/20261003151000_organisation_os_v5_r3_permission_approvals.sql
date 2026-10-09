begin;

-- Organisation OS V5 R3 separation-of-duties for permission mutations.
--
-- A permission requester cannot self-approve. The approval is short-lived,
-- bound to one exact reviewed operation, and may be consumed only once.

create table if not exists public.studio2_permission_change_approval_requests (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  idempotency_key text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  change_kind text not null
    check (change_kind in ('assign_role', 'revoke_role', 'grant_capability', 'revoke_capability')),
  permission_key text not null,
  edition_id uuid references public.editions(id) on delete set null,
  access_expires_at timestamptz,
  expected_version bigint not null check (expected_version >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  approval_expires_at timestamptz not null default (now() + interval '15 minutes'),
  request_auth_freshness jsonb not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_auth_freshness jsonb,
  consumed_at timestamptz,
  constraint studio2_permission_change_approval_key_check
    check (length(btrim(permission_key)) between 1 and 160),
  constraint studio2_permission_change_approval_idempotency_check
    check (length(btrim(idempotency_key)) between 1 and 240),
  constraint studio2_permission_change_approval_expiry_check
    check (approval_expires_at > requested_at),
  constraint studio2_permission_change_approval_second_operator_check
    check (
      approved_by is null
      or requested_by is null
      or approved_by <> requested_by
    ),
  constraint studio2_permission_change_approval_state_check
    check (
      (approved_by is null and approved_at is null and approval_auth_freshness is null)
      or
      (approved_by is not null and approved_at is not null and approval_auth_freshness is not null)
    )
);

create index if not exists studio2_permission_change_approval_active_idx
  on public.studio2_permission_change_approval_requests (
    requested_at desc,
    approval_expires_at
  )
  where consumed_at is null;

create index if not exists studio2_permission_change_approval_target_idx
  on public.studio2_permission_change_approval_requests (
    target_user_id,
    requested_at desc
  );

alter table public.studio2_permission_change_approval_requests enable row level security;
revoke all on table public.studio2_permission_change_approval_requests
  from public, anon, authenticated;
grant all on table public.studio2_permission_change_approval_requests
  to service_role;

create or replace function private.studio2_permission_approval_json(
  p_request public.studio2_permission_change_approval_requests,
  p_actor uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $json$
declare
  v_target_name text;
  v_requester_name text;
  v_approver_name text;
begin
  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'instagram_username'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'User'
  )
  into v_target_name
  from auth.users u
  where u.id = p_request.target_user_id;

  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Organizer'
  )
  into v_requester_name
  from auth.users u
  where u.id = p_request.requested_by;

  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Organizer'
  )
  into v_approver_name
  from auth.users u
  where u.id = p_request.approved_by;

  return jsonb_build_object(
    'id', p_request.id,
    'operationId', p_request.operation_id,
    'idempotencyKey',
      case when p_request.requested_by = p_actor then p_request.idempotency_key else null end,
    'targetUserId', p_request.target_user_id,
    'targetDisplayName', coalesce(v_target_name, 'Deleted user'),
    'changeKind', p_request.change_kind,
    'key', p_request.permission_key,
    'editionId', p_request.edition_id,
    'expiresAt', p_request.access_expires_at,
    'expectedVersion', p_request.expected_version,
    'requestedBy', p_request.requested_by,
    'requesterDisplayName', coalesce(v_requester_name, 'Former organizer'),
    'requestedAt', p_request.requested_at,
    'approvalExpiresAt', p_request.approval_expires_at,
    'approvedBy', p_request.approved_by,
    'approverDisplayName', v_approver_name,
    'approvedAt', p_request.approved_at,
    'canApprove',
      p_request.consumed_at is null
      and p_request.approval_expires_at > now()
      and p_request.approved_by is null
      and p_request.requested_by is distinct from p_actor,
    'canApply',
      p_request.consumed_at is null
      and p_request.approval_expires_at > now()
      and p_request.approved_by is not null
      and p_request.requested_by = p_actor,
    'consumedAt', p_request.consumed_at
  );
end
$json$;

revoke all on function private.studio2_permission_approval_json(
  public.studio2_permission_change_approval_requests, uuid
) from public, anon, authenticated;

create or replace function public.studio2_request_permission_change_approval(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid,
  p_expires_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $request$
declare
  v_actor uuid := auth.uid();
  v_preview jsonb;
  v_evidence jsonb;
  v_request public.studio2_permission_change_approval_requests;
  v_existing public.studio2_permission_change_approval_requests;
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  if p_user_id is null
     or p_operation_id is null
     or p_expected_version is null
     or v_key is null
     or v_idempotency is null then
    raise exception 'Target, operation identity, permission key and expected version are required'
      using errcode = '22023';
  end if;

  v_preview := public.studio2_permission_change_preview(
    p_user_id,
    p_change_kind,
    v_key,
    p_edition_id,
    p_expires_at
  );

  if (v_preview ->> 'expectedVersion')::bigint <> p_expected_version then
    raise exception 'Access changed since this impact preview was loaded. Reload the preview before requesting approval.'
      using errcode = '40001';
  end if;

  if coalesce((v_preview ->> 'alreadyApplied')::boolean, false) then
    raise exception 'That access state is already current' using errcode = '22023';
  end if;

  v_evidence := private.studio2_require_fresh_auth(300);

  select *
  into v_existing
  from public.studio2_permission_change_approval_requests request
  where request.operation_id = p_operation_id
  for update;

  if v_existing.id is not null then
    if v_existing.requested_by is distinct from v_actor
       or v_existing.idempotency_key <> v_idempotency
       or v_existing.target_user_id is distinct from p_user_id
       or v_existing.change_kind <> p_change_kind
       or v_existing.permission_key <> v_key
       or v_existing.edition_id is distinct from p_edition_id
       or v_existing.access_expires_at is distinct from p_expires_at
       or v_existing.expected_version <> p_expected_version then
      raise exception 'Operation id is already bound to a different R3 permission request'
        using errcode = '23505';
    end if;

    if v_existing.consumed_at is not null then
      raise exception 'This R3 approval request has already been consumed'
        using errcode = '22023';
    end if;

    if v_existing.approval_expires_at <= now() then
      raise exception 'This R3 approval request expired; reload the preview and create a new operation'
        using errcode = '22023';
    end if;

    return private.studio2_permission_approval_json(v_existing, v_actor);
  end if;

  insert into public.studio2_permission_change_approval_requests (
    operation_id,
    idempotency_key,
    target_user_id,
    change_kind,
    permission_key,
    edition_id,
    access_expires_at,
    expected_version,
    requested_by,
    request_auth_freshness
  )
  values (
    p_operation_id,
    v_idempotency,
    p_user_id,
    p_change_kind,
    v_key,
    p_edition_id,
    p_expires_at,
    p_expected_version,
    v_actor,
    v_evidence
  )
  returning * into v_request;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'permission_approval_requested',
    'studio2_permission_change_approval_requests',
    v_request.id::text,
    null,
    jsonb_build_object(
      'operationId', v_request.operation_id,
      'targetUserId', v_request.target_user_id,
      'changeKind', v_request.change_kind,
      'key', v_request.permission_key,
      'editionId', v_request.edition_id,
      'expectedVersion', v_request.expected_version,
      'approvalExpiresAt', v_request.approval_expires_at,
      'requestAuthFreshness', v_evidence
    )
  );

  return private.studio2_permission_approval_json(v_request, v_actor);
end
$request$;

revoke all on function public.studio2_request_permission_change_approval(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_request_permission_change_approval(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to authenticated, service_role;

create or replace function public.studio2_approve_permission_change(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $approve$
declare
  v_actor uuid := auth.uid();
  v_request public.studio2_permission_change_approval_requests;
  v_evidence jsonb;
  v_current_version bigint;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.studio2_permission_change_approval_requests request
  where request.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'R3 permission approval request not found' using errcode = 'P0002';
  end if;

  if v_request.requested_by is null or v_request.target_user_id is null then
    raise exception 'R3 permission approval is no longer actionable' using errcode = '22023';
  end if;

  if v_request.requested_by = v_actor then
    raise exception 'A permission requester cannot approve their own R3 operation'
      using errcode = '42501';
  end if;

  if v_request.consumed_at is not null or v_request.approval_expires_at <= now() then
    raise exception 'R3 permission approval request is no longer active'
      using errcode = '22023';
  end if;

  if v_request.approved_by is not null then
    return private.studio2_permission_approval_json(v_request, v_actor);
  end if;

  insert into public.studio2_permission_subject_versions (user_id, version)
  values (v_request.target_user_id, 0)
  on conflict (user_id) do nothing;

  select version
  into v_current_version
  from public.studio2_permission_subject_versions
  where user_id = v_request.target_user_id
  for share;

  if v_current_version <> v_request.expected_version then
    raise exception 'Access changed after this R3 approval request was created'
      using errcode = '40001';
  end if;

  v_evidence := private.studio2_require_fresh_auth(300);

  update public.studio2_permission_change_approval_requests
  set
    approved_by = v_actor,
    approved_at = now(),
    approval_auth_freshness = v_evidence
  where id = p_request_id
  returning * into v_request;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'permission_approval_granted',
    'studio2_permission_change_approval_requests',
    v_request.id::text,
    null,
    jsonb_build_object(
      'operationId', v_request.operation_id,
      'requestedBy', v_request.requested_by,
      'approvedBy', v_actor,
      'approvalAuthFreshness', v_evidence
    )
  );

  return private.studio2_permission_approval_json(v_request, v_actor);
end
$approve$;

revoke all on function public.studio2_approve_permission_change(uuid)
  from public, anon;
grant execute on function public.studio2_approve_permission_change(uuid)
  to authenticated, service_role;

create or replace function public.studio2_list_permission_change_approvals()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $list$
declare
  v_actor uuid := auth.uid();
  v_rows jsonb;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      private.studio2_permission_approval_json(request, v_actor)
      order by request.requested_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.studio2_permission_change_approval_requests request
  where request.consumed_at is null
    and request.approval_expires_at > now();

  return v_rows;
end
$list$;

revoke all on function public.studio2_list_permission_change_approvals()
  from public, anon;
grant execute on function public.studio2_list_permission_change_approvals()
  to authenticated, service_role;

-- The prior eight-argument fresh-auth wrapper is service-only now. Authenticated
-- callers must supply a real, independently approved request to the nine-argument
-- R3 wrapper below.
revoke all on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) from public, anon, authenticated;
grant execute on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint
) to service_role;

create or replace function public.studio2_apply_permission_change_r3(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid,
  p_expires_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_approval_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply_r3$
declare
  v_actor uuid := auth.uid();
  v_existing public.studio2_operation_receipts;
  v_approval public.studio2_permission_change_approval_requests;
  v_evidence jsonb;
  v_result jsonb;
  v_idempotency text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'permissions.' || p_change_kind
    and receipt.idempotency_key = v_idempotency
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return v_existing.result;
  end if;

  if p_approval_request_id is null then
    raise exception 'An approved second-operator request is required for this R3 permission mutation'
      using errcode = '42501';
  end if;

  v_evidence := private.studio2_require_fresh_auth(300);

  select *
  into v_approval
  from public.studio2_permission_change_approval_requests approval
  where approval.id = p_approval_request_id
  for update;

  if v_approval.id is null
     or v_approval.requested_by is distinct from v_actor
     or v_approval.approved_by is null
     or v_approval.approved_by = v_actor
     or v_approval.approved_at is null
     or v_approval.consumed_at is not null
     or v_approval.approval_expires_at <= now()
     or v_approval.operation_id <> p_operation_id
     or v_approval.idempotency_key <> v_idempotency
     or v_approval.target_user_id is distinct from p_user_id
     or v_approval.change_kind <> p_change_kind
     or v_approval.permission_key <> p_key
     or v_approval.edition_id is distinct from p_edition_id
     or v_approval.access_expires_at is distinct from p_expires_at
     or v_approval.expected_version <> p_expected_version then
    raise exception 'R3 permission approval is missing, stale, mismatched, expired, or already consumed'
      using errcode = '42501';
  end if;

  v_result := public.studio2_apply_permission_change(
    p_user_id,
    p_change_kind,
    p_key,
    p_edition_id,
    p_expires_at,
    p_operation_id,
    v_idempotency,
    p_expected_version
  );

  update public.studio2_permission_change_approval_requests
  set consumed_at = now()
  where id = v_approval.id;

  update public.studio2_operation_receipts
  set
    actor_session_id = v_evidence ->> 'sessionId',
    auth_freshness_evidence = v_evidence,
    updated_at = now()
  where operation_id = p_operation_id
    and actor_id = v_actor;

  update public.admin_audit_log
  set after_data =
    coalesce(after_data, '{}'::jsonb)
    || jsonb_build_object(
      'actorSessionId', v_evidence ->> 'sessionId',
      'authFreshness', v_evidence,
      'approvalRequestId', v_approval.id,
      'secondApproverUserId', v_approval.approved_by,
      'secondApprovalFreshness', v_approval.approval_auth_freshness
    )
  where actor_id = v_actor
    and action = 'permission_' || p_change_kind
    and after_data ->> 'operationId' = p_operation_id::text;

  return v_result;
end
$apply_r3$;

revoke all on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint, uuid
) from public, anon;
grant execute on function public.studio2_apply_permission_change_r3(
  uuid, text, text, uuid, timestamptz, uuid, text, bigint, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
