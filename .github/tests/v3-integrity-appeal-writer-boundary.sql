begin;
do $authority$
declare v_table text; v_role text; v_function text;
begin
 foreach v_table in array array['public.integrity_case_appeals','public.integrity_adjudication_history','public.integrity_case_events'] loop
  if not exists(select 1 from pg_class where oid=v_table::regclass and relrowsecurity and relowner='postgres'::regrole) then raise exception 'Unsafe canonical Integrity owner/RLS: %',v_table; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(v_role,v_table,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(v_role,v_table,'INSERT') or has_any_column_privilege(v_role,v_table,'UPDATE') then raise exception 'Raw appeal/history mutation remains: % %',v_role,v_table; end if;
  end loop;
 end loop;
 foreach v_function in array array[
  'public.reporter_submit_integrity_appeal_impl(uuid,uuid,text)',
  'public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text)',
  'public.admin_assign_integrity_appeal_reviewer(uuid,uuid)',
  'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])',
  'public.admin_grant_integrity_appeal_extension(uuid,timestamptz,text)',
  'private.v3_integrity_appeal_before_update()',
  'private.v3_integrity_appeal_changed_event()'
 ] loop
  if not exists(select 1 from pg_proc where oid=v_function::regprocedure and proowner='postgres'::regrole and prosecdef and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then raise exception 'Unsafe appeal internal function: %',v_function; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(v_role,v_function,'EXECUTE') then raise exception 'Callable appeal internal function: % %',v_role,v_function; end if;
  end loop;
 end loop;
 if (select count(*) from pg_trigger where tgrelid='public.integrity_case_appeals'::regclass and tgenabled='O' and not tgisinternal and
   ((tgname='v3_integrity_appeal_before_update' and tgfoid='private.v3_integrity_appeal_before_update()'::regprocedure and tgtype=19)
    or (tgname='v3_integrity_appeal_changed_event' and tgfoid='private.v3_integrity_appeal_changed_event()'::regprocedure and tgtype=21)))<>2 then raise exception 'Appeal invariant/event trigger attachments changed'; end if;
end
$authority$;
rollback;
