begin;

create or replace function public.admin_reply_integrity_case(_case_id uuid, _body text, _request_response boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Message must be between 2 and 8000 characters'; end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by) values (_case_id, 'tsbc', _body, auth.uid());
  if _request_response then
    insert into public.integrity_case_requests(case_id, request_kind, prompt, created_by) values (_case_id, 'clarification', _body, auth.uid());
  end if;
  update public.integrity_cases set status = case when _request_response then 'waiting_for_reporter' else status end, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (_case_id, case when _request_response then 'tsbc.question' else 'tsbc.message' end, case when _request_response then 'TSBC requested more information' else 'TSBC sent a case update' end, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_reply_integrity_case(uuid, text, boolean) from public;
grant execute on function public.admin_reply_integrity_case(uuid, text, boolean) to authenticated;

create or replace function public.admin_update_integrity_case_status(_case_id uuid, _status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_old text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _status not in ('received', 'awaiting_review', 'under_review', 'waiting_for_reporter', 'investigation_opened', 'action_taken', 'closed_no_violation', 'closed_insufficient_evidence', 'closed_outside_jurisdiction', 'closed_duplicate', 'closed') then raise exception 'Invalid integrity case status'; end if;
  select status into v_old from public.integrity_cases where id = _case_id for update;
  if v_old is null then raise exception 'Integrity case not found'; end if;
  update public.integrity_cases set status = _status, updated_at = now(), closed_at = case when _status like 'closed%' then coalesce(closed_at, now()) else null end where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (_case_id, 'status.changed', 'Status changed from ' || v_old || ' to ' || _status, auth.uid());
  return jsonb_build_object('ok', true, 'status', _status);
end;
$$;
revoke all on function public.admin_update_integrity_case_status(uuid, text) from public;
grant execute on function public.admin_update_integrity_case_status(uuid, text) to authenticated;

create or replace function public.admin_add_integrity_case_note(_case_id uuid, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Note must be between 2 and 8000 characters'; end if;
  insert into public.integrity_case_internal_notes(case_id, body, created_by) values (_case_id, _body, auth.uid());
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'internal.note', 'Internal investigator note added', false, auth.uid());
  update public.integrity_cases set updated_at = now() where id = _case_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_add_integrity_case_note(uuid, text) from public;
grant execute on function public.admin_add_integrity_case_note(uuid, text) to authenticated;

create or replace function public.admin_set_integrity_priority(_case_id uuid, _priority text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _priority not in ('information', 'standard', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  update public.integrity_cases set priority = _priority, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'priority.changed', 'Case priority changed to ' || _priority, false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_integrity_priority(uuid, text) from public;
grant execute on function public.admin_set_integrity_priority(uuid, text) to authenticated;

create or replace function public.admin_upsert_integrity_rule_link(_case_id uuid, _rule_id text, _relevance text default 'reviewed', _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _rule_id := trim(coalesce(_rule_id, ''));
  _relevance := lower(trim(coalesce(_relevance, 'reviewed')));
  if _rule_id !~ '^[0-9]+\.[0-9]+$' then raise exception 'Invalid SSC rule id'; end if;
  if _relevance not in ('alleged', 'reviewed', 'context', 'supported', 'not_supported') then raise exception 'Invalid rule relevance'; end if;
  insert into public.integrity_case_rule_links(case_id, rule_id, relevance, note, added_by)
  values (_case_id, _rule_id, _relevance, nullif(trim(coalesce(_note, '')), ''), auth.uid())
  on conflict (case_id, rule_id) do update set relevance = excluded.relevance, note = excluded.note, added_by = excluded.added_by, updated_at = now();
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'rule.linked', 'Rule ' || _rule_id || ' marked ' || replace(_relevance, '_', ' '), false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) from public;
grant execute on function public.admin_upsert_integrity_rule_link(uuid, text, text, text) to authenticated;

create or replace function public.admin_remove_integrity_rule_link(_case_id uuid, _rule_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  delete from public.integrity_case_rule_links where case_id = _case_id and rule_id = trim(_rule_id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_remove_integrity_rule_link(uuid, text) from public;
grant execute on function public.admin_remove_integrity_rule_link(uuid, text) to authenticated;

create or replace function public.admin_record_integrity_finding(_case_id uuid, _outcome text, _summary text, _rationale text, _rule_ids text[] default '{}', _visible_to_reporter boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_finding_id uuid; v_status text; v_rule text; v_relevance text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _outcome not in ('violation', 'no_violation', 'insufficient_evidence', 'outside_jurisdiction', 'duplicate', 'administrative_resolution') then raise exception 'Invalid outcome'; end if;
  _summary := trim(coalesce(_summary, ''));
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_summary) < 5 or char_length(_summary) > 240 then raise exception 'Finding summary must be between 5 and 240 characters'; end if;
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then raise exception 'Finding rationale must be between 20 and 12000 characters'; end if;
  foreach v_rule in array coalesce(_rule_ids, '{}') loop
    if trim(v_rule) !~ '^[0-9]+\.[0-9]+$' then raise exception 'Invalid SSC rule id: %', v_rule; end if;
  end loop;
  insert into public.integrity_case_findings(case_id, outcome, summary, rationale, rule_ids, visible_to_reporter, created_by)
  values (_case_id, _outcome, _summary, _rationale, coalesce(_rule_ids, '{}'), _visible_to_reporter, auth.uid()) returning id into v_finding_id;
  v_relevance := case when _outcome = 'violation' then 'supported' when _outcome = 'no_violation' then 'not_supported' else 'reviewed' end;
  foreach v_rule in array coalesce(_rule_ids, '{}') loop
    insert into public.integrity_case_rule_links(case_id, rule_id, relevance, added_by)
    values (_case_id, trim(v_rule), v_relevance, auth.uid())
    on conflict (case_id, rule_id) do update set relevance = excluded.relevance, added_by = excluded.added_by, updated_at = now();
  end loop;
  v_status := case _outcome when 'violation' then 'action_taken' when 'no_violation' then 'closed_no_violation' when 'insufficient_evidence' then 'closed_insufficient_evidence' when 'outside_jurisdiction' then 'closed_outside_jurisdiction' when 'duplicate' then 'closed_duplicate' else 'closed' end;
  update public.integrity_cases set status = v_status, updated_at = now(), closed_at = case when v_status like 'closed%' then coalesce(closed_at, now()) else null end where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'finding.recorded', _summary, _visible_to_reporter, auth.uid());
  return jsonb_build_object('ok', true, 'finding_id', v_finding_id, 'status', v_status);
end;
$$;
revoke all on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) from public;
grant execute on function public.admin_record_integrity_finding(uuid, text, text, text, text[], boolean) to authenticated;

create or replace function public.admin_assign_integrity_reviewer(_case_id uuid, _user_id uuid, _review_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _review_role not in ('triage', 'investigator', 'decision_maker', 'appeal_reviewer') then raise exception 'Invalid review role'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role::text = 'organizer') then raise exception 'Reviewer must be an organizer'; end if;
  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (_case_id, _user_id, _review_role, auth.uid())
  on conflict (case_id, user_id, review_role) do update set assigned_by = excluded.assigned_by, assigned_at = now(), recused_at = null, recusal_reason = null;
  update public.integrity_cases set assigned_to = case when _review_role = 'investigator' then _user_id else assigned_to end, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'reviewer.assigned', 'A ' || replace(_review_role, '_', ' ') || ' was assigned', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_assign_integrity_reviewer(uuid, uuid, text) from public;
grant execute on function public.admin_assign_integrity_reviewer(uuid, uuid, text) to authenticated;

create or replace function public.admin_recuse_from_integrity_case(_case_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if char_length(_reason) < 5 then raise exception 'Provide a short recusal reason'; end if;
  update public.integrity_case_reviewers set recused_at = now(), recusal_reason = _reason where case_id = _case_id and user_id = auth.uid() and recused_at is null;
  update public.integrity_cases set assigned_to = null, updated_at = now() where id = _case_id and assigned_to = auth.uid();
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'reviewer.recused', 'Reviewer recused due to a recorded conflict of interest', false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_recuse_from_integrity_case(uuid, text) from public;
grant execute on function public.admin_recuse_from_integrity_case(uuid, text) to authenticated;

create or replace function public.admin_link_integrity_cases(_case_id uuid, _related_case_id uuid, _relation_type text, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _case_id = _related_case_id then raise exception 'A case cannot be related to itself'; end if;
  if _relation_type not in ('related', 'duplicate', 'corroborating', 'same_incident', 'appeal_of') then raise exception 'Invalid relation type'; end if;
  insert into public.integrity_case_relations(case_id, related_case_id, relation_type, note, created_by)
  values (_case_id, _related_case_id, _relation_type, nullif(trim(coalesce(_note, '')), ''), auth.uid())
  on conflict (case_id, related_case_id, relation_type) do update set note = excluded.note;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'case.linked', 'Case linked as ' || replace(_relation_type, '_', ' '), false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_link_integrity_cases(uuid, uuid, text, text) from public;
grant execute on function public.admin_link_integrity_cases(uuid, uuid, text, text) to authenticated;

create or replace function public.admin_integrity_reporter_identity(_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_mode text; v_user uuid; v_email text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select identity_mode, reporter_user_id into v_mode, v_user from public.integrity_cases where id = _case_id;
  if v_mode is null then raise exception 'Case not found'; end if;
  if v_mode = 'anonymous' then raise exception 'Fully anonymous cases have no reporter identity'; end if;
  if v_mode = 'sealed' then raise exception 'Reporter identity is sealed and cannot be revealed to case reviewers'; end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'identity.accessed', 'Confidential reporter identity was accessed by an organizer', false, auth.uid());
  return jsonb_build_object('user_id', v_user, 'email', v_email);
end;
$$;
revoke all on function public.admin_integrity_reporter_identity(uuid) from public;
grant execute on function public.admin_integrity_reporter_identity(uuid) to authenticated;

create or replace function public.admin_organizer_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', ur.user_id, 'email', au.email) order by au.email) from public.user_roles ur left join auth.users au on au.id = ur.user_id where ur.role::text = 'organizer'), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_organizer_directory() from public;
grant execute on function public.admin_organizer_directory() to authenticated;

create or replace function public.admin_set_integrity_retention(_case_id uuid, _retention_until timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  update public.integrity_cases set retention_until = _retention_until, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'retention.changed', case when _retention_until is null then 'No automatic retention date is set' else 'Retention date updated' end, false, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_set_integrity_retention(uuid, timestamptz) from public;
grant execute on function public.admin_set_integrity_retention(uuid, timestamptz) to authenticated;

create or replace function public.admin_publish_integrity_decision(_case_id uuid, _title text, _summary text, _rationale text, _rule_ids text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_category text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select category into v_category from public.integrity_cases where id = _case_id;
  if v_category is null then raise exception 'Case not found'; end if;
  insert into public.integrity_public_decisions(case_id, title, category, summary, rationale, rule_ids, published_by)
  values (_case_id, trim(_title), v_category, trim(_summary), trim(_rationale), coalesce(_rule_ids, '{}'), auth.uid()) returning id into v_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id) values (_case_id, 'decision.published', 'An anonymised integrity decision was published', false, auth.uid());
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.admin_publish_integrity_decision(uuid, text, text, text, text[]) from public;
grant execute on function public.admin_publish_integrity_decision(uuid, text, text, text, text[]) to authenticated;

create or replace function public.public_integrity_decisions()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'category', d.category, 'summary', d.summary, 'rationale', d.rationale, 'rule_ids', d.rule_ids, 'published_at', d.published_at) order by d.published_at desc), '[]'::jsonb)
  from public.integrity_public_decisions d;
$$;
revoke all on function public.public_integrity_decisions() from public;
grant execute on function public.public_integrity_decisions() to anon, authenticated;

create or replace function public.public_integrity_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_cases', count(*),
    'open_cases', count(*) filter (where status not like 'closed%'),
    'resolved_cases', count(*) filter (where status like 'closed%' or status = 'action_taken'),
    'violations_confirmed', (select count(*) from public.integrity_case_findings where outcome = 'violation'),
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from public.integrity_cases group by category) x), '{}'::jsonb)
  ) from public.integrity_cases;
$$;
revoke all on function public.public_integrity_stats() from public;
grant execute on function public.public_integrity_stats() to anon, authenticated;

commit;
