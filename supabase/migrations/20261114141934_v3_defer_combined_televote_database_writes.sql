begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- COM-00 owner decision: defer the separate Combined system. Ordinary round
-- calculation, Jury, official Results and immutable historical reads remain.
do $pre$
declare relation_name text; relation_oid oid; routine record;
begin
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.combined.launch-write-deferral') then raise exception 'Combined deferral already installed' using errcode='55000';end if;
 select * into routine from pg_proc where oid=to_regprocedure('private.v3_sync_published_televote_aggregation(uuid)');
 if routine.oid is null or not routine.prosecdef or pg_get_userbyid(routine.proowner)<>'postgres'
  or encode(sha256(convert_to(pg_get_functiondef(routine.oid),'UTF8')),'hex')<>'1b9cce11ae0c08b4c8ba752efbd41f1211983633cf8e7c752f3d7148961bc067'
  or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='v3_sync_published_televote_aggregation')<>1 then raise exception 'Combined source adapter definition/owner drift or missing prerequisite' using errcode='55000';end if;
 foreach relation_name in array array['televote_aggregations','televote_aggregation_participants','televote_aggregation_sources','external_score_entries','external_score_entry_log','combined_televote_results','combined_televote_component_results'] loop
  relation_oid:=to_regclass('televoting.'||relation_name);
  if relation_oid is null or not exists(select 1 from pg_class where oid=relation_oid and relkind='r' and pg_get_userbyid(relowner)='postgres') then raise exception 'Combined table missing or unqualified owner: %',relation_name using errcode='55000';end if;
  if exists(select 1 from pg_trigger where tgrelid=relation_oid and tgname='v3_deny_deferred_combined_write') then raise exception 'Partial Combined deferral: %',relation_name using errcode='55000';end if;
 end loop;
 if to_regclass('private.v3_televote_result_projection_sources') is null or not exists(select 1 from pg_attribute where attrelid='private.v3_televote_result_projection_sources'::regclass and attname='source_type' and atttypid='text'::regtype and not attisdropped) then raise exception 'Combined provenance guard prerequisite missing' using errcode='55000';end if;
 if to_regprocedure('private.v3_deny_deferred_combined_write()') is not null or to_regprocedure('private.v3_deny_deferred_combined_projection()') is not null then raise exception 'Partial Combined deferral functions' using errcode='55000';end if;
end $pre$;
select public.v3_register_migration_contract('v3.combined.launch-write-deferral',1,'forward_fix_only',false,null,'Owner-deferred separate Combined writes; preserve historical data and ordinary round-based SSC operations');
create function private.v3_deny_deferred_combined_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,private
as $deny$ begin raise exception 'Combined Televote writes are disabled for this launch' using errcode='42501';end $deny$;
revoke all on function private.v3_deny_deferred_combined_write() from public,anon,authenticated,service_role;
-- No caller-selected GUC, role claim or service credential can enable this.
-- Statement triggers also deny zero-row writes and TRUNCATE (RLS cannot).
do $tables$
declare relation_name text; column_list text; actor_role text;
begin
 foreach relation_name in array array['televote_aggregations','televote_aggregation_participants','televote_aggregation_sources','external_score_entries','external_score_entry_log','combined_televote_results','combined_televote_component_results'] loop
  execute format('revoke insert,update,delete,truncate,references,trigger,maintain on table televoting.%I from public,anon,authenticated,service_role',relation_name);
  select string_agg(quote_ident(attname),',' order by attnum) into column_list from pg_attribute where attrelid=to_regclass('televoting.'||relation_name) and attnum>0 and not attisdropped;
  execute format('revoke insert (%s),update (%s),references (%s) on table televoting.%I from public,anon,authenticated,service_role',column_list,column_list,column_list,relation_name);
  execute format('create trigger v3_deny_deferred_combined_write before insert or update or delete or truncate on televoting.%I for each statement execute function private.v3_deny_deferred_combined_write()',relation_name);
  execute format('alter table televoting.%I enable always trigger v3_deny_deferred_combined_write',relation_name);
  foreach actor_role in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(actor_role,to_regclass('televoting.'||relation_name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(actor_role,to_regclass('televoting.'||relation_name),'INSERT,UPDATE,REFERENCES') then raise exception 'Effective Combined privilege remains for %.%',actor_role,relation_name;end if;
  end loop;
 end loop;
end $tables$;
-- Replacing the existing adapter keeps its OID and all internal callers bound
-- to a denial, including SECURITY DEFINER recovery/trigger delegation.
create or replace function private.v3_sync_published_televote_aggregation(p_aggregation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,private
as $disabled$ begin raise exception 'Combined Televote publication is disabled for this launch' using errcode='42501';end $disabled$;
revoke all on function private.v3_sync_published_televote_aggregation(uuid) from public,anon,authenticated,service_role;
-- Defense in depth: an owner-only generic materializer cannot mint or replace
-- Combined source provenance. Any preceding projection writes roll back too.
create function private.v3_deny_deferred_combined_projection()
returns trigger language plpgsql security definer set search_path=pg_catalog,private
as $projection$
begin
 if (tg_op<>'DELETE' and new.source_type='combined') or (tg_op<>'INSERT' and old.source_type='combined') then raise exception 'Combined Televote projection is disabled for this launch' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $projection$;
revoke all on function private.v3_deny_deferred_combined_projection() from public,anon,authenticated,service_role;
create trigger v3_deny_deferred_combined_projection before insert or update or delete on private.v3_televote_result_projection_sources for each row execute function private.v3_deny_deferred_combined_projection();
alter table private.v3_televote_result_projection_sources enable always trigger v3_deny_deferred_combined_projection;
commit;
