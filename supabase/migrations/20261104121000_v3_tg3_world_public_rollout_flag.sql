begin;

-- S13 migration adoption evidence. This addition is independently safe when
-- the sibling TG3 office-history flag migration is applied before or after it.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.world-public-explore-rollout',
      1,
      'forward_fix_only',
      false,
      null,
      'Register and default-disable the public Terra Solaris World discovery rollout without replacing other V3 feature-flag constraints or rollout decisions.'
    );
  end if;
end
$contract$;

-- Existing feature flags are owned by many concurrently developed V3 lanes.
-- Preserve the *current database predicate* instead of hardcoding a stale
-- allowlist that could drop another capability during merge/replay.
do $world_rollout$
declare
  v_predicate text;
begin
  select pg_catalog.pg_get_expr(c.conbin, c.conrelid)
    into v_predicate
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid = c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid = t.relnamespace
  where ns.nspname = 'public'
    and t.relname = 'studio2_feature_flags'
    and c.conname = 'studio2_feature_flags_key_check'
    and c.contype = 'c';

  if v_predicate is null then
    raise exception 'WORLD_PUBLIC_ROLLOUT_ALLOWLIST_CONSTRAINT_MISSING'
      using errcode = '23514';
  end if;

  -- Idempotent with #1942. If an earlier branch already added this key, do
  -- not modify a production CHECK constraint just to produce another DDL.
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

-- A public surface must never auto-activate before its TG1/TG2/TG3 schema,
-- RLS, private/public boundary and exact-SHA QA have been certified.
insert into public.studio2_feature_flags
  (key, enabled, admins_only, user_ids, edition_ids)
values
  ('terra_world_public', false, false, '{}'::uuid[], '{}'::uuid[])
on conflict (key) do nothing;

notify pgrst, 'reload schema';
commit;
