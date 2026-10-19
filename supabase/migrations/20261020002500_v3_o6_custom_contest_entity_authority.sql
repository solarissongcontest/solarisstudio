begin;

-- V3 O6 / #598: custom edition-only identities are operational contest data.
-- Their create/update/delete lifecycle must not remain arbitrary browser CRUD.
select public.v3_register_migration_contract(
  'v3.o6.custom-contest-entity-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern custom contest-entity create/update/delete with exact edition scope, CAS, dynamic dependency preflight, R3 deletion, receipts and domain events.'
);

create or replace function private.v3_contest_entity_dependency_summary(
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $dependencies$
declare
  v_ref record;
  v_count bigint;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_entity_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Discover the actual FK graph instead of maintaining a browser-side list.
  -- Only single-column FKs that target contest_entities(id) are relevant here;
  -- any future such FK automatically becomes part of destructive preflight.
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
$dependencies$;

revoke all on function private.v3_contest_entity_dependency_summary(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_custom_contest_entity_preflight(
  p_edition_id uuid,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_entity public.contest_entities%rowtype;
  v_dependencies jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
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
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  v_dependencies := private.v3_contest_entity_dependency_summary(p_entity_id);

  return jsonb_build_object(
    'editionId', p_edition_id,
    'entityId', p_entity_id,
    'entityType', v_entity.entity_type,
    'displayName', v_entity.display_name,
    'abbreviation', v_entity.abbreviation,
    'flagImage', v_entity.flag_image,
    'region', v_entity.region,
    'updatedAt', v_entity.updated_at,
    'dependencies', v_dependencies,
    'canDelete', coalesce((v_dependencies ->> 'canDelete')::boolean, false),
    'deleteRiskClass', 'R3'
  );
end
$preflight$;

revoke all on function public.studio2_custom_contest_entity_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_custom_contest_entity_preflight(uuid, uuid)
  to authenticated, service_role;

create or replace function public.studio2_create_custom_show_entity(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_lineup_state_version text,
  p_display_name text,
  p_abbreviation text,
  p_flag_image text default null,
  p_region text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $create_entity$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_entity_id uuid;
  v_participant_id uuid;
  v_show_kind text;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_abbreviation text := nullif(btrim(coalesce(p_abbreviation, '')), '');
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_name is null or v_abbreviation is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.custom_entity.create',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'expectedLineupStateVersion', p_expected_lineup_state_version,
      'displayName', v_name,
      'abbreviation', v_abbreviation,
      'flagImage', nullif(btrim(coalesce(p_flag_image, '')), ''),
      'region', nullif(btrim(coalesce(p_region, '')), '')
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_lineup_state_version
  );

  select s.kind
  into v_show_kind
  from public.shows s
  where s.id = p_show_id
    and s.edition_id = v_edition_id;

  insert into public.contest_entities (
    edition_id,
    entity_type,
    country_id,
    display_name,
    abbreviation,
    flag_image,
    region
  ) values (
    v_edition_id,
    'custom',
    null,
    v_name,
    v_abbreviation,
    nullif(btrim(coalesce(p_flag_image, '')), ''),
    nullif(btrim(coalesce(p_region, '')), '')
  )
  returning id into v_entity_id;

  insert into public.participants (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    running_order,
    running_order_allocation,
    semi_final,
    artist,
    song
  ) values (
    v_edition_id,
    p_show_id,
    null,
    v_entity_id,
    null,
    null,
    coalesce(v_show_kind, 'final'),
    null,
    null
  )
  returning id into v_participant_id;

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.custom_entity_created',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'contestEntityId', v_entity_id,
      'participantId', v_participant_id,
      'displayName', v_name,
      'abbreviation', v_abbreviation
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'contestEntityId', v_entity_id,
    'participantId', v_participant_id,
    'stateVersion', v_after ->> 'stateVersion'
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$create_entity$;

revoke all on function public.studio2_create_custom_show_entity(
  uuid, text, uuid, text, text, text, text, text, uuid
) from public, anon;
grant execute on function public.studio2_create_custom_show_entity(
  uuid, text, uuid, text, text, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_update_custom_contest_entity(
  p_operation_id uuid,
  p_idempotency_key text,
  p_edition_id uuid,
  p_entity_id uuid,
  p_expected_updated_at timestamptz,
  p_display_name text,
  p_abbreviation text,
  p_flag_image text default null,
  p_region text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $update_entity$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_entity public.contest_entities%rowtype;
  v_after public.contest_entities%rowtype;
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_abbreviation text := nullif(btrim(coalesce(p_abbreviation, '')), '');
  v_result jsonb;
  v_event_version bigint;
begin
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_entity_id is null or p_expected_updated_at is null or v_name is null or v_abbreviation is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'contest_entity.custom.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'contest_entity',
      'subjectId', p_entity_id
    ),
    jsonb_build_object(
      'expectedUpdatedAt', p_expected_updated_at,
      'displayName', v_name,
      'abbreviation', v_abbreviation,
      'flagImage', nullif(btrim(coalesce(p_flag_image, '')), ''),
      'region', nullif(btrim(coalesce(p_region, '')), '')
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into v_entity
  from public.contest_entities e
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
    and e.entity_type = 'custom'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
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

  update public.contest_entities e
  set display_name = v_name,
      abbreviation = v_abbreviation,
      flag_image = nullif(btrim(coalesce(p_flag_image, '')), ''),
      region = nullif(btrim(coalesce(p_region, '')), ''),
      updated_at = now()
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
  returning * into v_after;

  v_event_version := hashtextextended(v_after.updated_at::text, 0)
    & 9223372036854775807::bigint;
  perform private.v3_emit_domain_event(
    'contest_entity.custom_updated',
    'contest_entity',
    p_entity_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'beforeUpdatedAt', v_entity.updated_at,
      'afterUpdatedAt', v_after.updated_at,
      'displayName', v_after.display_name,
      'abbreviation', v_after.abbreviation
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'contestEntityId', p_entity_id,
    'updatedAt', v_after.updated_at
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$update_entity$;

revoke all on function public.studio2_update_custom_contest_entity(
  uuid, text, uuid, uuid, timestamptz, text, text, text, text, uuid
) from public, anon;
grant execute on function public.studio2_update_custom_contest_entity(
  uuid, text, uuid, uuid, timestamptz, text, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_delete_custom_contest_entity(
  p_operation_id uuid,
  p_idempotency_key text,
  p_edition_id uuid,
  p_entity_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $delete_entity$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_entity public.contest_entities%rowtype;
  v_dependencies jsonb;
  v_auth_evidence jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
  v_event_version bigint;
begin
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_entity_id is null or p_expected_updated_at is null or v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_auth_evidence := private.studio2_require_fresh_auth(300);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'contest_entity.custom.delete',
    'R3',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'contest_entity',
      'subjectId', p_entity_id
    ),
    jsonb_build_object(
      'expectedUpdatedAt', p_expected_updated_at,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into v_entity
  from public.contest_entities e
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
    and e.entity_type = 'custom'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
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

  v_event_version := hashtextextended(v_entity.updated_at::text, 0)
    & 9223372036854775807::bigint;
  perform private.v3_emit_domain_event(
    'contest_entity.custom_deleted',
    'contest_entity',
    p_entity_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'displayName', v_entity.display_name,
      'abbreviation', v_entity.abbreviation,
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
    'contestEntityId', p_entity_id,
    'deleted', true,
    'reason', v_reason
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$delete_entity$;

revoke all on function public.studio2_delete_custom_contest_entity(
  uuid, text, uuid, uuid, timestamptz, text, uuid
) from public, anon;
grant execute on function public.studio2_delete_custom_contest_entity(
  uuid, text, uuid, uuid, timestamptz, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
