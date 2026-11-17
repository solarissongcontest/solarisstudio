begin;

select public.v3_register_migration_contract(
  'v3.integrity.appeal-revision-readback',
  1,
  'forward_fix_only',
  false,
  null,
  'Return the canonical appeal CAS version to the Organizer read models without changing read authorization or historical values'
);

-- Preserve the existing organizer-only read and redacted response contract.
-- The corresponding governed mutation RPCs now require p_expected_version.
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
        'version', a.version,
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
        'version', a.version,
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

revoke all on function public.admin_integrity_case_resolution(uuid) from public;
grant execute on function public.admin_integrity_case_resolution(uuid) to authenticated;

revoke all on function public.admin_integrity_appeals() from public;
grant execute on function public.admin_integrity_appeals() to authenticated;

commit;
