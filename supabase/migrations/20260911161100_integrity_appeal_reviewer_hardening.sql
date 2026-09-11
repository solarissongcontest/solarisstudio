begin;

create or replace function public.admin_assign_integrity_appeal_reviewer(_appeal_id uuid, _user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_status text;
  v_submitter uuid;
  v_sanction_creator uuid;
  v_finding_creator uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role::text = 'organizer'
  ) then raise exception 'Appeal reviewer must be an organizer'; end if;

  select a.case_id, a.status, a.submitted_by_user_id, s.created_by, f.created_by
  into v_case_id, v_status, v_submitter, v_sanction_creator, v_finding_creator
  from public.integrity_case_appeals a
  join public.integrity_case_sanctions s on s.id = a.sanction_id
  join public.integrity_case_findings f on f.id = s.finding_id
  where a.id = _appeal_id
  for update of a;

  if v_case_id is null then raise exception 'Appeal not found'; end if;
  if v_status not in ('submitted', 'under_review') then
    raise exception 'Only an active submitted appeal can receive a reviewer';
  end if;
  if v_submitter is not null and _user_id = v_submitter then
    raise exception 'The appeal submitter cannot review their own appeal';
  end if;
  if _user_id = v_sanction_creator then
    raise exception 'The original sanction decision-maker cannot be the appeal reviewer';
  end if;
  if _user_id = v_finding_creator then
    raise exception 'The original finding author cannot be the appeal reviewer';
  end if;

  update public.integrity_case_appeals
  set assigned_reviewer = _user_id,
      status = 'under_review'
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

  return jsonb_build_object('ok', true, 'status', 'under_review');
end;
$$;
revoke all on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) from public;
grant execute on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) to authenticated;

commit;
