begin;

-- Internal provenance only. Public interpretation APIs never join this table,
-- so a public ruling cannot reveal which protected Integrity case prompted it.
create table if not exists public.ssc_rule_interpretation_sources (
  interpretation_id uuid not null references public.ssc_rule_interpretations(id) on delete cascade,
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  ruling_id uuid not null references public.integrity_preclearance_rulings(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (interpretation_id, case_id, ruling_id)
);

create index if not exists ssc_rule_interpretation_sources_case_idx
  on public.ssc_rule_interpretation_sources(case_id, created_at desc);

alter table public.ssc_rule_interpretation_sources enable row level security;
revoke all on public.ssc_rule_interpretation_sources from anon, authenticated;

create or replace function public.admin_create_rule_interpretation_from_integrity_case(
  _case_id uuid,
  _ruling_id uuid,
  _title text,
  _interpretation text,
  _rationale text,
  _effective_from timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_kind text;
  v_ruling public.integrity_preclearance_rulings%rowtype;
  v_created jsonb;
  v_interpretation_id uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select c.case_kind into v_case_kind
  from public.integrity_cases c
  where c.id = _case_id;
  if v_case_kind is null then raise exception 'Integrity case not found'; end if;
  if v_case_kind <> 'rule_question' then
    raise exception 'Only a private rule question can seed an Official Interpretation';
  end if;

  select * into v_ruling
  from public.integrity_preclearance_rulings r
  where r.id = _ruling_id and r.case_id = _case_id;
  if v_ruling.id is null then raise exception 'Pre-clearance ruling not found for this case'; end if;

  -- The public question comes from the organiser-authored ruling summary rather
  -- than copying protected participant text into a future public record.
  v_created := public.admin_create_rule_interpretation(
    _title,
    v_ruling.summary,
    _interpretation,
    _rationale,
    v_ruling.rule_ids,
    _effective_from
  );
  v_interpretation_id := (v_created ->> 'id')::uuid;

  insert into public.ssc_rule_interpretation_sources(
    interpretation_id, case_id, ruling_id, created_by
  ) values (
    v_interpretation_id, _case_id, _ruling_id, auth.uid()
  );

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'preclearance.interpretation_draft_created',
    'TSBC created an internal Official Interpretation draft from recurring pre-clearance guidance',
    false,
    auth.uid()
  );

  return v_created || jsonb_build_object('source_case_id', _case_id, 'source_ruling_id', _ruling_id);
end;
$$;
revoke all on function public.admin_create_rule_interpretation_from_integrity_case(uuid, uuid, text, text, text, timestamptz) from public;
grant execute on function public.admin_create_rule_interpretation_from_integrity_case(uuid, uuid, text, text, text, timestamptz) to authenticated;

create or replace function public.admin_rule_interpretation_sources(_interpretation_id uuid)
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
      'case_id', s.case_id,
      'case_code', c.public_code,
      'ruling_id', s.ruling_id,
      'created_at', s.created_at
    ) order by s.created_at desc)
    from public.ssc_rule_interpretation_sources s
    join public.integrity_cases c on c.id = s.case_id
    where s.interpretation_id = _interpretation_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_rule_interpretation_sources(uuid) from public;
grant execute on function public.admin_rule_interpretation_sources(uuid) to authenticated;

commit;
