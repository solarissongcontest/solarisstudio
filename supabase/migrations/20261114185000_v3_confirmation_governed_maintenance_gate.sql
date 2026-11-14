begin;

-- Exact, guarded amendment to current-main Confirmation read_only exception.
-- No shared gate is replaced from an obsolete donor; only preexisting
-- literal allowlist anchors are extended. Unexpected definition drift aborts.
select public.v3_register_migration_contract(
  'v3.confirmation.governed-readonly-compat',
  1, 'forward_fix_only', false, null,
  'Allow only governed R2 Confirmation response access commands through the existing read_only maintenance transaction gate, preserving R3 deletion denial'
);

do $gate_patch$
declare
  v_before text;
  v_after text;
  v_old text := '        ''admin_update_confirmation_controls'',';
  v_new text := '        ''admin_update_confirmation_controls'',' || E'\n'
             || '        ''studio2_apply_confirmation_response_access_change'',';
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_before;
  if v_before is null
     or position(v_old in v_before) = 0
     or position('''studio2_apply_confirmation_response_access_change''' in v_before) > 0
     or position('studio2.confirmation_maintenance_write' in v_before) = 0 then
    raise exception 'Current Data API Confirmation read_only gate drifted; refusing unsafe extension';
  end if;
  v_after := replace(v_before, v_old, v_new);
  if v_before = v_after then
    raise exception 'No Data API allowlist amendment was applied';
  end if;
  execute v_after;
end
$gate_patch$;

do $operation_gate_patch$
declare
  v_before text;
  v_after text;
  v_old text := '              ''confirmation.round.update''';
  v_new text := '              ''confirmation.round.update'',' || E'\n'
             || '              ''confirmation.response.access.update'',' || E'\n'
             || '              ''confirmation.response.recovery.issue'',' || E'\n'
             || '              ''confirmation.response.recovery.invalidate''';
begin
  select pg_get_functiondef('private.studio2_platform_mutation_allowed(text)'::regprocedure)
  into v_before;
  if v_before is null
     or position(v_old in v_before) = 0
     or position('''confirmation.response.access.update''' in v_before) > 0
     or position('studio2.confirmation_maintenance_write' in v_before) = 0 then
    raise exception 'Current platform Confirmation mutation gate drifted; refusing unsafe extension';
  end if;
  v_after := replace(v_before, v_old, v_new);
  if v_before = v_after
     or position('''confirmation.response.delete''' in v_after) > 0 then
    raise exception 'Unsafe governed Confirmation maintenance allowlist';
  end if;
  execute v_after;
end
$operation_gate_patch$;

notify pgrst, 'reload schema';
commit;
