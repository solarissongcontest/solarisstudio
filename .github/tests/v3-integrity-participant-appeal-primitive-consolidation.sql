begin;
do $catalog$
begin
  if to_regprocedure('public.reporter_submit_integrity_appeal_impl(uuid,uuid,text)') is not null or to_regprocedure('public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text)') is not null then
    raise exception 'Legacy appeal physical writer still installed';
  end if;
  if has_function_privilege('anon','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('anon','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.v3_public_submit_anonymous_integrity_appeal(uuid,text,text,text,uuid,text)','EXECUTE') then
    raise exception 'Participant appeal canonical execution grants drifted';
  end if;
end $catalog$;
set local role anon;
do $negative$ begin
  begin
    perform public.reporter_submit_integrity_appeal_impl(null::uuid,null::uuid,null::text);
    raise exception 'Retired authenticated appeal physical writer remained callable';
  exception when undefined_function then null; end;
  begin
    perform public.public_submit_anonymous_integrity_appeal_impl(null::text,null::text,null::uuid,null::text);
    raise exception 'Retired anonymous appeal physical writer remained callable';
  exception when undefined_function then null; end;
end $negative$;
reset role;
set local role authenticated;
do $negative$ begin
  begin
    perform public.reporter_submit_integrity_appeal_impl(null::uuid,null::uuid,null::text);
    raise exception 'Retired authenticated appeal physical writer remained callable';
  exception when undefined_function then null; end;
  begin
    perform public.public_submit_anonymous_integrity_appeal_impl(null::text,null::text,null::uuid,null::text);
    raise exception 'Retired anonymous appeal physical writer remained callable';
  exception when undefined_function then null; end;
end $negative$;
reset role;
set local role service_role;
do $negative$ begin
  begin
    perform public.reporter_submit_integrity_appeal_impl(null::uuid,null::uuid,null::text);
    raise exception 'Retired authenticated appeal physical writer remained callable';
  exception when undefined_function then null; end;
  begin
    perform public.public_submit_anonymous_integrity_appeal_impl(null::text,null::text,null::uuid,null::text);
    raise exception 'Retired anonymous appeal physical writer remained callable';
  exception when undefined_function then null; end;
end $negative$;
reset role;
commit;
