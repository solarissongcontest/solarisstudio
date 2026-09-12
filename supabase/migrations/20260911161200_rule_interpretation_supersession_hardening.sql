begin;

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
  v_old_published timestamptz;
  v_new_published timestamptz;
  v_new_effective timestamptz;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _old_id = _replacement_id then raise exception 'An interpretation cannot supersede itself'; end if;

  select status, rule_ids, published_at
  into v_old_status, v_old_rules, v_old_published
  from public.ssc_rule_interpretations
  where id = _old_id
  for update;

  select status, rule_ids, published_at, effective_from
  into v_new_status, v_new_rules, v_new_published, v_new_effective
  from public.ssc_rule_interpretations
  where id = _replacement_id;

  if v_old_status is null or v_new_status is null then raise exception 'Interpretation not found'; end if;
  if v_old_status <> 'published' then raise exception 'Only a current published interpretation can be superseded'; end if;
  if v_new_status <> 'published' then raise exception 'Replacement interpretation must already be published'; end if;
  if v_new_effective is null or v_new_effective > now() then
    raise exception 'Replacement interpretation must already be effective before superseding public guidance';
  end if;
  if v_old_published is not null and v_new_published is not null and v_new_published < v_old_published then
    raise exception 'Replacement interpretation cannot predate the interpretation it supersedes';
  end if;
  if not (v_old_rules && v_new_rules) then
    raise exception 'Replacement interpretation must address at least one of the same rules';
  end if;

  update public.ssc_rule_interpretations
  set status = 'superseded', superseded_by = _replacement_id, updated_at = now()
  where id = _old_id;

  return jsonb_build_object('ok', true, 'id', _old_id, 'superseded_by', _replacement_id);
end;
$$;
revoke all on function public.admin_supersede_rule_interpretation(uuid, uuid) from public;
grant execute on function public.admin_supersede_rule_interpretation(uuid, uuid) to authenticated;

commit;
