\set ON_ERROR_STOP on
begin;
do $test$ declare actor text;statement text;denied boolean;begin
 if session_user<>'authenticator' then raise exception 'Actual authenticator session required';end if;
 foreach actor in array array['anon','authenticated','service_role']loop
  foreach statement in array array[
   'insert into public.studio2_upload_authorizations default values',
   'update public.studio2_upload_authorizations set status=status where false',
   'delete from public.studio2_upload_authorizations where false',
   'truncate public.studio2_upload_authorizations'
  ]loop
   execute format('set local role %I',actor);denied:=false;
   begin execute statement;exception when insufficient_privilege then denied:=true;end;
   reset role;if not denied then raise exception 'Direct media API mutation accepted: % %',actor,statement;end if;
  end loop;
 end loop;
 foreach actor in array array['anon','authenticated']loop
  execute format('set local role %I',actor);denied:=false;
  begin perform public.v3_finalize_media_upload(null,null,null,null,'verified',null,'{}',null);exception when insufficient_privilege then denied:=true;end;
  reset role;if not denied then raise exception 'Browser invoked worker finalizer: %',actor;end if;
 end loop;
end $test$;
rollback;
