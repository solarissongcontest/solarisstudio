\set ON_ERROR_STOP on
begin;
do $boundary$
declare t text; r text; c text; f text;
begin
 foreach t in array array['rounds','round_results','round_influence_results','televote_aggregations','televote_aggregation_sources','televote_aggregation_participants','external_score_entries','combined_televote_component_results','combined_televote_results'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,format('televoting.%I',t),'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw DML remains on % for %',t,r; end if;
   for c in select attname from pg_attribute where attrelid=format('televoting.%I',t)::regclass and attnum>0 and not attisdropped loop
    if has_column_privilege(r,format('televoting.%I',t),c,'INSERT,UPDATE') then raise exception 'Column DML remains on %.% for %',t,c,r; end if;
   end loop;
  end loop;
 end loop;
 foreach f in array array['televoting.v3_configure_round(uuid,text,jsonb,bigint,uuid,text,uuid)','televoting.v3_calculate_combined(uuid,bigint,uuid,text)','televoting.studio2_apply_round_status_change(uuid,text,uuid,text,bigint,bigint)'] loop
  if not (select prosecdef from pg_proc where oid=f::regprocedure) then raise exception 'Canonical function % is invoker',f; end if;
 end loop;
 if not has_table_privilege('anon','televoting.rounds','SELECT') or not has_table_privilege('authenticated','televoting.rounds','SELECT') then raise exception 'Public/Organizer round reads broken'; end if;
end $boundary$;
set local role authenticated;
do $raw$ begin
 begin update televoting.rounds set name='raw write' where false; raise exception 'Raw round update accepted'; exception when insufficient_privilege then null; end;
end $raw$;
reset role;
set local role service_role;
do $raw$ begin
 begin update televoting.rounds set name='raw service write' where false; raise exception 'Service raw round update accepted'; exception when insufficient_privilege then null; end;
end $raw$;
rollback;
