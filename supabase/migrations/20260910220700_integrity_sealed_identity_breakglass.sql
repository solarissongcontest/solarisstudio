begin;

create table if not exists public.integrity_identity_disclosure_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'used')),
  requested_at timestamptz not null default now(),
  decided_by uuid null references auth.users(id) on delete set null,
  decision_reason text null,
  decided_at timestamptz null,
  approval_expires_at timestamptz null,
  disclosed_at timestamptz null,
  constraint integrity_identity_disclosure_decision_consistency check (
    (status = 'pending' and decided_by is null and decision_reason is null and decided_at is null and approval_expires_at is null and disclosed_at is null)
    or
    (status = 'approved' and decided_by is not null and decision_reason is not null and decided_at is not null and approval_expires_at is not null and disclosed_at is null)
    or
    (status = 'rejected' and decided_by is not null and decision_reason is not null and decided_at is not null and approval_expires_at is null and disclosed_at is null)
    or
    (status = 'used' and decided_by is not null and decision_reason is not null and decided_at is not null and approval_expires_at is not null and disclosed_at is not null)
  )
);

create unique index if not exists integrity_identity_one_active_request_per_case_idx
  on public.integrity_identity_disclosure_requests(case_id)
  where status in ('pending', 'approved');
create index if not exists integrity_identity_disclosure_status_created_idx
  on public.integrity_identity_disclosure_requests(status, requested_at desc);

alter table public.integrity_identity_disclosure_requests enable row level security;
revoke all on public.integrity_identity_disclosure_requests from anon, authenticated;

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

create or replace function public.admin_decide_sealed_identity_disclosure(
  _request_id uuid,
  _approve boolean,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_requester uuid;
  v_status text;
  v_next text;
  v_expires timestamptz;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if char_length(_reason) < 20 or char_length(_reason) > 4000 then
    raise exception 'Decision reason must be between 20 and 4000 characters';
  end if;

  select case_id, requested_by, status
  into v_case_id, v_requester, v_status
  from public.integrity_identity_disclosure_requests
  where id = _request_id
  for update;
  if v_case_id is null then raise exception 'Disclosure request not found'; end if;
  if v_status <> 'pending' then raise exception 'Only pending disclosure requests can be decided'; end if;
  if v_requester = auth.uid() then raise exception 'The requesting organizer cannot approve or reject their own sealed identity request'; end if;

  v_next := case when _approve then 'approved' else 'rejected' end;
  v_expires := case when _approve then now() + interval '30 minutes' else null end;

  update public.integrity_identity_disclosure_requests
  set status = v_next,
      decided_by = auth.uid(),
      decision_reason = _reason,
      decided_at = now(),
      approval_expires_at = v_expires
  where id = _request_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    v_case_id,
    case when _approve then 'identity.disclosure_approved' else 'identity.disclosure_rejected' end,
    case when _approve then 'A second organizer approved the sealed identity break-glass request' else 'A second organizer rejected the sealed identity break-glass request' end,
    false,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'request_id', _request_id, 'status', v_next, 'approval_expires_at', v_expires);
end;
$$;
revoke all on function public.admin_decide_sealed_identity_disclosure(uuid, boolean, text) from public;
grant execute on function public.admin_decide_sealed_identity_disclosure(uuid, boolean, text) to authenticated;

create or replace function public.admin_reveal_sealed_identity(_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_requester uuid;
  v_status text;
  v_expires timestamptz;
  v_mode text;
  v_user uuid;
  v_email text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select case_id, requested_by, status, approval_expires_at
  into v_case_id, v_requester, v_status, v_expires
  from public.integrity_identity_disclosure_requests
  where id = _request_id
  for update;
  if v_case_id is null then raise exception 'Disclosure request not found'; end if;
  if v_status <> 'approved' then raise exception 'Sealed identity disclosure request is not approved'; end if;
  if v_requester <> auth.uid() then raise exception 'Only the organizer who requested disclosure may use the approved break-glass request'; end if;
  if v_expires is null or v_expires <= now() then raise exception 'Sealed identity disclosure approval has expired'; end if;

  select identity_mode, reporter_user_id
  into v_mode, v_user
  from public.integrity_cases
  where id = v_case_id;
  if v_mode <> 'sealed' then raise exception 'Case is no longer a sealed identity case'; end if;
  if v_user is null then raise exception 'Sealed reporter account is unavailable'; end if;

  select email into v_email from auth.users where id = v_user;

  update public.integrity_identity_disclosure_requests
  set status = 'used', disclosed_at = now()
  where id = _request_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    v_case_id,
    'identity.sealed_disclosed',
    'The sealed reporter identity was disclosed through the two-organizer break-glass process',
    true,
    auth.uid()
  );

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'request_id', _request_id);
end;
$$;
revoke all on function public.admin_reveal_sealed_identity(uuid) from public;
grant execute on function public.admin_reveal_sealed_identity(uuid) to authenticated;

create or replace function public.admin_identity_disclosure_requests()
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
      case d.status when 'pending' then 1 when 'approved' then 2 when 'used' then 3 else 4 end,
      d.requested_at desc)
    from public.integrity_identity_disclosure_requests d
    join public.integrity_cases c on c.id = d.case_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_identity_disclosure_requests() from public;
grant execute on function public.admin_identity_disclosure_requests() to authenticated;

commit;
