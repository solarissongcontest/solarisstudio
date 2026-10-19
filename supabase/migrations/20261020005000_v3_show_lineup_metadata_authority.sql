begin;

-- #598 final non-membership authority slice, stacked on the canonical
-- show-lineup + membership command work. This migration owns the remaining
-- direct metadata writes visible in ShowLineupWorkspace without duplicating
-- membership or qualifier operations that are already canonical in #1263.
select public.v3_register_migration_contract(
  'v3.show-lineup-metadata-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern global/custom contest identity metadata plus participant artist/song edits and edition-wide detail synchronization using S2 receipts and canonical show/edition change events.'
);

create or replace function public.v3_show_lineup_state_preflight(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_state jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_state := private.v3_show_lineup_state_payload(p_show_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'showKind', v_show.kind,
    'lineupStage', v_show.lineup_stage,
    'stateVersion', private.v3_show_lineup_state_version(p_show_id),
    'participantCount', jsonb_array_length(v_state -> 'participants'),
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_show_lineup_state_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.v3_show_lineup_state_preflight(uuid, uuid)
  to authenticated, service_role;

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

  perform 1 from public.editions e where e.id = p_edition_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;

  select * into v_country from public.countries c where c.id = p_country_id;
  if v_country.id is null then
    raise exception using errcode = 'P0002', message = 'COUNTRY_NOT_FOUND';
  end if;

  select * into v_entity
  from public.contest_entities e
  where e.edition_id = p_edition_id and e.country_id = p_country_id;

  if v_entity.id is null then
    insert into public.contest_entities(
      edition_id, entity_type, country_id, display_name, abbreviation,
      flag_image, region
    ) values (
      p_edition_id,
      'global',
      p_country_id,
      v_country.name,
      v_country.short_code,
      v_country.flag_image,
      v_country.region
    ) returning * into v_entity;
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

revoke all on function public.v3_ensure_global_contest_entity(uuid, uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.v3_ensure_global_contest_entity(uuid, uuid, uuid, text, uuid)
  to authenticated, service_role;

create or replace function private.v3_contest_entity_dependency_summary(p_entity_id uuid)
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

  for v_ref in
    select ns.nspname as schema_name,
           cls.relname as table_name,
           att.attname as column_name,
           con.conname as constraint_name,
           con.confdeltype as delete_action
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cls on cls.oid = con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
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
    ) into v_count using p_entity_id;
    v_total := v_total + coalesce(v_count, 0);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
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
    ));
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
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select * into v_entity
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
  if v_action in ('update', 'delete') and (p_entity_id is null or p_expected_updated_at is null) then
    raise exception using errcode = '22023', message = 'VERSION_REQUIRED';
  end if;
  if v_action = 'delete' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;
  if v_action = 'delete' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;
  if v_action in ('create', 'update')
     and (nullif(btrim(coalesce(v_payload ->> 'displayName', '')), '') is null
       or nullif(btrim(coalesce(v_payload ->> 'abbreviation', '')), '') is null) then
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
      'subjectType', case when v_action = 'create' then 'edition' else 'contest_entity' end,
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
    perform 1 from public.editions e where e.id = p_edition_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
    end if;

    insert into public.contest_entities(
      edition_id, entity_type, country_id, display_name, abbreviation,
      flag_image, region
    ) values (
      p_edition_id,
      'custom',
      null,
      btrim(v_payload ->> 'displayName'),
      btrim(v_payload ->> 'abbreviation'),
      nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), ''),
      nullif(btrim(coalesce(v_payload ->> 'region', '')), '')
    ) returning * into v_after;
  else
    select * into v_entity
    from public.contest_entities e
    where e.id = p_entity_id
      and e.edition_id = p_edition_id
      and e.entity_type = 'custom'
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'CUSTOM_ENTITY_NOT_FOUND';
    end if;
    if v_entity.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT',
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
        raise exception using errcode = '23503', message = 'DEPENDENCY_FAILURE',
          detail = v_dependencies::text;
      end if;
      delete from public.contest_entities e
      where e.id = p_entity_id
        and e.edition_id = p_edition_id
        and e.entity_type = 'custom';
    end if;
  end if;

  v_event_version := hashtextextended(
    coalesce(
      case when v_action = 'delete' then v_entity.updated_at::text else v_after.updated_at::text end,
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
      'contestEntityId', case when v_action = 'create' then v_after.id else p_entity_id end,
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
    'contestEntityId', case when v_action = 'create' then v_after.id else p_entity_id end,
    'action', v_action,
    'displayName', case when v_action = 'delete' then v_entity.display_name else v_after.display_name end,
    'abbreviation', case when v_action = 'delete' then v_entity.abbreviation else v_after.abbreviation end,
    'flagImage', case when v_action = 'delete' then v_entity.flag_image else v_after.flag_image end,
    'region', case when v_action = 'delete' then v_entity.region else v_after.region end,
    'updatedAt', case when v_action = 'delete' then to_jsonb(v_entity.updated_at) else to_jsonb(v_after.updated_at) end,
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

create or replace function private.v3_edition_entry_detail_state(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $fn$
  with rows as (
    select p.id, p.show_id, p.country_id, p.contest_entity_id,
           p.artist, p.song, p.updated_at
    from public.participants p
    where p.edition_id = p_edition_id
    order by p.id
  ),
  materialized as (
    select jsonb_build_object(
      'editionId', p_edition_id,
      'participants', coalesce(jsonb_agg(jsonb_build_object(
        'id', rows.id,
        'showId', rows.show_id,
        'countryId', rows.country_id,
        'contestEntityId', rows.contest_entity_id,
        'artist', rows.artist,
        'song', rows.song,
        'updatedAt', rows.updated_at
      ) order by rows.id), '[]'::jsonb)
    ) as state
    from rows
  )
  select materialized.state || jsonb_build_object(
    'stateVersion', encode(
      extensions.digest(convert_to(materialized.state::text, 'UTF8'), 'sha256'),
      'hex'
    )
  ) from materialized
$fn$;

revoke all on function private.v3_edition_entry_detail_state(uuid)
  from public, anon, authenticated;

create or replace function private.v3_entry_detail_sync_targets(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
  with ranked as (
    select
      coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id,
      p.id as source_participant_id,
      p.artist,
      p.song,
      row_number() over (
        partition by coalesce(p.country_id, p.contest_entity_id, p.id)
        order by p.updated_at desc, p.id desc
      ) as rank
    from public.participants p
    where p.edition_id = p_edition_id
      and (p.artist is not null or p.song is not null)
  ),
  sources as (select * from ranked where rank = 1),
  targets as (
    select p.id as participant_id, s.source_participant_id, s.artist, s.song
    from public.participants p
    join sources s on s.identity_id = coalesce(p.country_id, p.contest_entity_id, p.id)
    where p.edition_id = p_edition_id
      and p.artist is null
      and p.song is null
      and p.id <> s.source_participant_id
    order by p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'participantId', targets.participant_id,
    'sourceParticipantId', targets.source_participant_id,
    'artist', targets.artist,
    'song', targets.song
  ) order by targets.participant_id), '[]'::jsonb)
  from targets
$fn$;

revoke all on function private.v3_entry_detail_sync_targets(uuid)
  from public, anon, authenticated;

create or replace function public.v3_entry_detail_sync_preflight(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_state jsonb;
  v_targets jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_state := private.v3_edition_entry_detail_state(p_edition_id);
  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'stateVersion', v_state ->> 'stateVersion',
    'targetCount', jsonb_array_length(v_targets),
    'targets', v_targets,
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_entry_detail_sync_preflight(uuid) from public, anon;
grant execute on function public.v3_entry_detail_sync_preflight(uuid)
  to authenticated, service_role;

create or replace function public.v3_execute_show_entry_detail_update(
  p_edition_id uuid,
  p_show_id uuid,
  p_participant_id uuid,
  p_artist text,
  p_song text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_before_version text;
  v_after_version text;
  v_previous_artist text;
  v_previous_song text;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_participant_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.entry.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'participant',
      'subjectId', p_participant_id
    ),
    jsonb_build_object(
      'participantId', p_participant_id,
      'artist', nullif(btrim(coalesce(p_artist, '')), ''),
      'song', nullif(btrim(coalesce(p_song, '')), ''),
      'expectedStateVersion', p_expected_state_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1 from public.shows s where s.id = p_show_id for update;
  perform 1 from public.participants p
  where p.show_id = p_show_id order by p.id for update;
  v_before_version := private.v3_show_lineup_state_version(p_show_id);
  if v_before_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select p.artist, p.song into v_previous_artist, v_previous_song
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = p_edition_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND';
  end if;

  update public.participants p
  set artist = nullif(btrim(coalesce(p_artist, '')), ''),
      song = nullif(btrim(coalesce(p_song, '')), ''),
      updated_at = now()
  where p.id = p_participant_id;

  v_after_version := private.v3_show_lineup_state_version(p_show_id);
  v_event_version := hashtextextended(v_after_version, 0)
    & 9223372036854775807::bigint;
  perform private.v3_emit_domain_event(
    'show.changed',
    'show',
    p_show_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'changeKind', 'entry_detail_updated',
      'participantId', p_participant_id,
      'beforeStateVersion', v_before_version,
      'afterStateVersion', v_after_version,
      'beforeArtist', v_previous_artist,
      'beforeSong', v_previous_song,
      'artist', nullif(btrim(coalesce(p_artist, '')), ''),
      'song', nullif(btrim(coalesce(p_song, '')), '')
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', 'update_entry_detail',
    'lineupStage', v_show.lineup_stage,
    'stateVersion', v_after_version,
    'changed', true
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_show_entry_detail_update(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_entry_detail_update(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid
) to authenticated, service_role;

create or replace function public.v3_execute_entry_detail_sync(
  p_edition_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
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
  v_before jsonb;
  v_after jsonb;
  v_targets jsonb;
  v_current_version text;
  v_affected integer := 0;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'entry.details.sync',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'edition',
      'subjectId', p_edition_id
    ),
    jsonb_build_object('expectedStateVersion', p_expected_state_version)
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1 from public.participants p
  where p.edition_id = p_edition_id order by p.id for update;

  v_before := private.v3_edition_entry_detail_state(p_edition_id);
  v_current_version := v_before ->> 'stateVersion';
  if v_current_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_current_version
      )::text;
  end if;

  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);

  with ranked as (
    select
      coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id,
      p.artist,
      p.song,
      row_number() over (
        partition by coalesce(p.country_id, p.contest_entity_id, p.id)
        order by p.updated_at desc, p.id desc
      ) as rank
    from public.participants p
    where p.edition_id = p_edition_id
      and (p.artist is not null or p.song is not null)
  ),
  sources as (select * from ranked where rank = 1)
  update public.participants p
  set artist = s.artist,
      song = s.song,
      updated_at = now()
  from sources s
  where p.edition_id = p_edition_id
    and p.artist is null
    and p.song is null
    and s.identity_id = coalesce(p.country_id, p.contest_entity_id, p.id);
  get diagnostics v_affected = row_count;

  v_after := private.v3_edition_entry_detail_state(p_edition_id);
  v_event_version := hashtextextended(v_after ->> 'stateVersion', 0)
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
      'changeKind', 'entry_details_synced',
      'beforeStateVersion', v_current_version,
      'afterStateVersion', v_after ->> 'stateVersion',
      'affectedCount', v_affected,
      'targets', v_targets
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'action', 'sync_entry_details',
    'stateVersion', v_after ->> 'stateVersion',
    'affectedCount', v_affected,
    'changed', v_affected > 0
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_entry_detail_sync(
  uuid, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_entry_detail_sync(
  uuid, uuid, text, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
