begin;
select public.v3_register_migration_contract(
 'v3.confirmation.edition-binding.idempotency-alias',1,'forward_fix_only',false,null,
 'Resolve exact semantic retries through the receipt identity returned by S2');
do $repair$
declare definition text;
begin
 select pg_get_functiondef('public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid)'::regprocedure)
 into definition;
 definition := replace(definition,
   'return public.studio2_reconcile_operation(p_operation_id)' || chr(10) || '      || jsonb_build_object(''replayed'', true);',
   'return public.studio2_reconcile_operation((v_claim ->> ''operationId'')::uuid)' || chr(10) || '      || jsonb_build_object(''replayed'', true);');
 if position('studio2_reconcile_operation((v_claim ->> ''operationId'')::uuid)' in definition)=0 then
   raise exception 'Binding owner lacks canonical receipt identity recovery';
 end if;
 execute definition;
end
$repair$;
notify pgrst,'reload schema';
commit;
