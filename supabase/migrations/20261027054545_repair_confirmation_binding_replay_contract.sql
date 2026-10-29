begin;
-- Register adoption on branch upgrades too: earlier bodies may already have run.
-- Canonical bindings, receipts and freshness evidence remain unchanged.
select public.v3_register_migration_contract(
 'v3.confirmation.edition-binding.operations',1,'forward_fix_only',false,null,
 'Governed edition binding authority; additive operations and fresh-auth enforcement');
select public.v3_register_migration_contract(
 'v3.confirmation.edition-binding.fresh-auth',1,'forward_fix_only',false,null,
 'Governed edition binding authority; additive operations and fresh-auth enforcement');
select public.v3_register_migration_contract(
 'v3.confirmation.edition-binding.replay-repair',1,'forward_fix_only',false,null,
 'Use canonical S2 replay result before mutable-state and fresh-auth checks');
do $repair$
declare
 definition text;
begin
 select pg_get_functiondef('public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid)'::regprocedure)
 into definition;
 -- Repair only the proven consumer-key typo in the existing canonical owner.
 if position('v_claim ->> ''replay''' in definition)>0 then
   definition := replace(definition,'v_claim ->> ''replay''','v_claim ->> ''replayed''');
   execute definition;
 end if;
 if position('v_claim ->> ''replayed''' in definition)=0 then
   raise exception 'Binding owner has no canonical S2 replay contract';
 end if;
end
$repair$;
notify pgrst,'reload schema';
commit;
