begin;

-- V3 System / Organizer O6: make show lifecycle mutations server-authoritative.
--
-- The legacy Shows workspace historically wrote public.shows directly from the
-- browser. That is unsafe for a high-fanout aggregate: deleting one show can
-- cascade into participants, ballots, results, predictions and other official
-- records. This migration introduces one governed command boundary with:
--   * exact edition/show scope
--   * optimistic concurrency via a canonical row revision
--   * durable idempotency / operation receipts
--   * dependency-aware destructive preflight
--   * fresh authentication for destructive R3 deletion
--   * a canonical show.changed DomainEvent after committed operations
--
-- Existing readers remain compatible. Direct-write retirement is intentionally
-- a separate cutover step so old clients are not bricked before the Organizer
-- consumer has adopted this authority.

alter table public.shows
  add column if not exists revision bigint;

update public.shows
set revision = 1
where revision is null;

alter table public.shows
  alter column revision set default 1,
  alter column revision set not null;

alter table public.shows
  drop constraint if exists shows_revision_positive;
alter table public.shows
  add constraint shows_revision_positive
  check (revision >= 1) not valid;
alter table public.shows
  validate constraint shows_revision_positive;

create or replace function private.v3_bump_show_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
begin
  -- Callers never own revision. Every row update advances the canonical CAS
  -- token, including legacy writers during the compatibility window.
  new.revision := old.revision + 1;
  return new;
end
$body$;

revoke all on function private.v3_bump_show_revision()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_bump_show_revision on public.shows;
create trigger v3_bump_show_revision
before update on public.shows
for each row
execute function private.v3_bump_show_revision();

-- Discover dependencies from the actual foreign-key graph instead of keeping a
-- hand-maintained list that silently goes stale when another feature references
-- shows. Only relations exposing a show_id column can reference the row this
-- way. The publication-control row is infrastructure created for every show and
-- is reviewed separately below; all other references are destructive blockers.
create or replace function private.v3_show_dependency_snapshot(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_ref record;
  v_count bigint;
  v_total bigint := 0;
  v_tables jsonb := '{}'::jsonb;
begin
  if p_show_id is null then
    return jsonb_build_object('total', 0, 'tables', '{}'::jsonb);
  end if;

  for v_ref in
    select distinct
      ref_namespace.nspname as schema_name,
      ref_table.relname as table_name
    from pg_constraint fk
    join pg_class show_table
      on show_table.oid = fk.confrelid
    join pg_namespace show_namespace
      on show_namespace.oid = show_table.relnamespace
    join pg_class ref_table
      on ref_table.oid = fk.conrelid
    join pg_namespace ref_namespace
      on ref_namespace.oid = ref_table.relnamespace
    join pg_attribute ref_column
      on ref_column.attrelid = ref_table.oid
     and ref_column.attname = 'show_id'
     and not ref_column.attisdropped
    where fk.contype = 'f'
      and show_namespace.nspname = 'public'
      and show_table.relname = 'shows'
      and not (
        ref_namespace.nspname = 'public'
        and ref_table.relname = 'studio2_show_publication_controls'
      )
    order by ref_namespace.nspname, ref_table.relname
  loop
    execute format(
      'select count(*)::bigint from %I.%I where show_id = $1',
      v_ref.schema_name,
      v_ref.table_name
    )
    into v_count
    using p_show_id;

    if v_count > 0 then
      v_tables := v_tables || jsonb_build_object(
        v_ref.schema_name || '.' || v_ref.table_name,
        v_count
      );
      v_total := v_total + v_count;
    end if;
  end loop;

  return jsonb_build_object(
    'total', v_total,
    'tables', v_tables
  );
end
$body$;

revoke all on function private.v3_show_dependency_snapshot(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.v3_show_default_publication_config()
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $body$
  select jsonb_build_object(
    'participants', false,
    'artists', false,
    'songs', false,
    'semi_split', false,
    'running_order', false,
    'qualifiers', false,
    'results', false,
    'jury_results', false,
    'televote_results', false,
    'detailed_voting', false
  )
$body$;

revoke all on function private.v3_show_default_publication_config()
  from public, anon, authenticated, service_role;

create or replace function private.v3_require_show_management(
  p_edition_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $body$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_edition_id is null
     or public.studio2_access_allowed('edition.manage', p_edition_id, true) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return v_actor;
end
$body$;

revoke all on function private.v3_require_show_management(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_show_lifecycle_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text default 'update'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $body$
declare
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_show public.shows%rowtype;
  v_dependencies jsonb;
  v_publication_state text := 'hidden';
  v_publication_scheduled_for timestamptz;
  v_publication_version bigint := 0;
  v_publication_configured boolean := false;
  v_delete_allowed boolean := false;
  v_blockers text[] := array[]::text[];
begin
  perform private.v3_require_show_management(p_edition_id);

  if p_show_id is null or v_action not in ('update', 'show_mode', 'delete') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  v_dependencies := private.v3_show_dependency_snapshot(p_show_id);

  select
    coalesce(control.state, 'hidden'),
    control.scheduled_for,
    coalesce(control.version, 0)
  into
    v_publication_state,
    v_publication_scheduled_for,
    v_publication_version
  from public.studio2_show_publication_controls control
  where control.show_id = p_show_id
    and control.edition_id = p_edition_id;

  v_publication_configured :=
    coalesce(v_show.publication_config, private.v3_show_default_publication_config())
      is distinct from private.v3_show_default_publication_config();

  if v_action = 'delete' then
    if coalesce(v_show.published, false) then
      v_blockers := array_append(v_blockers, 'SHOW_IS_PUBLISHED');
    end if;
    if coalesce(v_publication_state, 'hidden') <> 'hidden'
       or v_publication_scheduled_for is not null then
      v_blockers := array_append(v_blockers, 'PUBLICATION_LIFECYCLE_EXISTS');
    end if;
    if v_publication_configured then
      v_blockers := array_append(v_blockers, 'PUBLICATION_CONFIGURATION_EXISTS');
    end if;
    if coalesce((v_dependencies ->> 'total')::bigint, 0) > 0 then
      v_blockers := array_append(v_blockers, 'DEPENDENT_RECORDS_EXIST');
    end if;
    v_delete_allowed := coalesce(array_length(v_blockers, 1), 0) = 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'stateVersion', v_show.revision,
    'show', jsonb_build_object(
      'id', v_show.id,
      'editionId', v_show.edition_id,
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'published', v_show.published,
      'publicationConfig', v_show.publication_config,
      'broadcastConfig', v_show.broadcast_config,
      'status', v_show.status,
      'revision', v_show.revision,
      'updatedAt', v_show.updated_at
    ),
    'publication', jsonb_build_object(
      'state', coalesce(v_publication_state, 'hidden'),
      'scheduledFor', v_publication_scheduled_for,
      'version', coalesce(v_publication_version, 0),
      'configured', v_publication_configured
    ),
    'dependencies', v_dependencies,
    'deleteAllowed', case when v_action = 'delete' then v_delete_allowed else null end,
    'blockers', to_jsonb(v_blockers),
    'serverTime', now()
  );
end
$body$;

revoke all on function public.studio2_show_lifecycle_preflight(uuid, uuid, text)
  from public, anon;
grant execute on function public.studio2_show_lifecycle_preflight(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_show_lifecycle_change(
  p_edition_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid default null,
  p_expected_revision bigint default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private
as $body$
declare
  v_actor uuid;
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_command text;
  v_risk text;
  v_claim jsonb;
  v_show public.shows%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_dependencies jsonb;
  v_publication_state text := 'hidden';
  v_publication_scheduled_for timestamptz;
  v_publication_configured boolean := false;
  v_name text;
  v_kind text;
  v_sort_order integer;
begin
  v_actor := private.v3_require_show_management(p_edition_id);

  if jsonb_typeof(v_payload) <> 'object'
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_action not in ('create', 'update', 'show_mode', 'delete') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_command := case v_action
    when 'create' then 'show.create'
    when 'update' then 'show.update'
    when 'show_mode' then 'show.mode.update'
    when 'delete' then 'show.delete'
  end;
  v_risk := case when v_action = 'delete' then 'R3' else 'R2' end;

  if v_action = 'delete' then
    perform private.studio2_require_fresh_auth(300);
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end if;

  -- Claim before mutable-state validation. A client that lost the response after
  -- commit can replay the exact semantic request even though the show revision
  -- has already advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    v_risk,
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'expectedRevision', p_expected_revision,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    ))
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return v_claim;
  end if;

  if v_action = 'create' then
    if p_show_id is not null or p_expected_revision is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    v_name := nullif(btrim(coalesce(v_payload ->> 'name', '')), '');
    v_kind := lower(nullif(btrim(coalesce(v_payload ->> 'kind', '')), ''));
    begin
      v_sort_order := nullif(v_payload ->> 'sortOrder', '')::integer;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    if v_name is null
       or char_length(v_name) > 160
       or v_kind not in ('heat', 'semi-final', 'second-chance', 'grand-final', 'special', 'other')
       or v_sort_order is null
       or v_sort_order < 1 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    insert into public.shows (
      edition_id,
      name,
      kind,
      sort_order,
      published,
      publication_config
    ) values (
      p_edition_id,
      v_name,
      v_kind,
      v_sort_order,
      false,
      private.v3_show_default_publication_config()
    )
    returning * into v_show;

  else
    if p_show_id is null or p_expected_revision is null or p_expected_revision < 1 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select show_row.*
    into v_show
    from public.shows show_row
    where show_row.id = p_show_id
      and show_row.edition_id = p_edition_id
    for update;

    if v_show.id is null then
      raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
    end if;

    if v_show.revision is distinct from p_expected_revision then
      raise exception using
        errcode = '40001',
        message = 'STATE_CHANGED',
        detail = jsonb_build_object(
          'expectedRevision', p_expected_revision,
          'currentRevision', v_show.revision
        )::text;
    end if;

    v_before := jsonb_build_object(
      'id', v_show.id,
      'editionId', v_show.edition_id,
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'published', v_show.published,
      'publicationConfig', v_show.publication_config,
      'broadcastConfig', v_show.broadcast_config,
      'status', v_show.status,
      'revision', v_show.revision,
      'updatedAt', v_show.updated_at
    );

    if v_action = 'update' then
      v_name := nullif(btrim(coalesce(v_payload ->> 'name', '')), '');
      v_kind := lower(nullif(btrim(coalesce(v_payload ->> 'kind', '')), ''));
      begin
        v_sort_order := nullif(v_payload ->> 'sortOrder', '')::integer;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end;

      if v_name is null
         or char_length(v_name) > 160
         or v_kind not in ('heat', 'semi-final', 'second-chance', 'grand-final', 'special', 'other')
         or v_sort_order is null
         or v_sort_order < 1 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;

      update public.shows
      set
        name = v_name,
        kind = v_kind,
        sort_order = v_sort_order
      where id = p_show_id
        and edition_id = p_edition_id
        and revision = p_expected_revision
      returning * into v_show;

    elsif v_action = 'show_mode' then
      if jsonb_typeof(v_payload -> 'showMode') <> 'object' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;

      update public.shows
      set broadcast_config = jsonb_set(
        coalesce(broadcast_config, '{}'::jsonb),
        '{showMode}',
        v_payload -> 'showMode',
        true
      )
      where id = p_show_id
        and edition_id = p_edition_id
        and revision = p_expected_revision
      returning * into v_show;

    elsif v_action = 'delete' then
      v_dependencies := private.v3_show_dependency_snapshot(p_show_id);

      select
        coalesce(control.state, 'hidden'),
        control.scheduled_for
      into
        v_publication_state,
        v_publication_scheduled_for
      from public.studio2_show_publication_controls control
      where control.show_id = p_show_id
        and control.edition_id = p_edition_id;

      v_publication_configured :=
        coalesce(v_show.publication_config, private.v3_show_default_publication_config())
          is distinct from private.v3_show_default_publication_config();

      if coalesce(v_show.published, false)
         or coalesce(v_publication_state, 'hidden') <> 'hidden'
         or v_publication_scheduled_for is not null
         or v_publication_configured
         or coalesce((v_dependencies ->> 'total')::bigint, 0) > 0 then
        raise exception using
          errcode = '23503',
          message = 'DEPENDENCY_BLOCKED',
          detail = jsonb_build_object(
            'published', coalesce(v_show.published, false),
            'publicationState', coalesce(v_publication_state, 'hidden'),
            'publicationScheduledFor', v_publication_scheduled_for,
            'publicationConfigured', v_publication_configured,
            'dependencies', v_dependencies
          )::text,
          hint = 'Archive or detach dependent contest data instead of deleting this show.';
      end if;

      delete from public.shows
      where id = p_show_id
        and edition_id = p_edition_id
        and revision = p_expected_revision;

      if not found then
        raise exception using errcode = '40001', message = 'STATE_CHANGED';
      end if;

      -- The row no longer exists, so advance the event/receipt revision
      -- explicitly for the tombstone fact.
      v_show.revision := p_expected_revision + 1;
    end if;

    if v_action <> 'delete' and v_show.id is null then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
  end if;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'action', v_action,
    'editionId', p_edition_id,
    'showId', coalesce(p_show_id, v_show.id),
    'revision', v_show.revision,
    'stateVersion', v_show.revision,
    'serverTime', now(),
    'reason', case when v_action = 'delete' then nullif(btrim(coalesce(p_reason, '')), '') end,
    'before', v_before,
    'show', case
      when v_action = 'delete' then null
      else jsonb_build_object(
        'id', v_show.id,
        'editionId', v_show.edition_id,
        'name', v_show.name,
        'kind', v_show.kind,
        'sortOrder', v_show.sort_order,
        'published', v_show.published,
        'publicationConfig', v_show.publication_config,
        'broadcastConfig', v_show.broadcast_config,
        'status', v_show.status,
        'revision', v_show.revision,
        'updatedAt', v_show.updated_at
      )
    end
  ));

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$body$;

revoke all on function public.studio2_apply_show_lifecycle_change(
  uuid, text, jsonb, uuid, text, uuid, bigint, text
) from public, anon;
grant execute on function public.studio2_apply_show_lifecycle_change(
  uuid, text, jsonb, uuid, text, uuid, bigint, text
) to authenticated, service_role;

-- Bridge the committed operation receipt into the canonical DomainEvent ledger.
-- p_show_id is intentionally null here: show.changed carries the durable show
-- aggregate identity in aggregate_id/payload, while keeping a successful create
-- auditable without making an otherwise-empty draft impossible to delete solely
-- because the event table has an ON DELETE RESTRICT show_id reference.
create or replace function private.v3_emit_show_lifecycle_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_show_id uuid;
  v_edition_id uuid;
  v_revision bigint;
  v_action text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('show.create', 'show.update', 'show.mode.update', 'show.delete') then
    return new;
  end if;

  begin
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_revision := nullif(new.result ->> 'revision', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed show lifecycle operation has invalid event provenance'
      using errcode = '23514';
  end;
  v_action := nullif(new.result ->> 'action', '');

  if v_show_id is null
     or v_edition_id is null
     or v_revision is null
     or v_action is null then
    raise exception 'Completed show lifecycle operation lacks canonical event provenance'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'show.changed',
    'show',
    v_show_id::text,
    v_revision,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'showId', v_show_id,
      'editionId', v_edition_id,
      'action', v_action,
      'revision', v_revision,
      'deleted', v_action = 'delete'
    ),
    1,
    array[]::text[]
  );

  return new;
end
$body$;

revoke all on function private.v3_emit_show_lifecycle_operation_event()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_emit_show_lifecycle_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_show_lifecycle_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_show_lifecycle_operation_event();

notify pgrst, 'reload schema';

commit;
