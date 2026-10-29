begin;
select public.v3_register_migration_contract(
 'v3.confirmation.binding-version-conflict-http',1,'forward_fix_only',false,null,
 'Return a deterministic HTTP conflict for stale reviewed binding versions');
do $repair$
declare definition text;
begin
 select pg_get_functiondef('public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid)'::regprocedure) into definition;
 -- A stale reviewed version is a business conflict, not a retryable database
 -- serialization failure. PostgREST must return it without retrying the request.
 definition := replace(definition, 'using errcode = ''40001''', 'using errcode = ''PT409''');
 if position('using errcode = ''PT409''' in definition)=0 then
   raise exception 'Binding owner has no deterministic version conflict';
 end if;
 execute definition;
end
$repair$;
notify pgrst,'reload schema';
commit;
