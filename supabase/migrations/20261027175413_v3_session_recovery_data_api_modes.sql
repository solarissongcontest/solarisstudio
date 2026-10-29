begin;
select public.v3_register_migration_contract(
  'v3.session.data-api-recovery-modes', 1, 'forward_fix_only', false, null,
  'Allow only the existing actor-scoped R3 session recovery RPC through the Data API read-only/maintenance gate. All session, freshness, ownership and operational-mode checks remain in force; no backfill.'
);

-- P42 already permits account.session.revoke in the canonical mode helper.
-- Its Data API transport must permit the same narrow security recovery command.
do $migration$
declare
  v_definition text;
  v_anchor constant text := '''studio2_record_platform_exit_preflight''';
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_definition;
  if v_definition is null or position(v_anchor in v_definition) = 0
     or position('private.v3_require_active_auth_session()' in v_definition) = 0 then
    raise exception 'Unexpected Data API recovery gate; refusing session recovery patch';
  end if;
  if position('''v3_revoke_session''' in v_definition) > 0 then
    raise exception 'Session recovery transport is already installed';
  end if;
  execute replace(v_definition, v_anchor, v_anchor || E',\n      ''v3_revoke_session''');
end
$migration$;
notify pgrst, 'reload schema';
commit;
