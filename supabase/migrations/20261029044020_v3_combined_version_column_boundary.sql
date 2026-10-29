begin;
select public.v3_register_migration_contract('v3.televote.combined-version-column-boundary',1,'forward_fix_only',false,null,'Prevent API callers from inserting or overwriting the command version while preserving only their existing legacy-column permissions until the remaining Combined caller cutover. Remaining legacy grants stay S16 hard findings.');
revoke insert,update on televoting.televote_aggregations from public;
revoke insert(command_version),update(command_version) on televoting.televote_aggregations from public;
do $boundary$
declare r text; p text; v_columns text;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach p in array array['INSERT','UPDATE'] loop
   -- Preserve only effective permissions which existed on old columns. Never
   -- grant an absent permission or permit caller-selected initial versions.
   select string_agg(format('%I',a.attname),',' order by a.attnum) into v_columns
   from pg_attribute a where a.attrelid='televoting.televote_aggregations'::regclass and a.attnum>0 and not a.attisdropped and a.attname<>'command_version'
   and exists(select 1 from information_schema.column_privileges g where g.table_schema='televoting' and g.table_name='televote_aggregations' and g.column_name=a.attname and lower(g.grantee)=lower(r) and g.privilege_type=p);
   execute format('revoke %s on televoting.televote_aggregations from %I',p,r);
   execute format('revoke %s(command_version) on televoting.televote_aggregations from %I',p,r);
   if v_columns is not null then execute format('grant %s(%s) on televoting.televote_aggregations to %I',p,v_columns,r); end if;
  end loop;
 end loop;
end $boundary$;
commit;
