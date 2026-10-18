begin;

-- System V3 S5 Feature Rollout authority foundation.
--
-- The legacy rollout RPC was server-authoritative but had no immutable operation
-- receipt, no monotonic aggregate version and treated UUID-array ordering as
-- state. Move runtime changes behind the S2 operation contract, add an exact
-- revision CAS, preserve the old five-argument RPC as an authenticated
-- compatibility adapter, and emit one rollout.changed fact only for semantic
-- state changes.

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

-- Runtime service-role direct writes cannot participate in the actor-bound S2
-- receipt contract. Repository callers use authenticated Organizer sessions;
-- schema migrations still run as the database owner and are unaffected.
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
  from public, anon, authenticated;

create or replace function private.v3_rollout_manage_allowed(
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
  if cardinality(v_existing) = 0 or cardinality(v_requested) = 0 then
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

revoke all on function private.v3_rollout_manage_allowed(uuid[], uuid[])
  from public, anon, authenticated;

-- Feature rollout is an operational recovery control. The pre-S2 writer was
-- available in read-only/maintenance; preserve that behavior while still
-- forcing authenticated callers through the canonical operation contract.
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
  v_users uuid[] := private.v3_normalize_rollout_uuid_array(p_user_ids);
  v_editions uuid[] := private.v3_normalize_rollout_uuid_array(p_edition_ids);
  v_enabled boolean := coalesce(p_enabled, false);
  v_admins_only boolean := coalesce(p_admins_only, false);
  v_no_change boolean;
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
  if v_row.key is null then
    raise exception 'Feature flag not found' using errcode = 'P0002';
  end if;

  if not private.v3_rollout_manage_allowed(v_row.edition_ids, v_editions) then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

  v_no_change :=
    v_row.enabled is not distinct from v_enabled
    and v_row.admins_only is not distinct from v_admins_only
    and private.v3_normalize_rollout_uuid_array(v_row.user_ids) is not distinct from v_users
    and private.v3_normalize_rollout_uuid_array(v_row.edition_ids) is not distinct from v_editions;

  return jsonb_build_object(
    'key', v_row.key,
    'currentRevision', v_row.revision,
    'enabled', v_row.enabled,
    'adminsOnly', v_row.admins_only,
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
  v_users uuid[] := private.v3_normalize_rollout_uuid_array(p_user_ids);
  v_editions uuid[] := private.v3_normalize_rollout_uuid_array(p_edition_ids);
  v_enabled boolean := coalesce(p_enabled, false);
  v_admins_only boolean := coalesce(p_admins_only, false);
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_changed boolean;
  v_scope_kind text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if nullif(btrim(coalesce(p_key, '')), '') is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_revision is null
     or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2_feature_flag:' || p_key, 0));

  select flag.* into v_row
  from public.studio2_feature_flags flag
  where flag.key = p_key
  for update;
  if v_row.key is null then
    raise exception 'Feature flag not found' using errcode = 'P0002';
  end if;

  if not private.v3_rollout_manage_allowed(v_row.edition_ids, v_editions) then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

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

  if v_row.revision is distinct from p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'VERSION_CONFLICT',
      hint = 'Refresh Feature rollout before retrying.';
  end if;

  v_changed :=
    v_row.enabled is distinct from v_enabled
    or v_row.admins_only is distinct from v_admins_only
    or private.v3_normalize_rollout_uuid_array(v_row.user_ids) is distinct from v_users
    or private.v3_normalize_rollout_uuid_array(v_row.edition_ids) is distinct from v_editions;

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

  update public.studio2_feature_flags
  set enabled = v_enabled,
      admins_only = v_admins_only,
      user_ids = v_users,
      edition_ids = v_editions,
      updated_by = v_actor,
      revision = revision + 1
  where key = p_key
  returning * into v_after;

  v_scope_kind := case
    when cardinality(v_users) > 0 and cardinality(v_editions) > 0 then 'mixed'
    when cardinality(v_users) > 0 then 'user'
    when cardinality(v_editions) > 0 then 'edition'
    else 'global'
  end;

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
-- keeps the old row-returning behavior without fabricating an operation/event.
-- A semantic change derives stable operation identity from actor + current
-- revision + desired normalized state, then delegates to the canonical apply.
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

notify pgrst, 'reload schema';

commit;
