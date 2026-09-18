begin;

-- Permission Engine v2 final cutover, part 1:
-- migrate the remaining Rules/Integrity Organizer helper boundary to explicit capabilities.

do $cutover$
declare
  v_target record;
  v_oid oid;
  v_def text;
  v_new_def text;
  v_legacy_occurrences integer;
begin
  for v_target in
    select *
    from (values
      ('public.admin_add_integrity_case_note(uuid,text)', 'integrity.manage'),
      ('public.admin_cancel_integrity_evidence_deletion(uuid,text)', 'integrity.manage'),
      ('public.admin_create_integrity_evidence_derivative_upload(uuid,text,text,bigint,text)', 'integrity.manage'),
      ('public.admin_create_integrity_evidence_disclosure_copy(uuid,text,text,text,boolean,text)', 'integrity.manage'),
      ('public.admin_create_rule_interpretation(text,text,text,text,text[],timestamp with time zone)', 'rules.edit'),
      ('public.admin_create_rule_interpretation_from_integrity_case(uuid,uuid,text,text,text,timestamp with time zone)', 'rules.edit'),
      ('public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])', 'integrity.sanction'),
      ('public.admin_decide_sealed_identity_disclosure(uuid,boolean,text)', 'integrity.manage'),
      ('public.admin_discard_expired_evidence_upload(uuid)', 'integrity.manage'),
      ('public.admin_finalize_integrity_evidence_deletion(uuid)', 'integrity.manage'),
      ('public.admin_finalize_integrity_evidence_derivative(uuid,text,text,text)', 'integrity.manage'),
      ('public.admin_grant_integrity_appeal_extension(uuid,timestamp with time zone,text)', 'integrity.manage'),
      ('public.admin_identity_disclosure_requests()', 'integrity.read'),
      ('public.admin_integrity_appeals()', 'integrity.read'),
      ('public.admin_integrity_case(uuid)', 'integrity.read'),
      ('public.admin_integrity_case_resolution(uuid)', 'integrity.read'),
      ('public.admin_integrity_cases()', 'integrity.read'),
      ('public.admin_integrity_evidence_access_descriptor(uuid,text)', 'integrity.read'),
      ('public.admin_integrity_evidence_access_log(uuid)', 'integrity.read'),
      ('public.admin_integrity_evidence_deletion_descriptor(uuid)', 'integrity.read'),
      ('public.admin_integrity_evidence_due_for_deletion()', 'integrity.read'),
      ('public.admin_integrity_expired_evidence_uploads()', 'integrity.read'),
      ('public.admin_integrity_expired_upload_deletion_descriptor(uuid)', 'integrity.read'),
      ('public.admin_integrity_preclearance_rulings(uuid)', 'integrity.read'),
      ('public.admin_integrity_reporter_identity(uuid)', 'integrity.read'),
      ('public.admin_link_integrity_cases(uuid,uuid,text,text)', 'integrity.manage'),
      ('public.admin_publish_integrity_decision(uuid,text,text,text,text[])', 'integrity.sanction'),
      ('public.admin_publish_rule_interpretation(uuid)', 'rules.publish'),
      ('public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)', 'integrity.manage'),
      ('public.admin_record_integrity_preclearance_ruling(uuid,text,text,text,text[])', 'integrity.manage'),
      ('public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)', 'integrity.sanction'),
      ('public.admin_recuse_from_integrity_case(uuid,text)', 'integrity.manage'),
      ('public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean)', 'integrity.manage'),
      ('public.admin_remove_integrity_rule_link(uuid,text)', 'integrity.manage'),
      ('public.admin_reply_integrity_case(uuid,text,boolean)', 'integrity.manage'),
      ('public.admin_request_sealed_identity_disclosure(uuid,text)', 'integrity.manage'),
      ('public.admin_reveal_sealed_identity(uuid)', 'integrity.manage'),
      ('public.admin_rule_interpretation_sources(uuid)', 'rules.read'),
      ('public.admin_rule_interpretations()', 'rules.read'),
      ('public.admin_schedule_integrity_evidence_deletion(uuid,timestamp with time zone,text)', 'integrity.manage'),
      ('public.admin_sealed_integrity_cases()', 'integrity.read'),
      ('public.admin_set_integrity_case_retention(uuid,timestamp with time zone,text)', 'integrity.manage'),
      ('public.admin_set_integrity_priority(uuid,text)', 'integrity.manage'),
      ('public.admin_set_integrity_retention(uuid,timestamp with time zone)', 'integrity.manage'),
      ('public.admin_supersede_rule_interpretation(uuid,uuid)', 'rules.publish'),
      ('public.admin_update_integrity_case_status(uuid,text)', 'integrity.manage'),
      ('public.admin_update_rule_interpretation(uuid,text,text,text,text,text[],timestamp with time zone)', 'rules.edit'),
      ('public.admin_upsert_integrity_rule_link(uuid,text,text,text)', 'integrity.manage'),
      ('public.integrity_can_read_evidence_object(text)', 'integrity.read'),
      ('public.integrity_can_upload_evidence(text)', 'integrity.manage')
    ) as mapped(signature, capability)
  loop
    v_oid := to_regprocedure(v_target.signature);
    if v_oid is null then
      raise exception 'Integrity capability cutover target missing: %', v_target.signature;
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_legacy_occurrences := (
      length(v_def) - length(replace(v_def, 'public.integrity_is_organizer()', ''))
    ) / length('public.integrity_is_organizer()');

    if v_legacy_occurrences <> 1 then
      raise exception 'Expected exactly one integrity_is_organizer gate in %, found %',
        v_target.signature, v_legacy_occurrences;
    end if;

    v_new_def := replace(
      v_def,
      'public.integrity_is_organizer()',
      format('public.studio2_access_allowed(%L, null, false)', v_target.capability)
    );

    execute v_new_def;
  end loop;
end
$cutover$;

create or replace function public.admin_assign_integrity_reviewer(
  _case_id uuid,
  _user_id uuid,
  _review_role text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $function$
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Integrity management capability required';
  end if;
  if _review_role not in ('triage', 'investigator', 'decision_maker', 'appeal_reviewer') then
    raise exception 'Invalid review role';
  end if;
  if not private.studio2_user_has_capability(_user_id, 'integrity.manage', null) then
    raise exception 'Reviewer must have integrity management capability';
  end if;

  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (_case_id, _user_id, _review_role, auth.uid())
  on conflict (case_id, user_id, review_role) do update
    set assigned_by = excluded.assigned_by,
        assigned_at = now(),
        recused_at = null,
        recusal_reason = null;

  update public.integrity_cases
  set assigned_to = case when _review_role = 'investigator' then _user_id else assigned_to end,
      updated_at = now()
  where id = _case_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (_case_id, 'reviewer.assigned', 'A ' || replace(_review_role, '_', ' ') || ' was assigned', false, auth.uid());

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.admin_assign_integrity_appeal_reviewer(
  _appeal_id uuid,
  _user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $function$
declare
  v_case_id uuid;
  v_status text;
  v_submitter uuid;
  v_sanction_creator uuid;
  v_finding_creator uuid;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Integrity sanction capability required';
  end if;
  if not private.studio2_user_has_capability(_user_id, 'integrity.sanction', null) then
    raise exception 'Appeal reviewer must have integrity sanction capability';
  end if;

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
$function$;

create or replace function public.admin_organizer_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private', 'auth'
as $function$
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Integrity management capability required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object('user_id', u.id, 'email', u.email)
      order by u.email
    )
    from auth.users u
    where private.studio2_user_has_capability(u.id, 'integrity.manage', null)
  ), '[]'::jsonb);
end;
$function$;

drop function public.integrity_is_organizer();

do $verify$
declare
  v_remaining bigint;
begin
  if to_regprocedure('public.integrity_is_organizer()') is not null then
    raise exception 'integrity_is_organizer helper still exists after cutover';
  end if;

  select count(*) into v_remaining
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and pg_get_functiondef(p.oid) ilike '%integrity_is_organizer%';

  if v_remaining <> 0 then
    raise exception 'Live integrity Organizer helper references remain: %', v_remaining;
  end if;

  if pg_get_functiondef(to_regprocedure('public.admin_assign_integrity_reviewer(uuid,uuid,text)'))
      ilike '%user_roles%' then
    raise exception 'Integrity reviewer assignment still depends on legacy user_roles';
  end if;

  if pg_get_functiondef(to_regprocedure('public.admin_assign_integrity_appeal_reviewer(uuid,uuid)'))
      ilike '%user_roles%' then
    raise exception 'Appeal reviewer assignment still depends on legacy user_roles';
  end if;

  if pg_get_functiondef(to_regprocedure('public.admin_organizer_directory()'))
      ilike '%user_roles%' then
    raise exception 'Integrity reviewer directory still depends on legacy user_roles';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;