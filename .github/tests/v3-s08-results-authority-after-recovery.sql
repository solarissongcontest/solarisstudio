\set ON_ERROR_STOP on
-- Read and recompute canonical Results on the restored S08-protected catalog
-- WITHOUT manually seeding public.televote_votes. The complete synthetic
-- rank/qualification/reconciliation fixture still runs before S08 in the
-- same observed non-superuser recovery chain.
begin;
do $post_s08_results$
declare
  s uuid;
  v_history jsonb;
  v_frozen jsonb;
  v_status jsonb;
  v_denied boolean;
begin
  foreach s in array array[
    '51000000-0000-4000-8000-000000000002'::uuid,
    '51000000-0000-4000-8000-000000000003'::uuid
  ] loop
    select jsonb_agg(to_jsonb(r) order by r.id) into v_history
    from public.results r where r.show_id=s
      and r.country_id in (
        '51000000-0000-4000-8000-000000000013',
        '51000000-0000-4000-8000-000000000014'
      );
    select result_rows into v_frozen
    from private.v3_result_versions where show_id=s and version=1;
    if v_frozen is null then
      raise exception 'Post-S08 historical Result snapshot missing for %',s;
    end if;
    perform public.sync_show_results_from_votes(s);
    v_status:=private.studio2_result_reconciliation(s);
    if v_status is null or not (v_status ? 'reconciliationConsistent') then
      raise exception 'Post-S08 canonical Results reconciliation unavailable for %',s;
    end if;
    if v_frozen is distinct from (
      select result_rows from private.v3_result_versions
      where show_id=s and version=1
    ) then
      raise exception 'Post-S08 canonical sync rewrote historical frozen Results';
    end if;
    if v_history is distinct from (
      select jsonb_agg(to_jsonb(r) order by r.id)
      from public.results r where r.show_id=s
        and r.country_id in (
          '51000000-0000-4000-8000-000000000013',
          '51000000-0000-4000-8000-000000000014'
        )
    ) then
      raise exception 'Post-S08 canonical Results sync rewrote inactive history';
    end if;
  end loop;
  if has_function_privilege('authenticated',
       'public.sync_show_results_from_votes(uuid)','EXECUTE')
     or has_function_privilege('anon',
       'private.studio2_result_reconciliation(uuid)','EXECUTE') then
    raise exception 'Post-S08 Results mutation/reconciliation ACL leaked';
  end if;
  execute 'set local role authenticated';
  v_denied:=false;
  begin
    perform public.sync_show_results_from_votes(null);
  exception when insufficient_privilege then
    v_denied:=true;
  end;
  reset role;
  if not v_denied then
    raise exception 'Post-S08 unauthorized Results sync execution accepted';
  end if;
end $post_s08_results$;
rollback;
select 'PASS: post-S08 restored Results canonical sync, historical preservation and API denial';
