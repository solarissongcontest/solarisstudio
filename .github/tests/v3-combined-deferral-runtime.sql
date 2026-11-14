\set ON_ERROR_STOP on
begin;
do $deny$
declare actor_role text; relation_name text; command text; denied boolean;
begin
 if session_user<>'authenticator' then raise exception 'Actual API session required';end if;
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',actor_role);
  foreach relation_name in array array['televote_aggregations','televote_aggregation_participants','televote_aggregation_sources','external_score_entries','external_score_entry_log','combined_televote_results','combined_televote_component_results'] loop
   foreach command in array array[format('insert into televoting.%I default values',relation_name),format('update televoting.%I set id=id where false',relation_name),format('delete from televoting.%I where false',relation_name),format('truncate table televoting.%I cascade',relation_name)] loop
    denied:=false;begin execute command;exception when insufficient_privilege then denied:=true;end;
    if not denied then raise exception 'Combined bypass for %: %',actor_role,command;end if;
   end loop;
  end loop;
  denied:=false;begin perform private.v3_sync_published_televote_aggregation('53000000-0000-4000-8000-000000000001');exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Direct Combined sync accepted for %',actor_role;end if;
  reset role;
 end loop;
end $deny$;
rollback;
