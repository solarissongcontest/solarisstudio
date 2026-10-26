begin;

-- System V3 / Organizer O6 (#581): canonical show lifecycle authority.
--
-- The legacy Shows workspace historically wrote public.shows directly from the
-- browser. This migration introduces the exact-edition, versioned, idempotent
-- command boundary required by V3 without deleting the legacy path before its
-- active Organizer consumer has migrated.
select public.v3_register_migration_contract(
  'v3.o6.show-lifecycle-commands',
  1,
  'forward_fix_only',
  false,
  null,
  'Versioned and receipted exact-edition show lifecycle commands with dependency-aware deletion'
);

alter table public.shows
  add column if not exists version bigint not null default 1;

alter table public.shows
  drop constraint if exists shows_version_positive;
alter table public.shows
  add constraint shows_version_positive check (version > 0) not valid;
alter table public.shows
  validate constraint shows_version_positive;

create or replace function private.studio2_bump_show_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
begin
  new.version := old.version + 1;
  return new;
end
$bump$;

revoke all on function private.studio2_bump_show_version()
  from public, anon, authenticated;

drop trigger if exists studio2_bump_show_version on public.shows;
create trigger studio2_bump_show_version
before update on public.shows
for each row execute function private.studio2_bump_show_version();

-- Enumerate every single-column FK which points at public.shows(id). The
-- preflight therefore automatically notices new dependent tables instead of
-- silently allowing an old hard-coded dependency list to become incomplete.
-- The one automatic publication-control row is metadata created for every show
-- and is the only non-blocking reference; its publication state is checked
-- independently below. All other references fail closed for permanent delete.
create or replace function private.studio2_show_dependency_snapshot(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $dependencies$
declare
  v_fk record;
  v_count bigint;
  v_tables jsonb := '{}'::jsonb;
  v_blocking_tables integer := 0;
  v_blocking_references bigint := 0;
  v_blocking boolean;
  v_action text;
begin
  if p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  for v_fk in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name,
      constraint_row.confdeltype as delete_type
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.shows'::regclass
      and array_length(constraint_row.conkey, 1) = 1
      and array_length(constraint_row.confkey, 1) = 1
    order by namespace.nspname, relation.relname, attribute.attname
  loop
    execute format(
      'select count(*)::bigint from %I.%I where %I = $1',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name
    )
    into v_count
    using p_show_id;

    v_blocking := not (
      v_fk.schema_name = 'public'
      and v_fk.table_name = 'studio2_show_publication_controls'
    );

    v_action := case v_fk.delete_type
      when 'a' then 'no_action'
      when 'r' then 'restrict'
      when 'c' then 'cascade'
      when 'n' then 'set_null'
      when 'd' then 'set_default'
      else 'unknown'
    end;

    v_tables := v_tables || jsonb_build_object(
      v_fk.schema_name || '.' || v_fk.table_name || '.' || v_fk.column_name,
      jsonb_build_object(
        'count', v_count,
        'deleteAction', v_action,
        'blocking', v_blocking and v_count > 0
      )
    );

    if v_blocking and v_count > 0 then
      v_blocking_tables := v_blocking_tables + 1;
      v_blocking_references := v_blocking_references + v_count;
    end if;
  end loop;

  return jsonb_build_object(
    'showId', p_show_id,
    'blockingTableCount', v_blocking_tables,
    'blockingReferenceCount', v_blocking_references,
    'tables', v_tables
  );
end
$dependencies$;

revoke all on function private.studio2_show_dependency_snapshot(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_show_delete_preflight(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $delete_preflight$
declare
  v_show public.shows;
  v_publication_state text := 'draft';
  v_publication_version bigint := 1;
  v_dependencies jsonb;
  v_has_public_information boolean := false;
  v_blockers jsonb := '[]'::jsonb;
  v_allowed boolean;
begin
  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  select control.state, control.version
  into v_publication_state, v_publication_version
  from public.studio2_show_publication_controls control
  where control.show_id = p_show_id
    and control.edition_id = p_edition_id;

  v_publication_state := coalesce(v_publication_state, 'draft');
  v_publication_version := coalesce(v_publication_version, 1);
  v_dependencies := private.studio2_show_dependency_snapshot(p_show_id);
  v_has_public_information := private.studio2_publication_has_any(v_show.publication_config);

  if v_show.published then
    v_blockers := v_blockers || jsonb_build_array('show_is_published');
  end if;
  if v_publication_state <> 'draft' then
    v_blockers := v_blockers || jsonb_build_array('publication_state_' || v_publication_state);
  end if;
  if v_has_public_information then
    v_blockers := v_blockers || jsonb_build_array('public_information_configured');
  end if;
  if coalesce((v_dependencies ->> 'blockingReferenceCount')::bigint, 0) > 0 then
    v_blockers := v_blockers || jsonb_build_array('dependent_records_exist');
  end if;

  v_allowed := jsonb_array_length(v_blockers) = 0;

  return jsonb_build_object(
    'editionId', v_show.edition_id,
    'showId', v_show.id,
    'expectedVersion', v_show.version,
    'updatedAt', v_show.updated_at,
    'show', jsonb_build_object(
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'status', v_show.status,
      'published', v_show.published,
      'broadcastConfig', coalesce(v_show.broadcast_config, '{}'::jsonb),
      'publicationConfig', coalesce(v_show.publication_config, '{}'::jsonb)
    ),
    'publication', jsonb_build_object(
      'state', v_publication_state,
      'version', v_publication_version,
      'hasPublicInformation', v_has_public_information
    ),
    'dependencies', v_dependencies,
    'delete', jsonb_build_object(
      'allowed', v_allowed,
      'blockers', v_blockers,
      'requiresFreshAuthentication', true,
      'riskClass', 'R3'
    )
  );
end
$delete_preflight$;

revoke all on function private.studio2_show_delete_preflight(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_show_lifecycle_preview(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return private.studio2_show_delete_preflight(p_edition_id, p_show_id)
    || jsonb_build_object(
      'serverTime', now(),
      'operations', jsonb_build_object(
        'update', jsonb_build_object('riskClass', 'R2'),
        'showModeUpdate', jsonb_build_object('riskClass', 'R2'),
        'delete', jsonb_build_object('riskClass', 'R3')
      )
    );
end
$preview$;

revoke all on function public.studio2_show_lifecycle_preview(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_show_lifecycle_preview(uuid, uuid)
  to authenticated;

create or replace function public.studio2_create_show_v3(
  p_edition_id uuid,
  p_name text,
  p_kind text,
  p_sort_order integer,
  p_publication_config jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $create_show$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_claim jsonb;
  v_operation_id uuid;
  v_show public.shows;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or v_name is null or char_length(v_name) > 120
     or v_kind not in ('heat', 'semi-final', 'second-chance', 'grand-final', 'special', 'other')
     or p_sort_order is null or p_sort_order < 1 or p_sort_order > 1000
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(coalesce(p_publication_config, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.create',
    'R2',
    jsonb_build_object('editionId', p_edition_id, 'subjectType', 'show'),
    jsonb_build_object(
      'editionId', p_edition_id,
      'name', v_name,
      'kind', v_kind,
      'sortOrder', p_sort_order,
      'publicationConfig', private.studio2_normalise_publication_config(p_publication_config)
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1 from public.editions where id = p_edition_id for key share;
  if not found then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;

  insert into public.shows (
    edition_id,
    name,
    kind,
    sort_order,
    published,
    publication_config
  )
  values (
    p_edition_id,
    v_name,
    v_kind,
    p_sort_order,
    false,
    private.studio2_normalise_publication_config(p_publication_config)
  )
  returning * into v_show;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'show_created',
    'shows',
    v_show.id::text,
    v_show.edition_id,
    null,
    jsonb_build_object(
      'id', v_show.id,
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'version', v_show.version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', v_show.edition_id,
    'showId', v_show.id,
    'stateVersion', v_show.version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$create_show$;

revoke all on function public.studio2_create_show_v3(
  uuid, text, text, integer, jsonb, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_create_show_v3(
  uuid, text, text, integer, jsonb, uuid, text, uuid
) to authenticated;

create or replace function public.studio2_update_show_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_name text,
  p_kind text,
  p_sort_order integer,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $update_show$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.shows;
  v_after public.shows;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or v_name is null or char_length(v_name) > 120
     or v_kind not in ('heat', 'semi-final', 'second-chance', 'grand-final', 'special', 'other')
     or p_sort_order is null or p_sort_order < 1 or p_sort_order > 1000
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'name', v_name,
      'kind', v_kind,
      'sortOrder', p_sort_order,
      'expectedVersion', p_expected_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select show_row.*
  into v_before
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for update;

  if v_before.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_before.version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  update public.shows
  set
    name = v_name,
    kind = v_kind,
    sort_order = p_sort_order
  where id = p_show_id
    and edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_after;

  if v_after.id is null then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'show_updated',
    'shows',
    v_after.id::text,
    v_after.edition_id,
    jsonb_build_object(
      'name', v_before.name,
      'kind', v_before.kind,
      'sortOrder', v_before.sort_order,
      'version', v_before.version
    ),
    jsonb_build_object(
      'name', v_after.name,
      'kind', v_after.kind,
      'sortOrder', v_after.sort_order,
      'version', v_after.version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', v_after.edition_id,
    'showId', v_after.id,
    'stateVersion', v_after.version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$update_show$;

revoke all on function public.studio2_update_show_v3(
  uuid, uuid, text, text, integer, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_update_show_v3(
  uuid, uuid, text, text, integer, bigint, uuid, text, uuid
) to authenticated;

create or replace function public.studio2_update_show_mode_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_phase text,
  p_scheduled_start timestamptz,
  p_youtube_url text,
  p_televote_round_id text,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $update_show_mode$
declare
  v_phase text := lower(btrim(coalesce(p_phase, '')));
  v_youtube_url text := btrim(coalesce(p_youtube_url, ''));
  v_televote_round_id text := nullif(btrim(coalesce(p_televote_round_id, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.shows;
  v_after public.shows;
  v_current_mode jsonb;
  v_next_mode jsonb;
  v_now text := now()::text;
  v_live_started text;
  v_results_started text;
  v_ended_at text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or v_phase not in ('scheduled', 'live', 'results_in_progress', 'ended')
     or char_length(v_youtube_url) > 500
     or (v_youtube_url <> '' and v_youtube_url !~* '^https://((([a-z0-9-]+\.)*youtube\.com)|youtu\.be)(/|$)')
     or char_length(coalesce(v_televote_round_id, '')) > 200
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.mode.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'phase', v_phase,
      'scheduledStart', p_scheduled_start,
      'youtubeUrl', v_youtube_url,
      'televoteRoundId', v_televote_round_id,
      'expectedVersion', p_expected_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select show_row.*
  into v_before
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for update;

  if v_before.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_before.version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  v_current_mode := case
    when jsonb_typeof(v_before.broadcast_config -> 'showMode') = 'object'
      then v_before.broadcast_config -> 'showMode'
    else '{}'::jsonb
  end;

  if v_phase = 'scheduled' then
    v_live_started := null;
    v_results_started := null;
    v_ended_at := null;
  elsif v_phase = 'live' then
    v_live_started := coalesce(nullif(v_current_mode ->> 'liveStartedAt', ''), v_now);
    v_results_started := null;
    v_ended_at := null;
  elsif v_phase = 'results_in_progress' then
    v_live_started := coalesce(nullif(v_current_mode ->> 'liveStartedAt', ''), v_now);
    v_results_started := coalesce(nullif(v_current_mode ->> 'resultsStartedAt', ''), v_now);
    v_ended_at := null;
  else
    v_live_started := coalesce(nullif(v_current_mode ->> 'liveStartedAt', ''), v_now);
    v_results_started := nullif(v_current_mode ->> 'resultsStartedAt', '');
    v_ended_at := coalesce(nullif(v_current_mode ->> 'endedAt', ''), v_now);
  end if;

  v_next_mode := jsonb_build_object(
    'phase', v_phase,
    'scheduledStart', p_scheduled_start,
    'youtubeUrl', v_youtube_url,
    'televoteRoundId', v_televote_round_id,
    'liveStartedAt', v_live_started,
    'resultsStartedAt', v_results_started,
    'endedAt', v_ended_at
  );

  update public.shows
  set broadcast_config = jsonb_set(
    coalesce(broadcast_config, '{}'::jsonb),
    '{showMode}',
    v_next_mode,
    true
  )
  where id = p_show_id
    and edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_after;

  if v_after.id is null then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'show_mode_updated',
    'shows',
    v_after.id::text,
    v_after.edition_id,
    jsonb_build_object(
      'showMode', v_current_mode,
      'version', v_before.version
    ),
    jsonb_build_object(
      'showMode', v_next_mode,
      'version', v_after.version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', v_after.edition_id,
    'showId', v_after.id,
    'showMode', v_next_mode,
    'stateVersion', v_after.version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$update_show_mode$;

revoke all on function public.studio2_update_show_mode_v3(
  uuid, uuid, text, timestamptz, text, text, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_update_show_mode_v3(
  uuid, uuid, text, timestamptz, text, text, bigint, uuid, text, uuid
) to authenticated;

create or replace function public.studio2_delete_show_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $delete_show$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.shows;
  v_preflight jsonb;
  v_auth_evidence jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or p_expected_version is null or p_expected_version < 1
     or v_reason is null or char_length(v_reason) < 4 or char_length(v_reason) > 500
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Claim before mutable-state validation. A retry after a successful deletion
  -- can therefore replay the receipt even though the show row no longer exists.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.delete',
    'R3',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'expectedVersion', p_expected_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Permanent deletion is R3. Fresh authentication is required only for a new
  -- commit, not for harmless reconciliation of an already-completed command.
  v_auth_evidence := private.studio2_require_fresh_auth(300);

  select show_row.*
  into v_before
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for update;

  if v_before.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_before.version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  -- Recompute dependency/publication state while the canonical show row is
  -- locked. The preview is evidence, never permission to commit later.
  v_preflight := private.studio2_show_delete_preflight(p_edition_id, p_show_id);
  if coalesce((v_preflight #>> '{delete,allowed}')::boolean, false) is not true then
    raise sqlstate 'PT409' using
      message = 'STATE_CHANGED',
      detail = (v_preflight -> 'delete')::text,
      hint = 'Refresh the show lifecycle preview; permanent deletion is blocked by current canonical state.';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'show_deleted',
    'shows',
    v_before.id::text,
    v_before.edition_id,
    jsonb_build_object(
      'id', v_before.id,
      'name', v_before.name,
      'kind', v_before.kind,
      'sortOrder', v_before.sort_order,
      'status', v_before.status,
      'version', v_before.version,
      'reason', v_reason,
      'dependencies', v_preflight -> 'dependencies',
      'auth', v_auth_evidence - 'sessionId'
    ),
    null
  );

  delete from public.shows
  where id = p_show_id
    and edition_id = p_edition_id
    and version = p_expected_version;

  if not found then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'deleted', true,
    'stateVersion', p_expected_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$delete_show$;

revoke all on function public.studio2_delete_show_v3(
  uuid, uuid, bigint, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_delete_show_v3(
  uuid, uuid, bigint, text, uuid, text, uuid
) to authenticated;

comment on function public.studio2_show_lifecycle_preview(uuid, uuid) is
  'V3 exact-edition show preflight with canonical version, publication state and FK-derived destructive dependency snapshot.';
comment on function public.studio2_create_show_v3(uuid, text, text, integer, jsonb, uuid, text, uuid) is
  'V3 R2 show creation command with server-derived actor, semantic idempotency, receipt and audit evidence.';
comment on function public.studio2_update_show_v3(uuid, uuid, text, text, integer, bigint, uuid, text, uuid) is
  'V3 R2 show identity/order command with exact-edition optimistic concurrency and replay-safe receipt.';
comment on function public.studio2_update_show_mode_v3(uuid, uuid, text, timestamptz, text, text, bigint, uuid, text, uuid) is
  'V3 R2 Show Mode command. Server derives lifecycle timestamps and commits under exact show version.';
comment on function public.studio2_delete_show_v3(uuid, uuid, bigint, text, uuid, text, uuid) is
  'V3 R3 permanent show deletion command with fresh authentication, commit-time dependency preflight, CAS, audit and replay-safe receipt.';

notify pgrst, 'reload schema';

commit;
