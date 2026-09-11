begin;

alter table public.integrity_identity_disclosure_requests
  drop constraint if exists integrity_identity_disclosure_requests_status_check;
alter table public.integrity_identity_disclosure_requests
  add constraint integrity_identity_disclosure_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'used', 'expired'));

alter table public.integrity_identity_disclosure_requests
  drop constraint if exists integrity_identity_disclosure_decision_consistency;
alter table public.integrity_identity_disclosure_requests
  add constraint integrity_identity_disclosure_decision_consistency check (
    (status = 'pending' and decided_by is null and decision_reason is null and decided_at is null and approval_expires_at is null and disclosed_at is null)
    or
    (status = 'approved' and decision_reason is not null and decided_at is not null and approval_expires_at is not null and disclosed_at is null)
    or
    (status = 'rejected' and decision_reason is not null and decided_at is not null and approval_expires_at is null and disclosed_at is null)
    or
    (status = 'used' and decision_reason is not null and decided_at is not null and approval_expires_at is not null and disclosed_at is not null)
    or
    (status = 'expired' and decision_reason is not null and decided_at is not null and approval_expires_at is not null and disclosed_at is null)
  );

-- Expired approvals stop being active automatically when another request is
-- needed. This prevents a stale 30-minute approval from blocking the case forever.
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

  update public.integrity_identity_disclosure_requests
  set status = 'expired'
  where case_id = _case_id
    and status = 'approved'
    and approval_expires_at <= now();

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

create or replace function public.admin_sealed_integrity_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
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
      where d.case_id = c.id
        and (
          d.status = 'pending'
          or (d.status = 'approved' and d.approval_expires_at > now())
        )
      order by d.requested_at desc
      limit 1
    ) r on true
    where c.identity_mode = 'sealed'
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_sealed_integrity_cases() from public;
grant execute on function public.admin_sealed_integrity_cases() to authenticated;

commit;
