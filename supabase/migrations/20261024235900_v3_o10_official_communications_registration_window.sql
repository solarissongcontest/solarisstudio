begin;

-- Current-main reconstruction bridge for the two never-merged O10 migrations.
-- The original reviewed SQL registered filename-shaped keys before S13 restored
-- strict semantic-key validation. Keep the reviewed command SQL byte-identical,
-- but map exactly those two stale keys onto canonical semantic contracts while
-- the forward-dated migrations replay. Every other key remains strict/fail-closed.
select public.v3_register_migration_contract(
  'v3.o10.official-communications-registration-window',
  1,
  'forward_fix_only',
  false,
  null,
  'Temporarily map exactly two reviewed unmerged Official Communications migration aliases onto semantic S13 keys.'
);

create or replace function public.v3_register_migration_contract(
  p_migration_key text,
  p_schema_version integer,
  p_rollback_mode text,
  p_destructive boolean,
  p_backfill_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $register$
declare
  v_existing private.v3_migration_contracts%rowtype;
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_owner_migration_context boolean :=
    session_user in ('postgres', 'supabase_admin') and v_request_role is null;
  v_semantic_key text := case p_migration_key
    when '20261020001500_v3_official_communications_command_authority'
      then 'v3.o10.official-communications-lifecycle'
    when '20261020003000_v3_official_communications_draft_authority'
      then 'v3.o10.official-communications-drafts'
    else p_migration_key
  end;
begin
  if not private.studio2_request_is_service_role()
     and not v_owner_migration_context then
    raise exception 'Service role or migration owner context required' using errcode = '42501';
  end if;
  if v_semantic_key is null
     or v_semantic_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
     or p_schema_version is null or p_schema_version < 1
     or p_rollback_mode is null
     or p_rollback_mode not in ('reversible', 'forward_fix_only')
     or p_destructive is null
     or (p_backfill_key is not null and p_backfill_key !~ '^[a-z][a-z0-9_.:-]{2,159}$')
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(p_reason) > 1000 then
    raise exception 'Invalid migration contract' using errcode = '22023';
  end if;

  select * into v_existing
  from private.v3_migration_contracts
  where migration_key = v_semantic_key
  for update;

  if v_existing.migration_key is not null then
    if v_existing.schema_version is distinct from p_schema_version
       or v_existing.rollback_mode is distinct from p_rollback_mode
       or v_existing.destructive is distinct from p_destructive
       or v_existing.backfill_key is distinct from p_backfill_key
       or v_existing.reason is distinct from btrim(p_reason) then
      raise exception 'Migration contract semantic conflict' using errcode = '23505';
    end if;
  else
    insert into private.v3_migration_contracts (
      migration_key, schema_version, rollback_mode, destructive, backfill_key, reason
    ) values (
      v_semantic_key,
      p_schema_version,
      p_rollback_mode,
      p_destructive,
      p_backfill_key,
      btrim(p_reason)
    );
  end if;

  return jsonb_build_object(
    'migrationKey', v_semantic_key,
    'schemaVersion', p_schema_version,
    'rollbackMode', p_rollback_mode,
    'destructive', p_destructive,
    'backfillKey', p_backfill_key,
    'replayed', v_existing.migration_key is not null
  );
end
$register$;

revoke all on function public.v3_register_migration_contract(text, integer, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.v3_register_migration_contract(text, integer, text, boolean, text, text)
  to service_role;

commit;
