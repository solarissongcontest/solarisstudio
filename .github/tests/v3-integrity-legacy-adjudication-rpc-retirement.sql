-- Local PG17 real-role probes: absence of retired RPCs must cause 42883
-- for anon, authenticated and service_role, not an unrelated SQL error.
begin;
do $verify$
declare v_identity text; v_role text; v_call text; v_denied boolean;
begin
 foreach v_identity in array array[
  'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)',
  'public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)',
  'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])'
 ] loop
  if to_regprocedure(v_identity) is not null then
   raise exception 'Legacy adjudication writer remains: %',v_identity;end if;
 end loop;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  foreach v_call in array array[
   $call$select public.admin_record_integrity_finding(null::uuid,null::text,null::text,null::text,null::text[],null::boolean)$call$,
   $call$select public.admin_record_integrity_sanction(null::uuid,null::uuid,null::integer,null::integer,null::text,null::text,null::text[],null::text[],null::text,null::boolean)$call$,
   $call$select public.admin_decide_integrity_appeal(null::uuid,null::text,null::text,null::integer,null::text[],null::text[])$call$
  ] loop
   execute format('set local role %I',v_role);
   v_denied:=false;
   begin
    execute v_call;
   exception when undefined_function then
    v_denied:=true;
   end;
   reset role;
   if not v_denied then
    raise exception 'Legacy adjudication RPC callable as %: %',v_role,v_call;
   end if;
  end loop;
 end loop;
 foreach v_identity in array array[
  'public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)',
  'public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)',
  'public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)'
 ] loop
  if to_regprocedure(v_identity) is null or not has_function_privilege('authenticated',to_regprocedure(v_identity),'EXECUTE')
  then raise exception 'Canonical adjudication command lost: %',v_identity;end if;
 end loop;
 raise notice 'PASS: 9 real-role legacy call denials, canonical adjudication RPCs survive';
end $verify$;
rollback;
