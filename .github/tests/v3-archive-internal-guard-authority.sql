-- Run after v3-s14-archive-guard-rehearsal.sh creates and canonically archives
-- its fixture. Both UPDATEs must reach the attached owner-only invariant guard.
begin;
do $catalog$
declare v_role text; v_table text;
begin
 if not exists(select 1 from pg_proc where oid='private.v3_guard_archived_edition_workflow_write()'::regprocedure and proowner='postgres'::regrole and prosecdef and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then raise exception 'Unsafe Archive workflow guard'; end if;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(v_role,'private.v3_guard_archived_edition_workflow_write()','EXECUTE') then raise exception 'Externally callable Archive workflow guard'; end if;
 end loop;
 foreach v_table in array array['public.shows','public.studio2_show_publication_controls'] loop
  if not exists(select 1 from pg_trigger where tgrelid=v_table::regclass and tgname='v3_guard_archived_edition_workflow_write' and tgfoid='private.v3_guard_archived_edition_workflow_write()'::regprocedure and tgtype=31 and tgenabled='O' and not tgisinternal) then raise exception 'Archive guard attachment changed: %',v_table; end if;
 end loop;
 if not exists(select 1 from public.shows where id='18910000-0000-4000-8000-000000000005') then raise exception 'Missing canonical Archive fixture'; end if;
 begin
  update public.shows set name='Forbidden archived change' where id='18910000-0000-4000-8000-000000000005';
  raise exception 'Archived show changed';
 exception when insufficient_privilege then if sqlerrm<>'Archived edition workflow is read-only.' then raise; end if; end;
 if not exists(select 1 from public.studio2_show_publication_controls where show_id='18910000-0000-4000-8000-000000000005') then raise exception 'Missing canonical publication fixture'; end if;
 begin
  update public.studio2_show_publication_controls set updated_at=now() where show_id='18910000-0000-4000-8000-000000000005';
  raise exception 'Archived publication changed';
 exception when insufficient_privilege then if sqlerrm<>'Archived edition workflow is read-only.' then raise; end if; end;
end
$catalog$;
rollback;
