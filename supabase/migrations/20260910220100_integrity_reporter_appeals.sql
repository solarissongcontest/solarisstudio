begin;

create unique index if not exists integrity_case_one_reporter_appeal_per_sanction_idx
  on public.integrity_case_appeals(sanction_id)
  where submitted_via in ('protected_reporter', 'anonymous_recovery');

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
        'decided_at', a.decided_at
      ) order by a.created_at desc)
      from public.integrity_case_appeals a
      where a.case_id = _case_id and a.submitted_via in ('protected_reporter', 'anonymous_recovery')
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.integrity_reporter_resolution_snapshot(uuid) from public;

create or replace function public.reporter_integrity_case_resolution(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id
      and c.reporter_user_id = auth.uid()
      and c.identity_mode in ('sealed', 'confidential')
  ) then
    raise exception 'Case not available';
  end if;
  return public.integrity_reporter_resolution_snapshot(_case_id);
end;
$$;
revoke all on function public.reporter_integrity_case_resolution(uuid) from public;
grant execute on function public.reporter_integrity_case_resolution(uuid) to authenticated;

create or replace function public.public_get_anonymous_integrity_resolution(_case_code text, _recovery_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_hash text;
begin
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;

  if v_case_id is null then
    return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.');
  end if;
  return jsonb_build_object('ok', true, 'resolution', public.integrity_reporter_resolution_snapshot(v_case_id));
end;
$$;
revoke all on function public.public_get_anonymous_integrity_resolution(text, text) from public;
grant execute on function public.public_get_anonymous_integrity_resolution(text, text) to anon, authenticated;

create or replace function public.admin_assign_integrity_appeal_reviewer(_appeal_id uuid, _user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_sanction_creator uuid;
  v_finding_creator uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role::text = 'organizer'
  ) then raise exception 'Appeal reviewer must be an organizer'; end if;

  select a.case_id, s.created_by, f.created_by
  into v_case_id, v_sanction_creator, v_finding_creator
  from public.integrity_case_appeals a
  join public.integrity_case_sanctions s on s.id = a.sanction_id
  join public.integrity_case_findings f on f.id = s.finding_id
  where a.id = _appeal_id;

  if v_case_id is null then raise exception 'Appeal not found'; end if;
  if _user_id = v_sanction_creator then
    raise exception 'The original sanction decision-maker cannot be the appeal reviewer';
  end if;
  if _user_id = v_finding_creator then
    raise exception 'The original finding author cannot be the appeal reviewer';
  end if;

  update public.integrity_case_appeals
  set assigned_reviewer = _user_id,
      status = case when status = 'submitted' then 'under_review' else status end
  where id = _appeal_id;

  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (v_case_id, _user_id, 'appeal_reviewer', auth.uid())
  on conflict (case_id, user_id, review_role) do update
    set assigned_by = excluded.assigned_by,
        assigned_at = now(),
        recused_at = null,
        recusal_reason = null;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'appeal.reviewer_assigned', 'A fresh appeal reviewer was assigned', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) from public;
grant execute on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) to authenticated;

commit;
