begin;
do $cat$ begin
  if to_regprocedure('public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text)') is not null then raise exception 'Redundant anonymous writer exists'; end if;
  if not has_function_privilege('anon','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)','EXECUTE') then
    raise exception 'Anonymous public reporting grants changed'; end if;
end $cat$;
set local role anon;
do $deny$ begin
  begin perform public.public_create_anonymous_integrity_case_impl(null::text,null::text,null::text,null::text,null::text,null::text[],null::text,null::text);
    raise exception 'Removed anonymous physical writer callable';
  exception when undefined_function then null; end;
end $deny$;
reset role;
set local role authenticated;
do $deny$ begin
  begin perform public.public_create_anonymous_integrity_case_impl(null::text,null::text,null::text,null::text,null::text,null::text[],null::text,null::text);
    raise exception 'Removed anonymous physical writer callable';
  exception when undefined_function then null; end;
end $deny$;
reset role;
set local role service_role;
do $deny$ begin
  begin perform public.public_create_anonymous_integrity_case_impl(null::text,null::text,null::text,null::text,null::text,null::text[],null::text,null::text);
    raise exception 'Removed anonymous physical writer callable';
  exception when undefined_function then null; end;
end $deny$;
reset role;
commit;
