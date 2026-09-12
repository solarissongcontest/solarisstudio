begin;

alter table public.integrity_case_appeals
  add column if not exists extension_granted_at timestamptz null,
  add column if not exists extension_granted_by uuid null references auth.users(id) on delete set null,
  add column if not exists extension_reason text null;

alter table public.integrity_case_appeals
  drop constraint if exists integrity_appeal_extension_consistency;
alter table public.integrity_case_appeals
  add constraint integrity_appeal_extension_consistency check (
    (extension_granted_at is null and extension_granted_by is null and extension_reason is null)
    or
    (extension_granted_at is not null and extension_granted_by is not null and extension_reason is not null)
  );

create or replace function public.admin_grant_integrity_appeal_extension(
  _appeal_id uuid,
  _new_deadline timestamptz,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_status text;
  v_submitted_at timestamptz;
  v_old_deadline timestamptz;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if char_length(_reason) < 10 or char_length(_reason) > 4000 then
    raise exception 'Extension reason must be between 10 and 4000 characters';
  end if;

  select case_id, status, submitted_at, deadline_at
  into v_case_id, v_status, v_submitted_at, v_old_deadline
  from public.integrity_case_appeals
  where id = _appeal_id
  for update;

  if v_case_id is null then raise exception 'Appeal not found'; end if;
  if v_status <> 'rejected_late' then
    raise exception 'Only an appeal rejected as late can receive an exceptional deadline extension';
  end if;
  if _new_deadline is null or _new_deadline <= v_old_deadline then
    raise exception 'Extended deadline must be later than the original appeal deadline';
  end if;
  if _new_deadline < v_submitted_at then
    raise exception 'Extended deadline must cover the already-submitted appeal';
  end if;
  if _new_deadline > v_old_deadline + interval '14 days' then
    raise exception 'Exceptional appeal extensions cannot exceed 14 days without a rulebook change';
  end if;

  update public.integrity_case_appeals
  set deadline_at = _new_deadline,
      was_timely = true,
      status = 'submitted',
      extension_granted_at = now(),
      extension_granted_by = auth.uid(),
      extension_reason = _reason
  where id = _appeal_id;

  insert into public.integrity_case_events(
    case_id, event_type, detail, visible_to_reporter, actor_user_id
  ) values (
    v_case_id,
    'appeal.extension_granted',
    'An exceptional appeal deadline extension was granted: ' || _reason,
    true,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'appeal_id', _appeal_id,
    'deadline_at', _new_deadline,
    'status', 'submitted'
  );
end;
$$;
revoke all on function public.admin_grant_integrity_appeal_extension(uuid, timestamptz, text) from public;
grant execute on function public.admin_grant_integrity_appeal_extension(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_integrity_case_resolution(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return jsonb_build_object(
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'finding_id', s.finding_id,
        'typical_level', s.typical_level,
        'final_level', s.final_level,
        'sanction_label', s.sanction_label,
        'target_type', s.target_type,
        'target_reference', s.target_reference,
        'aggravating_factors', s.aggravating_factors,
        'mitigating_factors', s.mitigating_factors,
        'rationale', s.rationale,
        'status', s.status,
        'supersedes_sanction_id', s.supersedes_sanction_id,
        'visible_to_reporter', s.visible_to_reporter,
        'effective_at', s.effective_at,
        'created_at', s.created_at
      ) order by s.created_at desc)
      from public.integrity_case_sanctions s where s.case_id = _case_id
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'sanction_id', a.sanction_id,
        'grounds', a.grounds,
        'submitted_via', a.submitted_via,
        'submitted_at', a.submitted_at,
        'deadline_at', a.deadline_at,
        'was_timely', a.was_timely,
        'status', a.status,
        'assigned_reviewer', a.assigned_reviewer,
        'decision_rationale', a.decision_rationale,
        'replacement_sanction_id', a.replacement_sanction_id,
        'extension_granted_at', a.extension_granted_at,
        'extension_reason', a.extension_reason,
        'decided_at', a.decided_at
      ) order by a.created_at desc)
      from public.integrity_case_appeals a where a.case_id = _case_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_integrity_case_resolution(uuid) from public;
grant execute on function public.admin_integrity_case_resolution(uuid) to authenticated;

create or replace function public.integrity_reporter_resolution_snapshot(_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'finding_id', s.finding_id,
        'typical_level', s.typical_level,
        'final_level', s.final_level,
        'sanction_label', s.sanction_label,
        'target_type', s.target_type,
        'target_reference', s.target_reference,
        'aggravating_factors', s.aggravating_factors,
        'mitigating_factors', s.mitigating_factors,
        'rationale', s.rationale,
        'status', s.status,
        'supersedes_sanction_id', s.supersedes_sanction_id,
        'effective_at', s.effective_at,
        'created_at', s.created_at,
        'appeal_deadline', s.effective_at + interval '48 hours'
      ) order by s.created_at desc)
      from public.integrity_case_sanctions s
      where s.case_id = _case_id and s.visible_to_reporter = true
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'sanction_id', a.sanction_id,
        'grounds', a.grounds,
        'submitted_at', a.submitted_at,
        'deadline_at', a.deadline_at,
        'was_timely', a.was_timely,
        'status', a.status,
        'decision_rationale', a.decision_rationale,
        'replacement_sanction_id', a.replacement_sanction_id,
        'extension_granted_at', a.extension_granted_at,
        'extension_reason', a.extension_reason,
        'decided_at', a.decided_at
      ) order by a.created_at desc)
      from public.integrity_case_appeals a
      where a.case_id = _case_id and a.submitted_via in ('protected_reporter', 'anonymous_recovery')
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.integrity_reporter_resolution_snapshot(uuid) from public;

commit;
