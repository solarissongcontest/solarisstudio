begin;
select public.v3_register_migration_contract(
 'v3.integrity.appeal-extension-caller-cutover',1,'forward_fix_only',false,null,
 'Expose the canonical appeal revision in the queue, preserve the reviewed extension operation across retries, and retire external EXECUTE on the version-guessing compatibility extension writer.'
);
do $queue$
declare v_definition text:=pg_get_functiondef('public.admin_integrity_appeals()'::regprocedure);
 v_anchor text:=$anchor$'id', a.id,$anchor$;
begin
 if strpos(v_definition,v_anchor)=0 then raise exception 'Unrecognized canonical appeal queue'; end if;
 execute replace(v_definition,v_anchor,v_anchor||E'\n      \'version\', a.version,');
end
$queue$;
revoke all on function public.admin_grant_integrity_appeal_extension(uuid,timestamptz,text) from public,anon,authenticated,service_role;
commit;
