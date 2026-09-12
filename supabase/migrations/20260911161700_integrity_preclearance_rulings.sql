begin;

create table if not exists public.integrity_preclearance_rulings (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  outcome text not null check (outcome in ('allowed', 'not_allowed', 'needs_more_information', 'guidance_only')),
  summary text not null,
  rationale text not null,
  rule_ids text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint integrity_preclearance_has_rules check (cardinality(rule_ids) > 0)
);

create index if not exists integrity_preclearance_case_created_idx
  on public.integrity_preclearance_rulings(case_id, created_at desc);
create index if not exists integrity_preclearance_rules_idx
  on public.integrity_preclearance_rulings using gin(rule_ids);

alter table public.integrity_preclearance_rulings enable row level security;
revoke all on public.integrity_preclearance_rulings from anon, authenticated;

create or replace function public.admin_record_integrity_preclearance_ruling(
  _case_id uuid,
  _outcome text,
  _summary text,
  _rationale text,
  _rule_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_kind text;
  v_id uuid;
  v_rules text[];
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select c.case_kind into v_case_kind
  from public.integrity_cases c
  where c.id = _case_id
  for update;

  if v_case_kind is null then raise exception 'Integrity case not found'; end if;
  if v_case_kind <> 'rule_question' then raise exception 'Pre-clearance rulings are only available for private rule questions'; end if;

  _outcome := lower(trim(coalesce(_outcome, '')));
  if _outcome not in ('allowed', 'not_allowed', 'needs_more_information', 'guidance_only') then
    raise exception 'Invalid pre-clearance outcome';
  end if;

  _summary := trim(coalesce(_summary, ''));
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_summary) < 5 or char_length(_summary) > 500 then
    raise exception 'Pre-clearance summary must be between 5 and 500 characters';
  end if;
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then
    raise exception 'Pre-clearance rationale must be between 20 and 12000 characters';
  end if;

  perform public.integrity_validate_rule_ids(_rule_ids);
  select array_agg(distinct trim(u.rule_id) order by trim(u.rule_id))
  into v_rules
  from unnest(_rule_ids) as u(rule_id);

  insert into public.integrity_preclearance_rulings(
    case_id, outcome, summary, rationale, rule_ids, created_by
  ) values (
    _case_id, _outcome, _summary, _rationale, v_rules, auth.uid()
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'preclearance.ruling',
    case _outcome
      when 'allowed' then 'TSBC issued an Allowed pre-clearance ruling'
      when 'not_allowed' then 'TSBC issued a Not allowed pre-clearance ruling'
      when 'needs_more_information' then 'TSBC requested more information before issuing a final pre-clearance position'
      else 'TSBC issued guidance-only pre-clearance advice'
    end,
    true,
    auth.uid()
  );

  update public.integrity_cases
  set status = case when _outcome = 'needs_more_information' then 'waiting_for_reporter' else status end,
      updated_at = now()
  where id = _case_id;

  return jsonb_build_object('ok', true, 'ruling_id', v_id, 'outcome', _outcome, 'rule_ids', v_rules);
end;
$$;
revoke all on function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[]) from public;
grant execute on function public.admin_record_integrity_preclearance_ruling(uuid, text, text, text, text[]) to authenticated;

create or replace function public.admin_integrity_preclearance_rulings(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if not exists (select 1 from public.integrity_cases c where c.id = _case_id) then
    raise exception 'Integrity case not found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'outcome', r.outcome,
      'summary', r.summary,
      'rationale', r.rationale,
      'rule_ids', r.rule_ids,
      'created_at', r.created_at
    ) order by r.created_at, r.id)
    from public.integrity_preclearance_rulings r
    where r.case_id = _case_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_preclearance_rulings(uuid) from public;
grant execute on function public.admin_integrity_preclearance_rulings(uuid) to authenticated;

create or replace function public.reporter_integrity_preclearance_rulings(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id and c.reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'outcome', r.outcome,
      'summary', r.summary,
      'rationale', r.rationale,
      'rule_ids', r.rule_ids,
      'created_at', r.created_at
    ) order by r.created_at, r.id)
    from public.integrity_preclearance_rulings r
    where r.case_id = _case_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.reporter_integrity_preclearance_rulings(uuid) from public;
grant execute on function public.reporter_integrity_preclearance_rulings(uuid) to authenticated;

commit;
