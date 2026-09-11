begin;

-- Critical edition rollbacks use a genuine two-person approval flow. A caller
-- cannot satisfy governance by supplying another organizer's UUID; the second
-- authorized user must approve the request from their own authenticated session.
create table public.studio2_transition_approval_requests (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  from_state text not null,
  to_state text not null,
  reason text not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  consumed_at timestamptz,
  constraint studio2_transition_approval_reason_check check (length(btrim(reason)) > 0),
  constraint studio2_transition_approval_expiry_check check (expires_at > requested_at),
  constraint studio2_transition_approval_approver_check check (
    approved_by is null or approved_by <> requested_by
  ),
  constraint studio2_transition_approval_state_check check (
    from_state in (
      'planning', 'confirmations', 'submissions', 'jury_voting', 'televoting',
      'live_show', 'vote_verification', 'results', 'post_edition', 'archived'
    )
    and to_state in (
      'planning', 'confirmations', 'submissions', 'jury_voting', 'televoting',
      'live_show', 'vote_verification', 'results', 'post_edition', 'archived'
    )
  )
);

create index studio2_transition_approval_active_idx
  on public.studio2_transition_approval_requests (
    edition_id, from_state, to_state, requested_at desc
  )
  where consumed_at is null;

alter table public.studio2_transition_approval_requests enable row level security;
revoke all on table public.studio2_transition_approval_requests from public, anon, authenticated;
grant select on table public.studio2_transition_approval_requests to authenticated;
grant all on table public.studio2_transition_approval_requests to service_role;

create policy studio2_transition_approval_read
on public.studio2_transition_approval_requests
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.studio2_has_capability('edition.manage', edition_id)
);

create or replace function public.studio2_request_transition_approval(
  p_edition_id uuid,
  p_to text,
  p_reason text
)
returns public.studio2_transition_approval_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_runtime public.studio2_edition_runtime%rowtype;
  v_request public.studio2_transition_approval_requests%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_risk text;
begin
  if v_actor is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  if p_edition_id is null or p_to is null or v_reason is null then
    raise exception 'Edition, target state and reason are required' using errcode = '22023';
  end if;

  if not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = p_edition_id
  for update;

  if not found then
    raise exception 'Studio 2 runtime is not provisioned for edition %', p_edition_id using errcode = 'P0002';
  end if;

  v_risk := private.studio2_transition_risk(v_runtime.state, p_to);
  if v_risk is distinct from 'critical' then
    raise exception 'Second approval is only valid for critical transitions: % -> %', v_runtime.state, p_to
      using errcode = '22023';
  end if;

  -- A requester may have only one live request for the same state transition.
  update public.studio2_transition_approval_requests
  set consumed_at = now()
  where edition_id = p_edition_id
    and from_state = v_runtime.state
    and to_state = p_to
    and requested_by = v_actor
    and consumed_at is null
    and (approved_at is null or expires_at <= now());

  select * into v_request
  from public.studio2_transition_approval_requests
  where edition_id = p_edition_id
    and from_state = v_runtime.state
    and to_state = p_to
    and requested_by = v_actor
    and reason = v_reason
    and consumed_at is null
    and expires_at > now()
  order by requested_at desc
  limit 1;

  if found then
    return v_request;
  end if;

  insert into public.studio2_transition_approval_requests (
    edition_id,
    from_state,
    to_state,
    reason,
    requested_by
  ) values (
    p_edition_id,
    v_runtime.state,
    p_to,
    v_reason,
    v_actor
  )
  returning * into v_request;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'edition.transition_approval_requested',
    v_actor,
    'transition_approval',
    v_request.id::text,
    jsonb_build_object(
      'from', v_request.from_state,
      'to', v_request.to_state,
      'reason', v_request.reason,
      'expiresAt', v_request.expires_at
    )
  );

  return v_request;
end
$$;

create or replace function public.studio2_approve_transition(p_request_id uuid)
returns public.studio2_transition_approval_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.studio2_transition_approval_requests%rowtype;
  v_runtime public.studio2_edition_runtime%rowtype;
begin
  if v_actor is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  select * into v_request
  from public.studio2_transition_approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Transition approval request not found: %', p_request_id using errcode = 'P0002';
  end if;

  if v_request.requested_by = v_actor then
    raise exception 'A transition requester cannot approve their own request' using errcode = '42501';
  end if;

  if v_request.consumed_at is not null or v_request.expires_at <= now() then
    raise exception 'Transition approval request is no longer active' using errcode = '22023';
  end if;

  if v_request.approved_by is not null then
    return v_request;
  end if;

  if not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', v_request.edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = v_request.edition_id
  for share;

  if not found
     or v_runtime.state <> v_request.from_state
     or private.studio2_transition_risk(v_runtime.state, v_request.to_state) is distinct from 'critical' then
    raise exception 'Edition state changed; this approval request is stale' using errcode = '40001';
  end if;

  update public.studio2_transition_approval_requests
  set approved_by = v_actor,
      approved_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_request.edition_id,
    'edition.transition_approval_granted',
    v_actor,
    'transition_approval',
    v_request.id::text,
    jsonb_build_object(
      'from', v_request.from_state,
      'to', v_request.to_state,
      'requestedBy', v_request.requested_by,
      'approvedBy', v_actor
    )
  );

  return v_request;
end
$$;

create or replace function public.studio2_list_transition_approvals(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  if not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'editionId', r.edition_id,
        'from', r.from_state,
        'to', r.to_state,
        'reason', r.reason,
        'requestedBy', r.requested_by,
        'requestedAt', r.requested_at,
        'expiresAt', r.expires_at,
        'approvedBy', r.approved_by,
        'approvedAt', r.approved_at,
        'canApprove', r.approved_by is null and r.requested_by <> v_actor,
        'canApply', r.approved_by is not null and r.requested_by = v_actor
      ) order by r.requested_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.studio2_transition_approval_requests r
  where r.edition_id = p_edition_id
    and r.consumed_at is null
    and r.expires_at > now();

  return v_rows;
end
$$;

create or replace function public.studio2_transition_edition_v2(
  p_edition_id uuid,
  p_to text,
  p_reason text default null,
  p_approval_request_id uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_runtime public.studio2_edition_runtime%rowtype;
  v_status text;
  v_from text;
  v_risk text;
  v_reason text := nullif(btrim(p_reason), '');
  v_required_capability text;
  v_approval public.studio2_transition_approval_requests%rowtype;
begin
  if p_edition_id is null or p_to is null then
    raise exception 'Edition id and target state are required' using errcode = '22023';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, v_required_capability, p_edition_id) then
    raise exception 'Missing Solaris capability: %', v_required_capability using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = p_edition_id
  for update;

  if not found then
    select e.status into v_status
    from public.editions e
    where e.id = p_edition_id;

    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;

    insert into public.studio2_edition_runtime (
      edition_id, state, subsystems, updated_by
    ) values (
      p_edition_id,
      private.studio2_normalize_legacy_edition_status(v_status),
      private.studio2_default_subsystems(private.studio2_normalize_legacy_edition_status(v_status)),
      v_actor
    )
    on conflict (edition_id) do nothing;

    select * into v_runtime
    from public.studio2_edition_runtime
    where edition_id = p_edition_id
    for update;
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  if v_risk is null then
    raise exception 'Illegal edition state transition: % -> %', v_from, p_to using errcode = '22023';
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception 'A reason is required for % edition transitions', v_risk using errcode = '22023';
  end if;

  if v_risk = 'critical' then
    if v_actor is null or p_approval_request_id is null then
      raise exception 'An approved second-person request is required for critical edition transitions'
        using errcode = '42501';
    end if;

    select * into v_approval
    from public.studio2_transition_approval_requests
    where id = p_approval_request_id
    for update;

    if not found
       or v_approval.edition_id <> p_edition_id
       or v_approval.from_state <> v_from
       or v_approval.to_state <> p_to
       or v_approval.requested_by <> v_actor
       or v_approval.approved_by is null
       or v_approval.approved_by = v_actor
       or v_approval.approved_at is null
       or v_approval.consumed_at is not null
       or v_approval.expires_at <= now()
       or v_approval.reason <> v_reason then
      raise exception 'Critical transition approval is missing, stale, mismatched, or already consumed'
        using errcode = '42501';
    end if;
  elsif p_approval_request_id is not null then
    raise exception 'Approval request ids are only valid for critical transitions' using errcode = '22023';
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
  returning * into v_runtime;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id;
  end if;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end
    )
  );

  return v_runtime;
end
$$;

-- Keep the original RPC for compatibility, but remove its old pretend second-
-- approval path. It can still perform normal/elevated transitions. Critical
-- transitions must use the approval-request flow above.
create or replace function public.studio2_transition_edition(
  p_edition_id uuid,
  p_to text,
  p_reason text default null,
  p_second_approver uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_second_approver is not null then
    raise exception 'Supplying another user id is not proof of approval; use the Studio 2 approval workflow'
      using errcode = '42501';
  end if;

  return public.studio2_transition_edition_v2(p_edition_id, p_to, p_reason, null);
end
$$;

revoke all on function public.studio2_request_transition_approval(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_request_transition_approval(uuid, text, text)
  to authenticated;

revoke all on function public.studio2_approve_transition(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_approve_transition(uuid)
  to authenticated;

revoke all on function public.studio2_list_transition_approvals(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_list_transition_approvals(uuid)
  to authenticated;

revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
