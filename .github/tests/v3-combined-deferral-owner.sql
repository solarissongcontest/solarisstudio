\set ON_ERROR_STOP on
begin;
do $owner$
declare relation_name text;command text;denied boolean;
begin
 if current_user<>'postgres' or (select rolsuper from pg_roles where rolname=current_user) then raise exception 'Observed nonsuperuser owner required';end if;
 foreach relation_name in array array['televote_aggregations','televote_aggregation_participants','televote_aggregation_sources','external_score_entries','external_score_entry_log','combined_televote_results','combined_televote_component_results'] loop
  foreach command in array array[format('insert into televoting.%I default values',relation_name),format('update televoting.%I set id=id where false',relation_name),format('delete from televoting.%I where false',relation_name),format('truncate table televoting.%I cascade',relation_name)] loop
   denied:=false;begin execute command;exception when insufficient_privilege then denied:=true;end;
   if not denied then raise exception 'Owner/internal Combined bypass: %',command;end if;
  end loop;
 end loop;
 denied:=false;begin perform private.v3_sync_published_televote_aggregation('53000000-0000-4000-8000-000000000001');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Internal Combined sync accepted';end if;
 denied:=false;begin
  insert into private.v3_televote_result_projection_sources(show_id,edition_id,source_type,source_id,source_version,source_published_at,payload_fingerprint,row_count,points_total,projection_revision)values('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','combined','53000000-0000-4000-8000-000000000001',1,now(),repeat('a',64),2,42,1);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Generic materializer can mint Combined provenance';end if;
 if (select final_combined_points from televoting.combined_televote_results where aggregation_id='53000000-0000-4000-8000-000000000001' and country_code='SR11') is distinct from 42 then raise exception 'Historical Combined data changed';end if;
end $owner$;
rollback;
