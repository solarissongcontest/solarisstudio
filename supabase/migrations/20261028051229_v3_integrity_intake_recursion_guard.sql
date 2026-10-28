begin;
select public.v3_register_migration_contract(
  'v3.integrity.intake-recursion-guard', 1, 'forward_fix_only', false, null,
  'Keep canonical idempotent intake cores delegating only to inaccessible writer primitives. Legacy intake shims delegate inward to V3; the reverse edge created recursion after compatibility cutover. Preserve original validation, history, operation identity, owners, search paths and EXECUTE restrictions.'
);
do $cutover$
declare
  v_patch record;
  v_definition text;
begin
  for v_patch in select * from (values
    ('public.v3_public_create_anonymous_integrity_case_impl(uuid,text,text,text,text,text,text,text[],text,text)',
     'v_base_result := public.public_create_anonymous_integrity_case(',
     'v_base_result := public.public_create_anonymous_integrity_case_impl('),
    ('public.v3_create_protected_integrity_case_impl(uuid,text,text,text,text,text,text,text,text,text[],text)',
     'v_base_result := public.create_protected_integrity_case(',
     'v_base_result := public.create_protected_integrity_case_impl(')
  ) patches(signature, old_call, new_call)
  loop
    v_definition := pg_get_functiondef(v_patch.signature::regprocedure);
    if strpos(v_definition, v_patch.old_call) = 0 and strpos(v_definition, v_patch.new_call) > 0 then
      continue;
    end if;
    if (length(v_definition) - length(replace(v_definition, v_patch.old_call, ''))) / length(v_patch.old_call) <> 1 then
      raise exception 'Unrecognized Integrity intake delegation for %', v_patch.signature;
    end if;
    execute replace(v_definition, v_patch.old_call, v_patch.new_call);
  end loop;
end
$cutover$;
notify pgrst, 'reload schema';
commit;
