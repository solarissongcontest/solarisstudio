begin;

-- Permission Engine v2 cutover batch 19.
--
-- The Prediction Arena RPCs contain substantial business logic. Preserve their
-- canonical implementations by rewriting only the known legacy Organizer
-- authorization expressions from pg_get_functiondef. Every rewrite is guarded
-- by exact occurrence counts and post-rewrite verification so source drift
-- fails closed instead of silently changing unrelated Prediction behavior.

do $cutover$
declare
  v_name text;
  v_oid oid;
  v_before text;
  v_after text;
  v_legacy text := E'public.has_role(current_user_id, \'organizer\'::public.app_role)';
  v_replacement text := E'public.studio2_access_allowed(\'voting.manage\', (select s.edition_id from public.shows s where s.id = round_row.show_id), false)';
  v_occurrences integer;
  v_score_legacy text := E'  if current_user_id is null\n    or not public.has_role(current_user_id, \'organizer\'::public.app_role)\n  then';
  v_score_replacement text := E'  if current_user_id is null\n    or not public.studio2_access_allowed(\n      \'voting.manage\',\n      (\n        select s.edition_id\n        from public.prediction_rounds pr\n        join public.shows s on s.id = pr.show_id\n        where pr.id = _round_id\n      ),\n      false\n    )\n  then';
begin
  foreach v_name in array array['prediction_consensus', 'prediction_consensus_movement'] loop
    select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) = '_round_id uuid';

    if v_oid is null then
      raise exception '%(uuid) is missing', v_name using errcode = '42883';
    end if;

    select pg_get_functiondef(v_oid) into v_before;

    v_occurrences := (length(v_before) - length(replace(v_before, v_legacy, '')))
      / nullif(length(v_legacy), 0);

    if v_occurrences <> 2 then
      raise exception '% legacy authorization source drifted: expected 2 occurrences, found %',
        v_name, v_occurrences
        using errcode = 'P0001';
    end if;

    v_after := replace(v_before, v_legacy, v_replacement);

    if v_after = v_before then
      raise exception '% authorization rewrite made no change', v_name
        using errcode = 'P0001';
    end if;

    execute v_after;

    select pg_get_functiondef(p.oid)
    into v_after
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) = '_round_id uuid';

    if v_after ilike '%public.has_role(%' then
      raise exception '% cutover still contains public.has_role', v_name
        using errcode = 'P0001';
    end if;

    if v_after not ilike '%public.studio2_access_allowed(''voting.manage'', (select s.edition_id from public.shows s where s.id = round_row.show_id), false)%' then
      raise exception '% cutover is missing edition-scoped voting.manage access', v_name
        using errcode = 'P0001';
    end if;
  end loop;

  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'score_prediction_round'
    and pg_get_function_identity_arguments(p.oid) = '_round_id uuid';

  if v_oid is null then
    raise exception 'score_prediction_round(uuid) is missing' using errcode = '42883';
  end if;

  select pg_get_functiondef(v_oid) into v_before;

  v_occurrences := (length(v_before) - length(replace(v_before, v_score_legacy, '')))
    / nullif(length(v_score_legacy), 0);

  if v_occurrences <> 1 then
    raise exception 'score_prediction_round legacy authorization source drifted: expected 1 occurrence, found %',
      v_occurrences
      using errcode = 'P0001';
  end if;

  v_after := replace(v_before, v_score_legacy, v_score_replacement);

  if v_after = v_before then
    raise exception 'score_prediction_round authorization rewrite made no change'
      using errcode = 'P0001';
  end if;

  execute v_after;

  select pg_get_functiondef(p.oid)
  into v_after
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'score_prediction_round'
    and pg_get_function_identity_arguments(p.oid) = '_round_id uuid';

  if v_after ilike '%public.has_role(%' then
    raise exception 'score_prediction_round cutover still contains public.has_role'
      using errcode = 'P0001';
  end if;

  if v_after not ilike '%public.studio2_access_allowed(%voting.manage%' then
    raise exception 'score_prediction_round cutover is missing voting.manage access'
      using errcode = 'P0001';
  end if;

  if v_after not ilike '%from public.prediction_rounds pr%join public.shows s on s.id = pr.show_id%where pr.id = _round_id%' then
    raise exception 'score_prediction_round cutover is missing round-to-edition scope resolution'
      using errcode = 'P0001';
  end if;
end
$cutover$;

revoke all on function public.prediction_consensus(uuid) from public, anon;
grant execute on function public.prediction_consensus(uuid) to authenticated, service_role;

revoke all on function public.prediction_consensus_movement(uuid) from public, anon;
grant execute on function public.prediction_consensus_movement(uuid) to authenticated, service_role;

revoke all on function public.score_prediction_round(uuid) from public, anon;
grant execute on function public.score_prediction_round(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
