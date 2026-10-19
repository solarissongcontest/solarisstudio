begin;

-- #598 identity-only follow-up stacked on the canonical #1263 line-up work.
-- #1263 already governs allocation, running order, membership, qualifier
-- promotion, participant artist/song edits and entry-detail synchronization.
-- The remaining direct authoritative writes in ShowLineupWorkspace are the
-- creation/maintenance of edition-scoped contest identities themselves.
select public.v3_register_migration_contract(
  'v3.show-lineup-identity-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern global edition identity creation and custom contest-entity create/update/delete with S2 receipts, exact-edition authorization, optimistic concurrency and fail-closed dependency protection.'
);

create or replace function public.v3_ensure_global_contest_entity(
  p_edition_id uuid,
  p_country_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_country public.countries%rowtype;
  v_entity public.contest_entities%rowtype;
  v_created boolean := false;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_country_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'contest.entity.global.ensure',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'country',
      'subjectId', p_country_id
    ),
    jsonb_build_object('countryId', p_country_id)
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Serialize edition identity creation so two different idempotency keys
  -- cannot race the unique edition+country constraint and produce an
  -- ambiguous browser outcome.
  perform 1
  from public.editions e
  where e.id = p_edition_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;

  select *
  into v_country
  from public.countries c
  where c.id = p_country_id;
  if v_country.id is null then
    raise exception using errcode = 'P0002', message = 'COUNTRY_NOT_FOUND';
  end if;

  select *
  into v_entity
  from public.contest_entities e
  where e.edition_id = p_edition_id
    and e.country_id = p_country_id;

  if v_entity.id is null then
    insert into public.contest_entities(
      edition_id,
      entity_type,
      country_id,
      display_name,
      abbreviation,
      flag_image,
      region
    ) values (
      p_edition_id,
      'global',
      p_country_id,
      v_country.name,
      v_country.short_code,
      v_country.flag_image,
      v_country.region
    )
    returning * into v_entity;
    v_created := true;
  end if;

  if v_created then
    v_event_version := hashtextextended(v_entity.updated_at::text, 0)
      & 9223372036854775807::bigint;
    perform private.v3_emit_domain_event(
      'edition.changed',
      'edition',
      p_edition_id::text,
      v_event_version,
      v_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'changeKind', 'global_contest_entity_created',
        'contestEntityId', v_entity.id,
        'countryId', p_country_id
      ),
      1,
      array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'contestEntityId', v_entity.id,
    'countryId', v_entity.country_id,
    'displayName', v_entity.display_name,
    'abbreviation', v_entity.abbreviation,
    'flagImage', v_entity.flag_image,
    'region', v_entity.region,
    'updatedAt', v_entity.updated_at,
    'created', v_created
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_ensure_global_contest_entity(
  uuid, uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.v3_ensure_global_contest_entity(
  uuid, uuid, uuid, text, uuid
) to authenticated, service_role;

comment on function public.v3_ensure_global_contest_entity(
  uuid, uuid, uuid, text, uuid
) is
  'Idempotently resolves or creates the canonical edition-scoped global contest entity for a country; browser clients do not own this identity write.';

create or replace function private.v3_contest_entity_dependency_summary(
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_ref record;
  v_count bigint;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_entity_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Discover the live database dependency graph. In particular, references
  -- configured ON DELETE CASCADE / SET NULL are still product dependencies;
  -- PostgreSQL delete behaviour is not permission to rewrite official history.
  for v_ref in
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      att.attname as column_name,
      con.conname as constraint_name,
      con.confdeltype as delete_action
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cls
      on cls.oid = con.conrelid
    join pg_catalog.pg_namespace ns
      on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.contest_entities'::regclass
      and array_length(con.conkey, 1) = 1
      and array_length(con.confkey, 1) = 1
    order by ns.nspname, cls.relname, con.conname
  loop
    execute format(
      'select count(*)::bigint from %I.%I where %I = $1',
      v_ref.schema_name,
      v_ref.table_name,
      v_ref.column_name
    )
    into v_count
    using p_entity_id;

    v_total := v_total + coalesce(v_count, 0);
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'schema', v_ref.schema_name,
        'table', v_ref.table_name,
        'column', v_ref.column_name,
        'constraint', v_ref.constraint_name,
        'deleteAction', case v_ref.delete_action
          when 'a' then 'no_action'
          when 'r' then 'restrict'
          when 'c' then 'cascade'
          when 'n' then 'set_null'
          when 'd' then 'set_default'
          else 'unknown'
        end,
        'count', coalesce(v_count, 0)
      )
    );
  end loop;

  return jsonb_build_object(
    'contestEntityId', p_entity_id,
    'totalReferences', v_total,
    'canDelete', v_total = 0,
    'references', v_items
  );
end
$fn$;

revoke all on function private.v3_contest_entity_dependency_summary(uuid)
  from public, anon, authenticated;

create or replace function public.v3_custom_contest_entity_preflight(
  p_edition_id uuid,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_entity public.contest_entities%rowtype;
  v_dependencies jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_entity_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select *
  into v_entity
  from public.contest_entities e
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
    and e.entity_type = 'custom';
  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOM_ENTITY_NOT_FOUND';
  end if;

  v_dependencies := private.v3_contest_entity_dependency_summary(p_entity_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'entityId', p_entity_id,
    'displayName', v_entity.display_name,
    'abbreviation', v_entity.abbreviation,
    'flagImage', v_entity.flag_image,
    'region', v_entity.region,
    'updatedAt', v_entity.updated_at,
    'dependencies', v_dependencies,
    'canDelete', coalesce((v_dependencies ->> 'canDelete')::boolean, false),
    'deleteRiskClass', 'R3',
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_custom_contest_entity_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.v3_custom_contest_entity_preflight(uuid, uuid)
  to authenticated, service_role;

comment on function public.v3_custom_contest_entity_preflight(uuid, uuid) is
  'Exact-edition custom contest-entity preflight including all live FK dependencies before destructive removal.';

create or replace function public.v3_execute_custom_contest_entity_operation(
  p_edition_id uuid,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz default null,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_entity public.contest_entities%rowtype;
  v_after public.contest_entities%rowtype;
  v_dependencies jsonb := '{}'::jsonb;
  v_auth_evidence jsonb := '{}'::jsonb;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object'
     or v_action not in ('create', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_action in ('update', 'delete')
     and (p_entity_id is null or p_expected_updated_at is null) then
    raise exception using errcode = '22023', message = 'VERSION_REQUIRED';
  end if;
  if v_action = 'delete' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;
  if v_action = 'delete' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;
  if v_action in ('create', 'update')
     and (
       nullif(btrim(coalesce(v_payload ->> 'displayName', '')), '') is null
       or nullif(btrim(coalesce(v_payload ->> 'abbreviation', '')), '') is null
     ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'contest.entity.custom.' || v_action,
    case when v_action = 'delete' then 'R3' else 'R2' end,
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', case
        when v_action = 'create' then 'edition'
        else 'contest_entity'
      end,
      'subjectId', coalesce(p_entity_id, p_edition_id)
    ),
    jsonb_build_object(
      'action', v_action,
      'entityId', p_entity_id,
      'payload', v_payload,
      'expectedUpdatedAt', p_expected_updated_at,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  if v_action = 'create' then
    perform 1
    from public.editions e
    where e.id = p_edition_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
    end if;

    insert into public.contest_entities(
      edition_id,
      entity_type,
      country_id,
      display_name,
      abbreviation,
      flag_image,
      region
    ) values (
      p_edition_id,
      'custom',
      null,
      btrim(v_payload ->> 'displayName'),
      btrim(v_payload ->> 'abbreviation'),
      nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), ''),
      nullif(btrim(coalesce(v_payload ->> 'region', '')), '')
    )
    returning * into v_after;
  else
    select *
    into v_entity
    from public.contest_entities e
    where e.id = p_entity_id
      and e.edition_id = p_edition_id
      and e.entity_type = 'custom'
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'CUSTOM_ENTITY_NOT_FOUND';
    end if;
    if v_entity.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'VERSION_CONFLICT',
        detail = jsonb_build_object(
          'expectedUpdatedAt', p_expected_updated_at,
          'currentUpdatedAt', v_entity.updated_at
        )::text;
    end if;

    if v_action = 'update' then
      update public.contest_entities e
      set display_name = btrim(v_payload ->> 'displayName'),
          abbreviation = btrim(v_payload ->> 'abbreviation'),
          flag_image = nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), ''),
          region = nullif(btrim(coalesce(v_payload ->> 'region', '')), ''),
          updated_at = now()
      where e.id = p_entity_id
      returning * into v_after;
    else
      v_dependencies := private.v3_contest_entity_dependency_summary(p_entity_id);
      if not coalesce((v_dependencies ->> 'canDelete')::boolean, false) then
        raise exception using
          errcode = '23503',
          message = 'DEPENDENCY_FAILURE',
          detail = v_dependencies::text;
      end if;

      delete from public.contest_entities e
      where e.id = p_entity_id
        and e.edition_id = p_edition_id
        and e.entity_type = 'custom';
      if not found then
        raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
      end if;
    end if;
  end if;

  v_event_version := hashtextextended(
    coalesce(
      case
        when v_action = 'delete' then v_entity.updated_at::text
        else v_after.updated_at::text
      end,
      ''
    ),
    0
  ) & 9223372036854775807::bigint;

  perform private.v3_emit_domain_event(
    'edition.changed',
    'edition',
    p_edition_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'changeKind', 'custom_contest_entity_' || v_action,
      'contestEntityId', case
        when v_action = 'create' then v_after.id
        else p_entity_id
      end,
      'reason', v_reason,
      'dependencies', v_dependencies,
      'freshAuth', v_auth_evidence
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'contestEntityId', case
      when v_action = 'create' then v_after.id
      else p_entity_id
    end,
    'action', v_action,
    'displayName', case
      when v_action = 'delete' then v_entity.display_name
      else v_after.display_name
    end,
    'abbreviation', case
      when v_action = 'delete' then v_entity.abbreviation
      else v_after.abbreviation
    end,
    'flagImage', case
      when v_action = 'delete' then v_entity.flag_image
      else v_after.flag_image
    end,
    'region', case
      when v_action = 'delete' then v_entity.region
      else v_after.region
    end,
    'updatedAt', case
      when v_action = 'delete' then to_jsonb(v_entity.updated_at)
      else to_jsonb(v_after.updated_at)
    end,
    'deleted', v_action = 'delete'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_custom_contest_entity_operation(
  uuid, uuid, text, jsonb, uuid, text, timestamptz, text, uuid
) from public, anon;
grant execute on function public.v3_execute_custom_contest_entity_operation(
  uuid, uuid, text, jsonb, uuid, text, timestamptz, text, uuid
) to authenticated, service_role;

comment on function public.v3_execute_custom_contest_entity_operation(
  uuid, uuid, text, jsonb, uuid, text, timestamptz, text, uuid
) is
  'Canonical custom contest-entity create/update/delete operation. Delete is R3, fresh-authenticated and fails closed while any FK-backed canonical reference remains.';

notify pgrst, 'reload schema';
commit;
