begin;
do $catalog$
declare v_signature text; v_role text;
begin
  foreach v_signature in array array[
    'public.reporter_reply_integrity_case_impl(uuid,text)',
    'public.public_reply_anonymous_integrity_case_impl(text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Retired reporter internal physical writer is installed: %',v_signature;
    end if;
  end loop;
  foreach v_role in array array['authenticated','service_role'] loop
    if not has_function_privilege(v_role,
      'public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)','EXECUTE')
    then raise exception 'Registered reporter canonical command lacks role %',v_role; end if;
  end loop;
  if has_function_privilege('anon',
    'public.v3_reporter_reply_integrity_case(uuid,text,uuid,text,bigint)','EXECUTE')
  then raise exception 'Anonymous role gained registered reporter command'; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if not has_function_privilege(v_role,
      'public.v3_public_reply_anonymous_integrity_case(uuid,text,text,text,text,bigint)','EXECUTE')
    then raise exception 'Anonymous reporter canonical ingress lost role %',v_role; end if;
  end loop;
end $catalog$;
-- Execute both removed functions as every API role, not just static pg_proc.
set local role anon;
do $negative$ begin
  begin perform public.reporter_reply_integrity_case_impl(null::uuid,null::text);
    raise exception 'Retired registered reporter write was callable by anon';
  exception when undefined_function then null; end;
  begin perform public.public_reply_anonymous_integrity_case_impl(null::text,null::text,null::text);
    raise exception 'Retired anonymous reply write was callable by anon';
  exception when undefined_function then null; end;
end $negative$;
reset role;
set local role authenticated;
do $negative$ begin
  begin perform public.reporter_reply_integrity_case_impl(null::uuid,null::text);
    raise exception 'Retired registered reporter write was callable by authenticated';
  exception when undefined_function then null; end;
  begin perform public.public_reply_anonymous_integrity_case_impl(null::text,null::text,null::text);
    raise exception 'Retired anonymous reply write was callable by authenticated';
  exception when undefined_function then null; end;
end $negative$;
reset role;
set local role service_role;
do $negative$ begin
  begin perform public.reporter_reply_integrity_case_impl(null::uuid,null::text);
    raise exception 'Retired registered reporter write was callable by service_role';
  exception when undefined_function then null; end;
  begin perform public.public_reply_anonymous_integrity_case_impl(null::text,null::text,null::text);
    raise exception 'Retired anonymous reply write was callable by service_role';
  exception when undefined_function then null; end;
end $negative$;
reset role;
commit;
