begin;

create or replace function public.integrity_sanction_label(_level integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case _level
    when 1 then 'Official Warning'
    when 2 then 'Loss of 50% of Bonus Points'
    when 3 then 'No Bonus Points Awarded'
    when 4 then '−5 Contest Points'
    when 5 then '−25 Contest Points'
    when 6 then '−50 Contest Points'
    when 7 then '−100 Contest Points'
    when 8 then 'Disqualification'
    when 9 then 'Disqualification + One-Edition Ban'
    when 10 then 'Lifetime Ban'
    else null
  end;
$$;
revoke all on function public.integrity_sanction_label(integer) from public;
grant execute on function public.integrity_sanction_label(integer) to authenticated;

create table if not exists public.integrity_case_sanctions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  finding_id uuid not null references public.integrity_case_findings(id) on delete restrict,
  typical_level integer null check (typical_level between 1 and 10),
  final_level integer not null check (final_level between 1 and 10),
  sanction_label text not null,
  target_type text not null check (target_type in ('participant', 'delegation', 'ballot', 'entry', 'account', 'other')),
  target_reference text null,
  aggravating_factors text[] not null default '{}',
  mitigating_factors text[] not null default '{}',
  rationale text not null,
  status text not null default 'active' check (status in ('active', 'modified_on_appeal', 'overturned')),
  supersedes_sanction_id uuid null references public.integrity_case_sanctions(id) on delete set null,
  visible_to_reporter boolean not null default true,
  effective_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sanction_label_matches_level check (sanction_label = public.integrity_sanction_label(final_level)),
  constraint sanction_not_self_superseding check (supersedes_sanction_id is null or supersedes_sanction_id <> id)
);
create index if not exists integrity_case_sanctions_case_created_idx
  on public.integrity_case_sanctions(case_id, created_at desc);
create index if not exists integrity_case_sanctions_finding_idx
  on public.integrity_case_sanctions(finding_id);

create table if not exists public.integrity_case_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  sanction_id uuid not null references public.integrity_case_sanctions(id) on delete restrict,
  grounds text not null,
  submitted_by_user_id uuid null references auth.users(id) on delete set null,
  submitted_via text not null check (submitted_via in ('protected_reporter', 'anonymous_recovery', 'organizer')),
  submitted_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  was_timely boolean not null,
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'upheld', 'reduced', 'increased', 'overturned',
    'rejected_late', 'rejected_ineligible'
  )),
  assigned_reviewer uuid null references auth.users(id) on delete set null,
  decision_rationale text null,
  replacement_sanction_id uuid null references public.integrity_case_sanctions(id) on delete set null,
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists integrity_case_appeals_case_created_idx
  on public.integrity_case_appeals(case_id, created_at desc);
create index if not exists integrity_case_appeals_status_idx
  on public.integrity_case_appeals(status, submitted_at desc);

alter table public.integrity_case_sanctions enable row level security;
alter table public.integrity_case_appeals enable row level security;
revoke all on public.integrity_case_sanctions from anon, authenticated;
revoke all on public.integrity_case_appeals from anon, authenticated;

create or replace function public.admin_record_integrity_sanction(
  _case_id uuid,
  _finding_id uuid,
  _typical_level integer,
  _final_level integer,
  _target_type text,
  _target_reference text,
  _aggravating_factors text[] default '{}',
  _mitigating_factors text[] default '{}',
  _rationale text default '',
  _visible_to_reporter boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_label text;
  v_outcome text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _final_level not between 1 and 10 then raise exception 'Final sanction level must be between 1 and 10'; end if;
  if _typical_level is not null and _typical_level not between 1 and 10 then raise exception 'Typical sanction level must be between 1 and 10'; end if;
  if _target_type not in ('participant', 'delegation', 'ballot', 'entry', 'account', 'other') then raise exception 'Invalid sanction target type'; end if;
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then raise exception 'Sanction rationale must be between 20 and 12000 characters'; end if;

  select outcome into v_outcome
  from public.integrity_case_findings
  where id = _finding_id and case_id = _case_id;
  if v_outcome is null then raise exception 'Finding does not belong to this case'; end if;
  if v_outcome <> 'violation' then raise exception 'A sanction requires a confirmed violation finding'; end if;

  v_label := public.integrity_sanction_label(_final_level);
  insert into public.integrity_case_sanctions(
    case_id, finding_id, typical_level, final_level, sanction_label,
    target_type, target_reference, aggravating_factors, mitigating_factors,
    rationale, visible_to_reporter, created_by
  ) values (
    _case_id, _finding_id, _typical_level, _final_level, v_label,
    _target_type, nullif(trim(coalesce(_target_reference, '')), ''),
    coalesce(_aggravating_factors, '{}'), coalesce(_mitigating_factors, '{}'),
    _rationale, _visible_to_reporter, auth.uid()
  ) returning id into v_id;

  update public.integrity_cases
  set status = 'action_taken', updated_at = now(), closed_at = null
  where id = _case_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'sanction.recorded',
    'Level ' || _final_level || ' sanction recorded: ' || v_label,
    _visible_to_reporter,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'sanction_id', v_id, 'level', _final_level, 'label', v_label);
end;
$$;
revoke all on function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean) from public;
grant execute on function public.admin_record_integrity_sanction(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean) to authenticated;

create or replace function public.reporter_submit_integrity_appeal(_case_id uuid, _sanction_id uuid, _grounds text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_effective_at timestamptz;
  v_id uuid;
  v_deadline timestamptz;
  v_timely boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id and c.reporter_user_id = auth.uid() and c.identity_mode in ('sealed', 'confidential')
  ) then raise exception 'Case not available'; end if;

  _grounds := trim(coalesce(_grounds, ''));
  if char_length(_grounds) < 20 or char_length(_grounds) > 12000 then raise exception 'Appeal grounds must be between 20 and 12000 characters'; end if;
  select effective_at into v_effective_at
  from public.integrity_case_sanctions
  where id = _sanction_id and case_id = _case_id and status = 'active' and visible_to_reporter = true;
  if v_effective_at is null then raise exception 'Appealable sanction not found'; end if;
  if exists (select 1 from public.integrity_case_appeals where sanction_id = _sanction_id and submitted_via <> 'organizer') then raise exception 'An appeal has already been submitted for this sanction'; end if;

  v_deadline := v_effective_at + interval '48 hours';
  v_timely := now() <= v_deadline;
  insert into public.integrity_case_appeals(
    case_id, sanction_id, grounds, submitted_by_user_id, submitted_via,
    deadline_at, was_timely, status
  ) values (
    _case_id, _sanction_id, _grounds, auth.uid(), 'protected_reporter',
    v_deadline, v_timely, case when v_timely then 'submitted' else 'rejected_late' end
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (
    _case_id,
    'appeal.submitted',
    case when v_timely then 'Appeal submitted within the 48-hour window' else 'Appeal submitted after the 48-hour window' end,
    auth.uid()
  );
  return jsonb_build_object('ok', true, 'appeal_id', v_id, 'was_timely', v_timely, 'deadline_at', v_deadline);
end;
$$;
revoke all on function public.reporter_submit_integrity_appeal(uuid, uuid, text) from public;
grant execute on function public.reporter_submit_integrity_appeal(uuid, uuid, text) to authenticated;

create or replace function public.public_submit_anonymous_integrity_appeal(
  _case_code text,
  _recovery_key text,
  _sanction_id uuid,
  _grounds text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_hash text;
  v_effective_at timestamptz;
  v_deadline timestamptz;
  v_timely boolean;
  v_id uuid;
begin
  _grounds := trim(coalesce(_grounds, ''));
  if char_length(_grounds) < 20 or char_length(_grounds) > 12000 then raise exception 'Appeal grounds must be between 20 and 12000 characters'; end if;
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');

  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;
  if v_case_id is null then return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.'); end if;

  select effective_at into v_effective_at
  from public.integrity_case_sanctions
  where id = _sanction_id and case_id = v_case_id and status = 'active' and visible_to_reporter = true;
  if v_effective_at is null then raise exception 'Appealable sanction not found'; end if;
  if exists (select 1 from public.integrity_case_appeals where sanction_id = _sanction_id and submitted_via <> 'organizer') then raise exception 'An appeal has already been submitted for this sanction'; end if;

  v_deadline := v_effective_at + interval '48 hours';
  v_timely := now() <= v_deadline;
  insert into public.integrity_case_appeals(
    case_id, sanction_id, grounds, submitted_by_user_id, submitted_via,
    deadline_at, was_timely, status
  ) values (
    v_case_id, _sanction_id, _grounds, null, 'anonymous_recovery',
    v_deadline, v_timely, case when v_timely then 'submitted' else 'rejected_late' end
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (
    v_case_id,
    'appeal.submitted',
    case when v_timely then 'Anonymous appeal submitted within the 48-hour window' else 'Anonymous appeal submitted after the 48-hour window' end,
    null
  );
  return jsonb_build_object('ok', true, 'appeal_id', v_id, 'was_timely', v_timely, 'deadline_at', v_deadline);
end;
$$;
revoke all on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) from public;
grant execute on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) to anon, authenticated;

create or replace function public.admin_assign_integrity_appeal_reviewer(_appeal_id uuid, _user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_sanction_creator uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role::text = 'organizer') then raise exception 'Appeal reviewer must be an organizer'; end if;

  select a.case_id, s.created_by into v_case_id, v_sanction_creator
  from public.integrity_case_appeals a
  join public.integrity_case_sanctions s on s.id = a.sanction_id
  where a.id = _appeal_id;
  if v_case_id is null then raise exception 'Appeal not found'; end if;
  if _user_id = v_sanction_creator then raise exception 'The original sanction decision-maker cannot be the appeal reviewer'; end if;

  update public.integrity_case_appeals
  set assigned_reviewer = _user_id,
      status = case when status = 'submitted' then 'under_review' else status end
  where id = _appeal_id;

  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (v_case_id, _user_id, 'appeal_reviewer', auth.uid())
  on conflict (case_id, user_id, review_role) do update
    set assigned_by = excluded.assigned_by, assigned_at = now(), recused_at = null, recusal_reason = null;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'appeal.reviewer_assigned', 'A fresh appeal reviewer was assigned', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) from public;
grant execute on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) to authenticated;

create or replace function public.admin_decide_integrity_appeal(
  _appeal_id uuid,
  _outcome text,
  _decision_rationale text,
  _replacement_level integer default null,
  _aggravating_factors text[] default '{}',
  _mitigating_factors text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_sanction_id uuid;
  v_original_level integer;
  v_finding_id uuid;
  v_target_type text;
  v_target_reference text;
  v_visible boolean;
  v_assigned uuid;
  v_status text;
  v_replacement_id uuid;
  v_label text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _outcome not in ('upheld', 'reduced', 'increased', 'overturned', 'rejected_ineligible') then raise exception 'Invalid appeal outcome'; end if;
  _decision_rationale := trim(coalesce(_decision_rationale, ''));
  if char_length(_decision_rationale) < 20 or char_length(_decision_rationale) > 12000 then raise exception 'Appeal rationale must be between 20 and 12000 characters'; end if;

  select a.case_id, a.sanction_id, a.assigned_reviewer, a.status,
         s.final_level, s.finding_id, s.target_type, s.target_reference, s.visible_to_reporter
  into v_case_id, v_sanction_id, v_assigned, v_status,
       v_original_level, v_finding_id, v_target_type, v_target_reference, v_visible
  from public.integrity_case_appeals a
  join public.integrity_case_sanctions s on s.id = a.sanction_id
  where a.id = _appeal_id
  for update;

  if v_case_id is null then raise exception 'Appeal not found'; end if;
  if v_status not in ('submitted', 'under_review') then raise exception 'Appeal has already been decided'; end if;
  if v_assigned is null then raise exception 'Assign a fresh appeal reviewer before deciding the appeal'; end if;
  if v_assigned <> auth.uid() then raise exception 'Only the assigned appeal reviewer may decide this appeal'; end if;

  if _outcome in ('reduced', 'increased') then
    if _replacement_level not between 1 and 10 then raise exception 'Replacement sanction level must be between 1 and 10'; end if;
    if _outcome = 'reduced' and _replacement_level >= v_original_level then raise exception 'A reduced appeal outcome must use a lower sanction level'; end if;
    if _outcome = 'increased' and _replacement_level <= v_original_level then raise exception 'An increased appeal outcome must use a higher sanction level'; end if;

    v_label := public.integrity_sanction_label(_replacement_level);
    insert into public.integrity_case_sanctions(
      case_id, finding_id, typical_level, final_level, sanction_label,
      target_type, target_reference, aggravating_factors, mitigating_factors,
      rationale, status, supersedes_sanction_id, visible_to_reporter, created_by
    ) values (
      v_case_id, v_finding_id, v_original_level, _replacement_level, v_label,
      v_target_type, v_target_reference, coalesce(_aggravating_factors, '{}'),
      coalesce(_mitigating_factors, '{}'), _decision_rationale, 'active',
      v_sanction_id, v_visible, auth.uid()
    ) returning id into v_replacement_id;

    update public.integrity_case_sanctions set status = 'modified_on_appeal' where id = v_sanction_id;
  elsif _outcome = 'overturned' then
    update public.integrity_case_sanctions set status = 'overturned' where id = v_sanction_id;
  end if;

  update public.integrity_case_appeals
  set status = _outcome,
      decision_rationale = _decision_rationale,
      replacement_sanction_id = v_replacement_id,
      decided_by = auth.uid(),
      decided_at = now()
  where id = _appeal_id;

  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'appeal.decided', 'Appeal outcome: ' || replace(_outcome, '_', ' '), auth.uid());

  return jsonb_build_object('ok', true, 'outcome', _outcome, 'replacement_sanction_id', v_replacement_id);
end;
$$;
revoke all on function public.admin_decide_integrity_appeal(uuid, text, text, integer, text[], text[]) from public;
grant execute on function public.admin_decide_integrity_appeal(uuid, text, text, integer, text[], text[]) to authenticated;

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
        'decided_at', a.decided_at
      ) order by a.created_at desc)
      from public.integrity_case_appeals a where a.case_id = _case_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_integrity_case_resolution(uuid) from public;
grant execute on function public.admin_integrity_case_resolution(uuid) to authenticated;

commit;
