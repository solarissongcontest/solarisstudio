begin;

create or replace function public.admin_integrity_appeals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'case_id', a.case_id,
      'case_code', c.public_code,
      'case_summary', c.summary,
      'category', c.category,
      'identity_mode', c.identity_mode,
      'priority', c.priority,
      'sanction_id', a.sanction_id,
      'sanction_level', s.final_level,
      'sanction_label', s.sanction_label,
      'grounds', a.grounds,
      'submitted_via', a.submitted_via,
      'submitted_at', a.submitted_at,
      'deadline_at', a.deadline_at,
      'was_timely', a.was_timely,
      'status', a.status,
      'assigned_reviewer', a.assigned_reviewer,
      'extension_granted_at', a.extension_granted_at,
      'extension_reason', a.extension_reason,
      'decided_at', a.decided_at
    ) order by
      case a.status
        when 'submitted' then 1
        when 'under_review' then 2
        when 'rejected_late' then 3
        else 4
      end,
      c.priority = 'urgent' desc,
      a.submitted_at asc
    )
    from public.integrity_case_appeals a
    join public.integrity_cases c on c.id = a.case_id
    join public.integrity_case_sanctions s on s.id = a.sanction_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_appeals() from public;
grant execute on function public.admin_integrity_appeals() to authenticated;

commit;
