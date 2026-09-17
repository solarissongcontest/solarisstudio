begin;

-- Permission Engine v2 cutover batch 19.
--
-- Prediction Arena has three remaining legacy Organizer checks. The two
-- consensus RPCs use Organizer only as an elevated bypass for unpublished or
-- draft/cancelled rounds; scoring is an Organizer-only mutation. There is no
-- dedicated prediction capability in the live catalog, and broad read grants
-- such as edition.read/voting.read include viewer-class roles, so all three
-- elevated paths intentionally map to edition-scoped non-strict voting.manage.
--
-- Keep the substantial prediction implementations byte-for-byte from the live
-- migration-replayed definitions and replace only the canonical legacy role
-- predicate. Clean migration history already creates all three functions.

do $cutover$
declare
  v_name text;
  v_oid oid;
  v_before text;
  v_after text;
  v_legacy constant text := 'public.has_role(current_user_id, ''organizer''::public.app_role)';
  v_replacement constant text := 'public.studio2_access_allowed(''voting.manage'', (select s.edition_id from public.prediction_rounds pr join public.shows s on s.id = pr.show_id where pr.id = _round_id), false)';
begin
  foreach v_name in array array[
    'prediction_consensus',
    'prediction_consensus_movement',
    'score_prediction_round'
  ] loop
    select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) = '_round_id uuid'
    limit 1;

    if v_oid is null then
      raise exception 'Prediction Arena cutover target missing: %(_round_id uuid)', v_name;
    end if;

    v_before := pg_get_functiondef(v_oid);

    if strpos(v_before, v_legacy) = 0 then
      raise exception 'Prediction Arena authorization source clause drifted for %; refusing cutover', v_name;
    end if;

    v_after := replace(v_before, v_legacy, v_replacement);

    if v_after = v_before then
      raise exception 'Prediction Arena authorization rewrite made no change for %', v_name;
    end if;

    if strpos(v_after, v_legacy) > 0 then
      raise exception 'Prediction Arena legacy Organizer predicate remains after rewrite for %', v_name;
    end if;

    if strpos(v_after, 'studio2_access_allowed(''voting.manage''') = 0 then
      raise exception 'Prediction Arena voting.manage predicate missing after rewrite for %', v_name;
    end if;

    execute v_after;
  end loop;
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
