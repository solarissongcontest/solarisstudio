begin;

-- System V3: canonical Feature Rollout command authority.
--
-- This is a clean current-main restack of the useful Feature Rollout slice from
-- stale stacked PR #882, updated for the current S13 migration contract and the
-- current Confirmation maintenance platform-mode guard.
--
-- Runtime rollout changes become version-aware, idempotent, receipted and
-- auditable while the existing five-argument studio2_set_feature_flag RPC stays
-- source-compatible as an authenticated adapter during Organizer cutover.

-- S13 adoption contract. Migration execution has no end-user JWT, so establish
-- the transaction-local service claim required by the registration API.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.rollout.command-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive rollout revision/CAS plus S2 operation, audit and S4 DomainEvent authority; runtime service-role bypass is intentionally closed and repairs must roll forward.'
);
select set_config('request.jwt.claim.role', '', true);

alter table public.studio2_feature_flags
  add column if not exists revision bigint not null default 1;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.studio2_feature_flags'::regclass
      and conname = 'studio2_feature_flags_revision_check'
  ) then
    alter table public.studio2_feature_flags
      add constraint studio2_feature_flags_revision_check
      check (revision >= 1) not valid;
  end if;
end
$constraint$;

alter table public.studio2_feature_flags
  validate constraint studio2_feature_flags_revision_check;

-- Runtime service-role writes cannot produce the actor-bound S2 receipt that
-- consequential Organizer operations require. Repository runtime callers use
-- authenticated Organizer sessions. Database-owner migrations remain able to
-- seed or repair rows directly.
revoke insert, update, delete, truncate, references, trigger
  on table public.studio2_feature_flags
  from service_role;

create or replace function private.v3_normalize_rollout_uuid_array(p_values uuid[])
returns uuid[]
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $normalize$
begin
  if array_position(coalesce(p_values, '{}'::uuid[]), null) is not null then
    raise exception 'Feature rollout scopes may not contain null identifiers'
      using errcode = '22023';
  end if;

  return coalesce(
    (
      select array_agg(value order by value)
      from (
        select distinct value
        from unnest(coalesce(p_values, '{}'::uuid[])) value
      ) normalized
    ),
    '{}'::uuid[]
  );
end
$normalize$;

revoke all on function private.v3_normalize_rollout_uuid_array(uuid[])
  from public, anon, authenticated, service_role;

-- Preserve the current rollout.manage scope semantics, including the legacy
-- ability to insert an allowed but not-yet-seeded flag key. Existing global
-- scope or a requested transition to global requires global rollout.manage;
-- otherwise every existing/requested edition scope must be authorized.
create or replace function private.v3_rollout_manage_allowed(
  p_row_exists boolean,
  p_existing_scopes uuid[],
  p_requested_scopes uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
declare
  v_existing uuid[] := private.v3_normalize_rollout_uuid_array(p_existing_scopes);
  v_requested uuid[] := private.v3_normalize_rollout_uuid_array(p_requested_scopes);
begin
  if (coalesce(p_row_exists, false) and cardinality(v_existing) = 0)
     or cardinality(v_requested) = 0 then
    return public.studio2_access_allowed('rollout.manage', null, false);
  end if;

  return not exists (
    select 1
    from (
      select distinct edition_id
      from unnest(v_existing || v_requested) edition_scope(edition_id)
    ) affected
    where not public.studio2_access_allowed('rollout.manage', affected.edition_id, false)
  );
end
$allowed$;

revoke all on function private.v3_rollout_manage_allowed(boolean, uuid[], uuid[])
  from public, anon, authenticated, service_role;

-- Feature Rollout is an operational recovery control. Preserve the current
-- restrictive-mode recovery behavior while adding rollout.change. In
-- particular, retain the exact Confirmation-maintenance exception introduced by
-- 20261017210000 rather than restoring an older version of this shared guard.
create or replace function private.studio2_platform_mutation_allowed(
  p_command text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select coalesce(
    (
      select case state.mode
        when 'normal' then true
        when 'degraded' then true
        when 'read_only' then
          coalesce(p_command, '') in (
            'system.platform_mode.change',
            'system.push.retry_failed',
            'account.session.revoke',
            'rollout.change'
          )
          or (
            coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on'
            and coalesce(p_command, '') in (
              'confirmation.round.status',
              'confirmation.round.editing',
              'confirmation.round.update'
            )
          )
        when 'maintenance' then coalesce(p_command, '') in (
          'system.platform_mode.change',
          'account.session.revoke',
          'rollout.change'
        )
        else false
      end
      from public.studio2_platform_operational_state state
      where state.singleton = true
    ),
    false
  );
$allowed$;

-- Preview returns the exact revision the client must bind to its reviewed
-- decision. Revision 0 represents an allowed-but-not-yet-seeded key; persisted
-- rows themselves always start at revision 1.
create or replace function public.studio2_feature_flag_change_preview(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean default false,
  p_user_ids uuid[] default '{}'::uuid[],
  p_edition_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_actor uuid := auth.uid();
  v_row public.studio2_feature_flags%rowtype;
  v_exists boolean := false;
  v_users uuid[] := private.v3_normalize_rollout_uuid_array(p_user_ids);
  v_editions uuid[] := private.v3_normalize_rollout_uuid_array(p_edition_ids);
  v_enabled boolean := coalesce(p_enabled, false);
  v_admins_only boolean := coalesce(p_admins_only, false);
  v_no_change boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if nullif(btrim(coalesce(p_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select flag.* into v_row
  from public.studio2_feature_flags flag
  where flag.key = p_key;
  v_exists := found;

  if not private.v3_rollout_manage_allowed(
    v_exists,
    case when v_exists then v_row.edition_ids else '{}'::uuid[] end,
    v_editions
  ) then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

  if v_exists then
    v_no_change :=
      v_row.enabled is not distinct from v_enabled
      and v_row.admins_only is not distinct from v_admins_only
      and private.v3_normalize_rollout_uuid_array(v_row.user_ids) is not distinct from v_users
      and private.v3_normalize_rollout_uuid_array(v_row.edition_ids) is not distinct from v_editions;
  end if;

  return jsonb_build_object(
    'key', p_key,
    'exists', v_exists,
    'currentRevision', case when v_exists then v_row.revision else 0 end,
    'enabled', case when v_exists then v_row.enabled else false end,
    'adminsOnly', case when v_exists then v_row.admins_only else false end,
    'userTargetCount', cardinality(v_users),
    'editionTargetCount', cardinality(v_editions),
    'noChange', v_no_change,
    'riskClass', 'R1'
  );
end
$preview$;

revoke all on function public.studio2_feature_flag_change_preview(
  text, boolean, boolean, uuid[], uuid[]
) from public, anon, service_role;
grant execute on function public.studio2_feature_flag_change_preview(
  text, boolean, boolean, uuid[], uuid[]
) to authenticated;

create or replace function public.studio2_apply_feature_flag_change(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean,
  p_user_ids uuid[],
  p_edition_ids uuid[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_row public.studio2_feature_flags%rowtype;
  v_after public.studio2_feature_flags%rowtype;
  v_exists boolean := false;
  v_users uuid[] := private.v3_normalize_rollout_uuid_array(p_user_ids);
  v_editions uuid[] := private.v3_normalize_rollout_uuid_array(p_edition_ids);
  v_enabled boolean := coalesce(p_enabled, false);
  v_admins_only boolean := coalesce(p_admins_only, false);
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_changed boolean := true;
  v_scope_kind text;
  v_before_revision bigint := 0;
  v_before_enabled boolean := false;
  v_before_admins_only boolean := false;
  v_before_user_count integer := 0;
  v_before_edition_count integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if nullif(btrim(coalesce(p_key, '')), '') is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_revision is null
     or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2_feature_flag:' || p_key, 0));

  select flag.* into v_row
  from public.studio2_feature_flags flag
  where flag.key = p_key
  for update;
  v_exists := found;

  if not private.v3_rollout_manage_allowed(
    v_exists,
    case when v_exists then v_row.edition_ids else '{}'::uuid[] end,
    v_editions
  ) then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

  -- Claim before CAS evaluation so an exact retry after a successful commit can
  -- reconcile the original receipt even though the aggregate revision advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'rollout.change',
    'R1',
    jsonb_build_object('featureKey', p_key),
    jsonb_build_object(
      'enabled', v_enabled,
      'adminsOnly', v_admins_only,
      'userIds', to_jsonb(v_users),
      'editionIds', to_jsonb(v_editions),
      'expectedRevision', p_expected_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if (v_exists and v_row.revision is distinct from p_expected_revision)
     or (not v_exists and p_expected_revision <> 0) then
    raise exception using
      errcode = 'P0001',
      message = 'VERSION_CONFLICT',
      hint = 'Refresh Feature rollout before retrying.';
  end if;

  if v_exists then
    v_before_revision := v_row.revision;
    v_before_enabled := v_row.enabled;
    v_before_admins_only := v_row.admins_only;
    v_before_user_count := cardinality(private.v3_normalize_rollout_uuid_array(v_row.user_ids));
    v_before_edition_count := cardinality(private.v3_normalize_rollout_uuid_array(v_row.edition_ids));
    v_changed :=
      v_row.enabled is distinct from v_enabled
      or v_row.admins_only is distinct from v_admins_only
      or private.v3_normalize_rollout_uuid_array(v_row.user_ids) is distinct from v_users
      or private.v3_normalize_rollout_uuid_array(v_row.edition_ids) is distinct from v_editions;
  end if;

  if not v_changed then
    v_result := jsonb_build_object(
      'ok', true,
      'changed', false,
      'key', v_row.key,
      'revision', v_row.revision,
      'operationId', v_operation_id
    );
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', false);
  end if;

  if v_exists then
    update public.studio2_feature_flags
    set enabled = v_enabled,
        admins_only = v_admins_only,
        user_ids = v_users,
        edition_ids = v_editions,
        updated_by = v_actor,
        revision = revision + 1
    where key = p_key
      and revision = p_expected_revision
    returning * into v_after;

    if v_after.key is null then
      raise exception using
        errcode = 'P0001',
        message = 'VERSION_CONFLICT',
        hint = 'Refresh Feature rollout before retrying.';
    end if;
  else
    insert into public.studio2_feature_flags (
      key, enabled, admins_only, user_ids, edition_ids, updated_by, revision
    ) values (
      p_key, v_enabled, v_admins_only, v_users, v_editions, v_actor, 1
    )
    returning * into v_after;
  end if;

  v_scope_kind := case
    when cardinality(v_users) > 0 and cardinality(v_editions) > 0 then 'mixed'
    when cardinality(v_users) > 0 then 'user'
    when cardinality(v_editions) > 0 then 'edition'
    else 'global'
  end;

  -- Keep the ordinary Organizer audit useful without copying targeted user IDs
  -- or edition arrays into another long-lived store. Exact request semantics
  -- remain available through the actor-bound S2 operation receipt.
  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    v_actor,
    'feature_rollout_changed',
    'studio2_feature_flags',
    v_after.key,
    jsonb_build_object(
      'exists', v_exists,
      'revision', v_before_revision,
      'enabled', v_before_enabled,
      'adminsOnly', v_before_admins_only,
      'userTargetCount', v_before_user_count,
      'editionTargetCount', v_before_edition_count
    ),
    jsonb_build_object(
      'operationId', v_operation_id,
      'revision', v_after.revision,
      'enabled', v_after.enabled,
      'adminsOnly', v_after.admins_only,
      'scopeKind', v_scope_kind,
      'userTargetCount', cardinality(v_users),
      'editionTargetCount', cardinality(v_editions)
    )
  );

  perform private.v3_emit_domain_event(
    'rollout.changed',
    'feature_rollout',
    v_after.key,
    v_after.revision,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'key', v_after.key,
      'enabled', v_after.enabled,
      'adminsOnly', v_after.admins_only,
      'scopeKind', v_scope_kind,
      'userTargetCount', cardinality(v_users),
      'editionTargetCount', cardinality(v_editions)
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'key', v_after.key,
    'revision', v_after.revision,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_feature_flag_change(
  text, boolean, boolean, uuid[], uuid[], uuid, text, bigint, uuid
) from public, anon, service_role;
grant execute on function public.studio2_apply_feature_flag_change(
  text, boolean, boolean, uuid[], uuid[], uuid, text, bigint, uuid
) to authenticated;

-- Compatibility entrypoint for current Organizer/browser callers. A true no-op
-- keeps the existing row-returning behavior without fabricating an operation or
-- event. A semantic change derives stable operation identity from actor + exact
-- reviewed revision + normalized desired state and delegates to the command.
create or replace function public.studio2_set_feature_flag(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean default false,
  p_user_ids uuid[] default '{}'::uuid[],
  p_edition_ids uuid[] default '{}'::uuid[]
)
returns public.studio2_feature_flags
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $compat$
declare
  v_actor uuid := auth.uid();
  v_users uuid[] := private.v3_normalize_rollout_uuid_array(p_user_ids);
  v_editions uuid[] := private.v3_normalize_rollout_uuid_array(p_edition_ids);
  v_preview jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_result jsonb;
  v_row public.studio2_feature_flags%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  v_preview := public.studio2_feature_flag_change_preview(
    p_key,
    p_enabled,
    p_admins_only,
    v_users,
    v_editions
  );

  if coalesce((v_preview ->> 'noChange')::boolean, false) then
    select flag.* into v_row
    from public.studio2_feature_flags flag
    where flag.key = p_key;
    return v_row;
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'rollout.change.compatibility',
    'R1',
    jsonb_build_object(
      'actorId', v_actor,
      'featureKey', p_key,
      'expectedRevision', (v_preview ->> 'currentRevision')::bigint
    ),
    jsonb_build_object(
      'enabled', coalesce(p_enabled, false),
      'adminsOnly', coalesce(p_admins_only, false),
      'userIds', to_jsonb(v_users),
      'editionIds', to_jsonb(v_editions)
    )
  );

  v_operation_id := (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;

  v_result := public.studio2_apply_feature_flag_change(
    p_key,
    p_enabled,
    p_admins_only,
    v_users,
    v_editions,
    v_operation_id,
    v_operation_id::text,
    (v_preview ->> 'currentRevision')::bigint,
    v_operation_id
  );

  if v_result ->> 'status' <> 'succeeded' then
    raise exception 'Canonical feature rollout change did not complete successfully'
      using errcode = '55000';
  end if;

  select flag.* into v_row
  from public.studio2_feature_flags flag
  where flag.key = p_key;
  return v_row;
end
$compat$;

revoke all on function public.studio2_set_feature_flag(
  text, boolean, boolean, uuid[], uuid[]
) from public, anon, service_role;
grant execute on function public.studio2_set_feature_flag(
  text, boolean, boolean, uuid[], uuid[]
) to authenticated;

comment on function public.studio2_feature_flag_change_preview(text, boolean, boolean, uuid[], uuid[])
is 'System V3 Feature Rollout preflight. Returns the exact aggregate revision a reviewed rollout.change must bind to.';

comment on function public.studio2_apply_feature_flag_change(text, boolean, boolean, uuid[], uuid[], uuid, text, bigint, uuid)
is 'System V3 authoritative rollout.change command with capability/scope validation, revision CAS, S2 idempotency/receipt, audit and S4 DomainEvent evidence.';

comment on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[])
is 'Compatibility adapter for authenticated callers; delegates semantic changes to the authoritative V3 rollout.change command.';

notify pgrst, 'reload schema';

commit;
