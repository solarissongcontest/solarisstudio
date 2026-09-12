begin;

-- Persist stale approval expiry instead of merely filtering expired approvals out
-- of organizer views. The helper is intentionally not client-callable.
create or replace function public.integrity_expire_stale_identity_approvals()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.integrity_identity_disclosure_requests
    set status = 'expired'
    where status = 'approved'
      and approval_expires_at <= now()
    returning id, case_id
  ), logged as (
    insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
    select
      case_id,
      'identity.disclosure_expired',
      'A sealed identity break-glass approval expired without being used',
      false,
      null
    from expired
    returning 1
  )
  select count(*)::integer into v_count from logged;

  return v_count;
end;
$$;
revoke all on function public.integrity_expire_stale_identity_approvals() from public;

create or replace function public.admin_identity_disclosure_requests()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  perform public.integrity_expire_stale_identity_approvals();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'case_id', d.case_id,
      'case_code', c.public_code,
      'case_summary', c.summary,
      'priority', c.priority,
      'reason', d.reason,
      'status', d.status,
      'requested_by', d.requested_by,
      'requested_at', d.requested_at,
      'decided_by', d.decided_by,
      'decision_reason', d.decision_reason,
      'decided_at', d.decided_at,
      'approval_expires_at', d.approval_expires_at,
      'disclosed_at', d.disclosed_at
    ) order by
      case d.status when 'pending' then 1 when 'approved' then 2 when 'expired' then 3 when 'used' then 4 else 5 end,
      d.requested_at desc)
    from public.integrity_identity_disclosure_requests d
    join public.integrity_cases c on c.id = d.case_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_identity_disclosure_requests() from public;
grant execute on function public.admin_identity_disclosure_requests() to authenticated;

create or replace function public.admin_sealed_integrity_cases()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  perform public.integrity_expire_stale_identity_approvals();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'public_code', c.public_code,
      'summary', c.summary,
      'category', c.category,
      'priority', c.priority,
      'status', c.status,
      'active_request_id', r.id,
      'active_request_status', r.status
    ) order by
      case c.priority when 'urgent' then 1 when 'high' then 2 when 'standard' then 3 else 4 end,
      c.updated_at desc)
    from public.integrity_cases c
    left join lateral (
      select d.id, d.status
      from public.integrity_identity_disclosure_requests d
      where d.case_id = c.id and d.status in ('pending', 'approved')
      order by d.requested_at desc
      limit 1
    ) r on true
    where c.identity_mode = 'sealed'
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_sealed_integrity_cases() from public;
grant execute on function public.admin_sealed_integrity_cases() to authenticated;

create or replace function public.admin_request_sealed_identity_disclosure(
  _case_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_id uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if char_length(_reason) < 20 or char_length(_reason) > 4000 then
    raise exception 'Disclosure reason must be between 20 and 4000 characters';
  end if;

  select identity_mode into v_mode
  from public.integrity_cases
  where id = _case_id;
  if v_mode is null then raise exception 'Integrity case not found'; end if;
  if v_mode <> 'sealed' then raise exception 'Break-glass disclosure is only for sealed identity cases'; end if;

  perform public.integrity_expire_stale_identity_approvals();

  if exists (
    select 1 from public.integrity_identity_disclosure_requests
    where case_id = _case_id and status in ('pending', 'approved')
  ) then raise exception 'This sealed case already has an active disclosure request'; end if;

  insert into public.integrity_identity_disclosure_requests(case_id, requested_by, reason)
  values (_case_id, auth.uid(), _reason)
  returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'identity.disclosure_requested',
    'A sealed identity break-glass request was created and requires approval by a different organizer',
    false,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.admin_request_sealed_identity_disclosure(uuid, text) from public;
grant execute on function public.admin_request_sealed_identity_disclosure(uuid, text) to authenticated;

commit;
