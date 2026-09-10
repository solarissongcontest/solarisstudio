begin;

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

  -- Read once without a lock so we can identify the edition. The authoritative
  -- request is re-read under FOR UPDATE after the runtime row is locked, keeping
  -- lock order identical to request/application paths: runtime first, request second.
  select * into v_request
  from public.studio2_transition_approval_requests
  where id = p_request_id;

  if not found then
    raise exception 'Transition approval request not found: %', p_request_id using errcode = 'P0002';
  end if;

  if not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', v_request.edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = v_request.edition_id
  for share;

  if not found then
    raise exception 'Studio 2 runtime is unavailable for edition %', v_request.edition_id using errcode = 'P0002';
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

  if v_runtime.state <> v_request.from_state
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

notify pgrst, 'reload schema';

commit;
