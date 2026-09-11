begin;

create sequence if not exists public.ssc_rule_interpretation_number_seq;

create table if not exists public.ssc_rule_interpretations (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  title text not null,
  question text not null,
  interpretation text not null,
  rationale text not null,
  rule_ids text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  effective_from timestamptz null,
  published_at timestamptz null,
  superseded_by uuid null references public.ssc_rule_interpretations(id) on delete restrict,
  created_by uuid null references auth.users(id) on delete set null,
  published_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ssc_rule_interpretation_has_rules check (cardinality(rule_ids) > 0),
  constraint ssc_rule_interpretation_publication_consistency check (
    (status = 'draft' and published_at is null and published_by is null and superseded_by is null)
    or
    (status = 'published' and published_at is not null and published_by is not null and superseded_by is null)
    or
    (status = 'superseded' and published_at is not null and published_by is not null and superseded_by is not null)
  ),
  constraint ssc_rule_interpretation_not_self_superseded check (superseded_by is null or superseded_by <> id)
);

create index if not exists ssc_rule_interpretations_rules_idx
  on public.ssc_rule_interpretations using gin(rule_ids);
create index if not exists ssc_rule_interpretations_publication_idx
  on public.ssc_rule_interpretations(status, effective_from desc, published_at desc);

alter table public.ssc_rule_interpretations enable row level security;
revoke all on public.ssc_rule_interpretations from anon, authenticated;
revoke all on sequence public.ssc_rule_interpretation_number_seq from anon, authenticated;

create or replace function public.integrity_validate_rule_ids(_rule_ids text[])
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_rule text;
begin
  if coalesce(cardinality(_rule_ids), 0) < 1 or cardinality(_rule_ids) > 12 then
    raise exception 'An interpretation must reference between 1 and 12 rules';
  end if;
  foreach v_rule in array _rule_ids loop
    if trim(coalesce(v_rule, '')) !~ '^[0-9]+\.[0-9]+$' then
      raise exception 'Invalid SSC rule id: %', v_rule;
    end if;
  end loop;
end;
$$;
revoke all on function public.integrity_validate_rule_ids(text[]) from public;

create or replace function public.admin_rule_interpretations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'code', i.code,
      'title', i.title,
      'question', i.question,
      'interpretation', i.interpretation,
      'rationale', i.rationale,
      'rule_ids', i.rule_ids,
      'status', i.status,
      'effective_from', i.effective_from,
      'published_at', i.published_at,
      'superseded_by', i.superseded_by,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ) order by
      case i.status when 'draft' then 1 when 'published' then 2 else 3 end,
      i.updated_at desc
    ) from public.ssc_rule_interpretations i
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_rule_interpretations() from public;
grant execute on function public.admin_rule_interpretations() to authenticated;

create or replace function public.admin_create_rule_interpretation(
  _title text,
  _question text,
  _interpretation text,
  _rationale text,
  _rule_ids text[],
  _effective_from timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
  v_rules text[];
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  perform public.integrity_validate_rule_ids(_rule_ids);
  _title := trim(coalesce(_title, ''));
  _question := trim(coalesce(_question, ''));
  _interpretation := trim(coalesce(_interpretation, ''));
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_title) < 3 or char_length(_title) > 180 then raise exception 'Title must be between 3 and 180 characters'; end if;
  if char_length(_question) < 10 or char_length(_question) > 2000 then raise exception 'Question must be between 10 and 2000 characters'; end if;
  if char_length(_interpretation) < 20 or char_length(_interpretation) > 8000 then raise exception 'Interpretation must be between 20 and 8000 characters'; end if;
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then raise exception 'Rationale must be between 20 and 12000 characters'; end if;

  select array_agg(distinct trim(u.rule_id) order by trim(u.rule_id))
  into v_rules
  from unnest(_rule_ids) as u(rule_id);

  v_code := 'SSC-INT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.ssc_rule_interpretation_number_seq')::text, 4, '0');
  insert into public.ssc_rule_interpretations(
    code, title, question, interpretation, rationale, rule_ids, effective_from, created_by
  ) values (
    v_code, _title, _question, _interpretation, _rationale,
    v_rules,
    _effective_from,
    auth.uid()
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end;
$$;
revoke all on function public.admin_create_rule_interpretation(text, text, text, text, text[], timestamptz) from public;
grant execute on function public.admin_create_rule_interpretation(text, text, text, text, text[], timestamptz) to authenticated;

create or replace function public.admin_update_rule_interpretation(
  _id uuid,
  _title text,
  _question text,
  _interpretation text,
  _rationale text,
  _rule_ids text[],
  _effective_from timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_rules text[];
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select status into v_status from public.ssc_rule_interpretations where id = _id for update;
  if v_status is null then raise exception 'Interpretation not found'; end if;
  if v_status <> 'draft' then raise exception 'Published interpretations are immutable; supersede them with a new interpretation'; end if;
  perform public.integrity_validate_rule_ids(_rule_ids);
  _title := trim(coalesce(_title, ''));
  _question := trim(coalesce(_question, ''));
  _interpretation := trim(coalesce(_interpretation, ''));
  _rationale := trim(coalesce(_rationale, ''));
  if char_length(_title) < 3 or char_length(_title) > 180 then raise exception 'Title must be between 3 and 180 characters'; end if;
  if char_length(_question) < 10 or char_length(_question) > 2000 then raise exception 'Question must be between 10 and 2000 characters'; end if;
  if char_length(_interpretation) < 20 or char_length(_interpretation) > 8000 then raise exception 'Interpretation must be between 20 and 8000 characters'; end if;
  if char_length(_rationale) < 20 or char_length(_rationale) > 12000 then raise exception 'Rationale must be between 20 and 12000 characters'; end if;

  select array_agg(distinct trim(u.rule_id) order by trim(u.rule_id))
  into v_rules
  from unnest(_rule_ids) as u(rule_id);

  update public.ssc_rule_interpretations
  set title = _title,
      question = _question,
      interpretation = _interpretation,
      rationale = _rationale,
      rule_ids = v_rules,
      effective_from = _effective_from,
      updated_at = now()
  where id = _id;
  return jsonb_build_object('ok', true, 'id', _id);
end;
$$;
revoke all on function public.admin_update_rule_interpretation(uuid, text, text, text, text, text[], timestamptz) from public;
grant execute on function public.admin_update_rule_interpretation(uuid, text, text, text, text, text[], timestamptz) to authenticated;

create or replace function public.admin_publish_rule_interpretation(_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text; v_effective timestamptz;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select status, effective_from into v_status, v_effective
  from public.ssc_rule_interpretations where id = _id for update;
  if v_status is null then raise exception 'Interpretation not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft interpretations can be published'; end if;

  update public.ssc_rule_interpretations
  set status = 'published',
      effective_from = coalesce(v_effective, now()),
      published_at = now(),
      published_by = auth.uid(),
      updated_at = now()
  where id = _id;
  return jsonb_build_object('ok', true, 'id', _id, 'status', 'published');
end;
$$;
revoke all on function public.admin_publish_rule_interpretation(uuid) from public;
grant execute on function public.admin_publish_rule_interpretation(uuid) to authenticated;

create or replace function public.admin_supersede_rule_interpretation(_old_id uuid, _replacement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_new_status text;
  v_old_rules text[];
  v_new_rules text[];
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _old_id = _replacement_id then raise exception 'An interpretation cannot supersede itself'; end if;

  select status, rule_ids into v_old_status, v_old_rules from public.ssc_rule_interpretations where id = _old_id for update;
  select status, rule_ids into v_new_status, v_new_rules from public.ssc_rule_interpretations where id = _replacement_id;
  if v_old_status is null or v_new_status is null then raise exception 'Interpretation not found'; end if;
  if v_old_status <> 'published' then raise exception 'Only a current published interpretation can be superseded'; end if;
  if v_new_status <> 'published' then raise exception 'Replacement interpretation must already be published'; end if;
  if not (v_old_rules && v_new_rules) then raise exception 'Replacement interpretation must address at least one of the same rules'; end if;

  update public.ssc_rule_interpretations
  set status = 'superseded', superseded_by = _replacement_id, updated_at = now()
  where id = _old_id;
  return jsonb_build_object('ok', true, 'id', _old_id, 'superseded_by', _replacement_id);
end;
$$;
revoke all on function public.admin_supersede_rule_interpretation(uuid, uuid) from public;
grant execute on function public.admin_supersede_rule_interpretation(uuid, uuid) to authenticated;

create or replace function public.public_rule_interpretations(_rule_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'code', i.code,
    'title', i.title,
    'question', i.question,
    'interpretation', i.interpretation,
    'rationale', i.rationale,
    'rule_ids', i.rule_ids,
    'status', i.status,
    'effective_from', i.effective_from,
    'published_at', i.published_at,
    'superseded_by', i.superseded_by
  ) order by
    case i.status when 'published' then 1 else 2 end,
    i.effective_from desc nulls last,
    i.published_at desc
  ), '[]'::jsonb)
  from public.ssc_rule_interpretations i
  where i.status in ('published', 'superseded')
    and i.effective_from <= now()
    and (_rule_id is null or trim(_rule_id) = any(i.rule_ids));
$$;
revoke all on function public.public_rule_interpretations(text) from public;
grant execute on function public.public_rule_interpretations(text) to anon, authenticated;

commit;
