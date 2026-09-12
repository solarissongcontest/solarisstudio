begin;

create or replace function public.public_create_anonymous_integrity_case(
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null,
  _case_kind text default 'report'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_code text;
  v_secret_raw text;
  v_secret_pretty text;
  v_hash text;
  v_priority text := 'standard';
  v_attempt integer := 0;
begin
  _category := lower(trim(coalesce(_category, '')));
  _case_kind := lower(trim(coalesce(_case_kind, 'report')));
  _summary := trim(coalesce(_summary, ''));
  _details := trim(coalesce(_details, ''));
  _observed_facts := nullif(trim(coalesce(_observed_facts, '')), '');
  _uncertainties := nullif(trim(coalesce(_uncertainties, '')), '');
  _edition_reference := nullif(trim(coalesce(_edition_reference, '')), '');

  if _category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then raise exception 'Invalid integrity report category'; end if;
  if _case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then raise exception 'Invalid case kind'; end if;
  if char_length(_summary) < 5 or char_length(_summary) > 180 then raise exception 'Summary must be between 5 and 180 characters'; end if;
  if char_length(_details) < 20 or char_length(_details) > 12000 then raise exception 'Details must be between 20 and 12000 characters'; end if;
  if coalesce(array_length(_related_countries, 1), 0) > 12 then raise exception 'Too many related countries'; end if;

  if _category = 'safety' or _case_kind = 'safety' then v_priority := 'urgent';
  elsif _category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then v_priority := 'high';
  elsif _case_kind = 'rule_question' then v_priority := 'information'; end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.integrity_cases where public_code = v_code);
    if v_attempt > 8 then raise exception 'Could not allocate anonymous case code'; end if;
  end loop;

  v_secret_raw := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_secret_pretty := regexp_replace(v_secret_raw, '(.{4})(?=.)', '\1-', 'g');
  v_hash := encode(extensions.digest(convert_to(v_secret_raw, 'UTF8'), 'sha256'), 'hex');

  insert into public.integrity_cases(
    public_code, case_kind, category, identity_mode, reporter_user_id,
    summary, details, observed_facts, uncertainties, related_countries,
    edition_reference, status, priority
  ) values (
    v_code, _case_kind, _category, 'anonymous', null,
    _summary, _details, _observed_facts, _uncertainties,
    coalesce(_related_countries, '{}'), _edition_reference, 'received', v_priority
  ) returning id into v_case_id;

  insert into public.integrity_case_access(case_id, recovery_secret_hash)
  values (v_case_id, v_hash);
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', _details, null);
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'case.created', 'Anonymous case received', null);

  return jsonb_build_object('ok', true, 'case_code', v_code, 'recovery_key', v_secret_pretty, 'status', 'received', 'priority', v_priority, 'created_at', now());
end;
$$;
revoke all on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) from public;
grant execute on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) to anon, authenticated;

create or replace function public.public_get_anonymous_integrity_case(_case_code text, _recovery_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case_id uuid; v_hash text;
begin
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;
  if v_case_id is null then return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.'); end if;
  return jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));
end;
$$;
revoke all on function public.public_get_anonymous_integrity_case(text, text) from public;
grant execute on function public.public_get_anonymous_integrity_case(text, text) to anon, authenticated;

create or replace function public.public_reply_anonymous_integrity_case(_case_code text, _recovery_key text, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case_id uuid; v_hash text;
begin
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Message must be between 2 and 8000 characters'; end if;
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case_id
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1;
  if v_case_id is null then return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.'); end if;

  insert into public.integrity_case_messages(case_id, author_role, body, created_by) values (v_case_id, 'reporter', _body, null);
  update public.integrity_case_requests set status = 'responded', responded_at = now() where case_id = v_case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases set status = case when status = 'waiting_for_reporter' then 'under_review' else status end, updated_at = now() where id = v_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (v_case_id, 'reporter.message', 'Additional information received', null);
  return jsonb_build_object('ok', true, 'snapshot', public.integrity_case_snapshot(v_case_id));
end;
$$;
revoke all on function public.public_reply_anonymous_integrity_case(text, text, text) from public;
grant execute on function public.public_reply_anonymous_integrity_case(text, text, text) to anon, authenticated;

create or replace function public.create_protected_integrity_case(
  _identity_mode text,
  _case_kind text,
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_user uuid := auth.uid(); v_case_id uuid; v_code text; v_priority text := 'standard';
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  _identity_mode := lower(trim(coalesce(_identity_mode, '')));
  _case_kind := lower(trim(coalesce(_case_kind, 'report')));
  _category := lower(trim(coalesce(_category, 'other')));
  _summary := trim(coalesce(_summary, ''));
  _details := trim(coalesce(_details, ''));

  if _identity_mode not in ('sealed', 'confidential') then raise exception 'Protected cases must use sealed or confidential identity mode'; end if;
  if _case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then raise exception 'Invalid case kind'; end if;
  if _category not in ('voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse', 'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other') then raise exception 'Invalid category'; end if;
  if char_length(_summary) < 5 or char_length(_summary) > 180 then raise exception 'Summary must be between 5 and 180 characters'; end if;
  if char_length(_details) < 20 or char_length(_details) > 12000 then raise exception 'Details must be between 20 and 12000 characters'; end if;

  if _category = 'safety' or _case_kind = 'safety' then v_priority := 'urgent';
  elsif _category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then v_priority := 'high';
  elsif _case_kind = 'rule_question' then v_priority := 'information'; end if;

  loop
    v_code := case when _identity_mode = 'sealed' then 'SR-' else 'CR-' end || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.integrity_cases where public_code = v_code);
  end loop;

  insert into public.integrity_cases(public_code, case_kind, category, identity_mode, reporter_user_id, summary, details, observed_facts, uncertainties, related_countries, edition_reference, priority)
  values (v_code, _case_kind, _category, _identity_mode, v_user, _summary, _details, nullif(trim(coalesce(_observed_facts, '')), ''), nullif(trim(coalesce(_uncertainties, '')), ''), coalesce(_related_countries, '{}'), nullif(trim(coalesce(_edition_reference, '')), ''), v_priority)
  returning id into v_case_id;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by) values (v_case_id, 'reporter', _details, v_user);
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (v_case_id, 'case.created', case when _identity_mode = 'sealed' then 'Sealed-identity case received' else 'Confidential case received' end, v_user);
  return jsonb_build_object('ok', true, 'case_id', v_case_id, 'case_code', v_code);
end;
$$;
revoke all on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) from public;
grant execute on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) to authenticated;

create or replace function public.reporter_integrity_cases()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'public_code', c.public_code,
    'case_kind', c.case_kind,
    'category', c.category,
    'identity_mode', c.identity_mode,
    'summary', c.summary,
    'status', c.status,
    'priority', c.priority,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
  from public.integrity_cases c
  where c.reporter_user_id = auth.uid();
$$;
revoke all on function public.reporter_integrity_cases() from public;
grant execute on function public.reporter_integrity_cases() to authenticated;

create or replace function public.reporter_integrity_case(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.integrity_cases c where c.id = _case_id and c.reporter_user_id = auth.uid()) then raise exception 'Case not available'; end if;
  return public.integrity_case_snapshot(_case_id);
end;
$$;
revoke all on function public.reporter_integrity_case(uuid) from public;
grant execute on function public.reporter_integrity_case(uuid) to authenticated;

create or replace function public.reporter_reply_integrity_case(_case_id uuid, _body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.integrity_cases c where c.id = _case_id and c.reporter_user_id = auth.uid()) then raise exception 'Case not available'; end if;
  _body := trim(coalesce(_body, ''));
  if char_length(_body) < 2 or char_length(_body) > 8000 then raise exception 'Message must be between 2 and 8000 characters'; end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by) values (_case_id, 'reporter', _body, auth.uid());
  update public.integrity_case_requests set status = 'responded', responded_at = now() where case_id = _case_id and status = 'open' and visible_to_reporter = true;
  update public.integrity_cases set status = case when status = 'waiting_for_reporter' then 'under_review' else status end, updated_at = now() where id = _case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id) values (_case_id, 'reporter.message', 'Reporter response received', auth.uid());
  return public.integrity_case_snapshot(_case_id);
end;
$$;
revoke all on function public.reporter_reply_integrity_case(uuid, text) from public;
grant execute on function public.reporter_reply_integrity_case(uuid, text) to authenticated;

create or replace function public.admin_integrity_cases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'public_code', c.public_code, 'case_kind', c.case_kind, 'category', c.category,
    'identity_mode', c.identity_mode, 'summary', c.summary, 'status', c.status, 'priority', c.priority,
    'related_countries', c.related_countries, 'edition_reference', c.edition_reference,
    'created_at', c.created_at, 'updated_at', c.updated_at, 'assigned_to', c.assigned_to,
    'reporter_identity_available', (c.identity_mode = 'confidential' and c.reporter_user_id is not null)
  ) order by case c.priority when 'urgent' then 1 when 'high' then 2 when 'standard' then 3 else 4 end, c.updated_at desc) from public.integrity_cases c), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_cases() from public;
grant execute on function public.admin_integrity_cases() to authenticated;

create or replace function public.admin_integrity_case(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return (select jsonb_build_object(
    'case', to_jsonb(c) - 'reporter_user_id',
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from public.integrity_case_messages m where m.case_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at, n.id) from public.integrity_case_internal_notes n where n.case_id = c.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id) from public.integrity_case_events e where e.case_id = c.id), '[]'::jsonb),
    'rule_links', coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_id) from public.integrity_case_rule_links r where r.case_id = c.id), '[]'::jsonb),
    'findings', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at, f.id) from public.integrity_case_findings f where f.case_id = c.id), '[]'::jsonb),
    'reviewers', coalesce((select jsonb_agg(jsonb_build_object('user_id', rv.user_id, 'email', au.email, 'review_role', rv.review_role, 'assigned_at', rv.assigned_at, 'recused_at', rv.recused_at, 'recusal_reason', rv.recusal_reason) order by rv.assigned_at) from public.integrity_case_reviewers rv left join auth.users au on au.id = rv.user_id where rv.case_id = c.id), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('id', rel.id, 'related_case_id', rel.related_case_id, 'related_public_code', rc.public_code, 'relation_type', rel.relation_type, 'note', rel.note, 'created_at', rel.created_at) order by rel.created_at) from public.integrity_case_relations rel join public.integrity_cases rc on rc.id = rel.related_case_id where rel.case_id = c.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(rq) order by rq.created_at) from public.integrity_case_requests rq where rq.case_id = c.id), '[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(to_jsonb(ev) order by ev.created_at, ev.id) from public.integrity_case_evidence ev where ev.case_id = c.id), '[]'::jsonb)
  ) from public.integrity_cases c where c.id = _case_id);
end;
$$;
revoke all on function public.admin_integrity_case(uuid) from public;
grant execute on function public.admin_integrity_case(uuid) to authenticated;

commit;
