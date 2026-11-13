begin;

-- Close the bounded O10 migration-registration compatibility window and restore
-- the exact strict semantic-key contract used by current main.
select public.v3_register_migration_contract(
  'v3.o10.official-communications-registration-restore',
  1,
  'forward_fix_only',
  false,
  null,
  'Restore strict S13 semantic migration-key validation after the bounded Official Communications reconstruction window.'
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
begin
  if not private.studio2_request_is_service_role()
     and not v_owner_migration_context then
    raise exception 'Service role or migration owner context required' using errcode = '42501';
  end if;
  if p_migration_key is null
     or p_migration_key !~ '^[a-z][a-z0-9_.:-]{2,159}$'
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
  where migration_key = p_migration_key
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
      p_migration_key,
      p_schema_version,
      p_rollback_mode,
      p_destructive,
      p_backfill_key,
      btrim(p_reason)
    );
  end if;

  return jsonb_build_object(
    'migrationKey', p_migration_key,
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
