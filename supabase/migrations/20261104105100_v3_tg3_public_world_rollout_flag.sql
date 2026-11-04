begin;

-- S13 high-risk migration contract precedes the CHECK replacement.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.public-world-rollout-flag',
      1,
      'forward_fix_only',
      true,
      null,
      'Allow and default-disable the shared public Terra Solaris World feature flag without overwriting other feature flags or rollout controls.'
    );
  end if;
end
$contract$;


-- TG3 public World is a shared, explicit rollout decision used by the
-- institution directory and independent public institution leaf routes.
-- Never silently enable this feature while maintenance is active.
--
-- The feature-flag key CHECK has evolved across several V3 migrations. Read
-- the current constraint predicate and extend it with only this new key;
-- do not replace its allowlist with a stale, hardcoded subset.
do $world_rollout$
declare
  v_predicate text;
begin
  select pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
    into v_predicate
  from pg_catalog.pg_constraint constraint_row
  join pg_catalog.pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and table_row.relname = 'studio2_feature_flags'
    and constraint_row.conname = 'studio2_feature_flags_key_check'
    and constraint_row.contype = 'c';

  if v_predicate is null then
    raise exception 'WORLD_PUBLIC_ROLLOUT_ALLOWLIST_CONSTRAINT_MISSING'
      using errcode = '23514';
  end if;

  -- Branches that already adopted this feature key need no DDL rewrite.
  if pg_catalog.strpos(v_predicate, 'terra_world_public') = 0 then
    alter table public.studio2_feature_flags
      drop constraint studio2_feature_flags_key_check;
    execute pg_catalog.format(
      'alter table public.studio2_feature_flags add constraint studio2_feature_flags_key_check check ((%s) or key = %L)',
      v_predicate,
      'terra_world_public'
    );
  end if;
end
$world_rollout$;

-- Keep the existing authorized Organizer feature-control system as the only
-- way to turn World public. Do not overwrite a flag already configured by
-- an earlier deployment or concurrent migration.
insert into public.studio2_feature_flags
  (key, enabled, admins_only, user_ids, edition_ids)
values
  ('terra_world_public', false, false, '{}'::uuid[], '{}'::uuid[])
on conflict (key) do nothing;

notify pgrst, 'reload schema';
commit;
