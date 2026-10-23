begin;

-- System V3 / Jury Share Cards (Edition theme authority).
--
-- Generic public.themes remain reusable application themes. They are not a
-- substitute for an immutable edition-scoped export recipe: historical share
-- graphics need the exact edition version that was approved at the time.
select public.v3_register_migration_contract(
  'v3.results.jury-share-edition-theme-authority-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Add versioned edition-scoped Jury Share theme recipes, server-side validation state, idempotent Organizer commands and historical theme selection without duplicating generic theme or Jury truth.'
);

create table private.v3_edition_jury_share_themes (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete restrict,
  version integer not null check (version >= 1),
  revision bigint not null default 1 check (revision >= 1),
  state text not null default 'draft'
    check (state in ('draft', 'ready', 'archived', 'invalid')),
  composition_json jsonb not null
    check (
      jsonb_typeof(composition_json) = 'object'
      and pg_column_size(composition_json) <= 131072
    ),
  composition_hash text not null
    check (composition_hash ~ '^[0-9a-f]{64}$'),
  validation_state text not null default 'unvalidated'
    check (validation_state in ('unvalidated', 'valid', 'invalid')),
  validation_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  archived_at timestamptz,
  invalidated_at timestamptz,
  invalid_reason text,
  unique (edition_id, version),
  constraint v3_edition_jury_share_theme_validation_result_check
    check (
      validation_result is null
      or (
        jsonb_typeof(validation_result) = 'object'
        and pg_column_size(validation_result) <= 32768
      )
    ),
  constraint v3_edition_jury_share_theme_invalid_reason_check
    check (
      (state = 'invalid' and nullif(btrim(coalesce(invalid_reason, '')), '') is not null)
      or (state <> 'invalid' and invalid_reason is null)
    )
);

create unique index v3_edition_jury_share_theme_one_ready_uidx
  on private.v3_edition_jury_share_themes (edition_id)
  where state = 'ready';

create index v3_edition_jury_share_theme_lookup_idx
  on private.v3_edition_jury_share_themes (edition_id, state, version desc);

alter table private.v3_edition_jury_share_themes enable row level security;
revoke all on table private.v3_edition_jury_share_themes
  from public, anon, authenticated;
grant select, insert, update on table private.v3_edition_jury_share_themes
  to service_role;

comment on table private.v3_edition_jury_share_themes is
  'Versioned immutable-after-activation Edition recipes for Jury Share exports. Generic public.themes remains separate reusable app styling authority.';

create or replace function private.v3_jury_share_theme_composition_hash(
  p_composition jsonb
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, extensions
as $hash$
  select encode(
    extensions.digest(
      convert_to(coalesce(p_composition, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$hash$;

revoke all on function private.v3_jury_share_theme_composition_hash(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_guard_jury_share_theme_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $guard$
begin
  if jsonb_typeof(new.composition_json) <> 'object'
     or pg_column_size(new.composition_json) > 131072 then
    raise exception 'Jury Share Edition composition must be a bounded object'
      using errcode = '22023';
  end if;

  new.composition_hash := private.v3_jury_share_theme_composition_hash(
    new.composition_json
  );

  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.revision <> 1 then
      raise exception 'New Jury Share Edition themes must start as draft revision 1'
        using errcode = '23514';
    end if;
    new.validation_state := 'unvalidated';
    new.validation_result := null;
    new.activated_at := null;
    new.archived_at := null;
    new.invalidated_at := null;
    new.invalid_reason := null;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.edition_id is distinct from old.edition_id
     or new.version is distinct from old.version
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Jury Share Edition theme identity is immutable'
      using errcode = '55000';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Jury Share Edition theme revision must advance exactly once'
      using errcode = '23514';
  end if;

  if old.state <> 'draft'
     and new.composition_json is distinct from old.composition_json then
    raise exception 'Activated Jury Share Edition composition is immutable'
      using errcode = '55000';
  end if;

  if old.state = 'draft' and new.state not in ('draft', 'ready', 'invalid') then
    raise exception 'Invalid Jury Share Edition draft transition'
      using errcode = '23514';
  elsif old.state = 'ready' and new.state not in ('ready', 'archived', 'invalid') then
    raise exception 'Invalid Jury Share Edition ready transition'
      using errcode = '23514';
  elsif old.state = 'archived' and new.state <> 'archived' then
    raise exception 'Archived Jury Share Edition themes are terminal'
      using errcode = '55000';
  elsif old.state = 'invalid' and new.state <> 'invalid' then
    raise exception 'Invalid Jury Share Edition themes are terminal; create a new version'
      using errcode = '55000';
  end if;

  if old.state = 'draft'
     and new.state = 'draft'
     and new.composition_json is distinct from old.composition_json then
    new.validation_state := 'unvalidated';
    new.validation_result := null;
  end if;

  if new.state = 'ready' then
    if new.validation_state <> 'valid' then
      raise exception 'Jury Share Edition theme must pass server validation before activation'
        using errcode = '23514';
    end if;
    new.activated_at := coalesce(old.activated_at, now());
    new.archived_at := null;
    new.invalidated_at := null;
    new.invalid_reason := null;
  elsif new.state = 'archived' then
    if old.activated_at is null then
      raise exception 'Only an activated Jury Share Edition theme can be archived'
        using errcode = '23514';
    end if;
    new.activated_at := old.activated_at;
    new.archived_at := coalesce(old.archived_at, now());
    new.invalidated_at := null;
    new.invalid_reason := null;
  elsif new.state = 'invalid' then
    if nullif(btrim(coalesce(new.invalid_reason, '')), '') is null then
      raise exception 'Invalid Jury Share Edition theme requires a reason'
        using errcode = '22023';
    end if;
    new.invalidated_at := coalesce(old.invalidated_at, now());
    new.archived_at := old.archived_at;
    new.activated_at := old.activated_at;
  else
    new.activated_at := old.activated_at;
    new.archived_at := old.archived_at;
    new.invalidated_at := old.invalidated_at;
    new.invalid_reason := old.invalid_reason;
  end if;

  new.updated_at := now();
  return new;
end
$guard$;

revoke all on function private.v3_guard_jury_share_theme_revision()
  from public, anon, authenticated;

create trigger v3_guard_jury_share_theme_revision
before insert or update on private.v3_edition_jury_share_themes
for each row execute function private.v3_guard_jury_share_theme_revision();

create or replace function private.v3_jury_share_edition_theme_selection(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $selection$
declare
  v_edition public.editions%rowtype;
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_historical boolean;
begin
  select edition.* into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    return jsonb_build_object(
      'state', 'unconfigured',
      'reason', 'edition_not_found'
    );
  end if;

  v_historical := v_edition.status in ('completed', 'archived');

  if v_historical then
    select theme.* into v_theme
    from private.v3_edition_jury_share_themes theme
    where theme.edition_id = p_edition_id
      and theme.state = 'archived'
    order by theme.version desc
    limit 1;
  else
    select theme.* into v_theme
    from private.v3_edition_jury_share_themes theme
    where theme.edition_id = p_edition_id
      and theme.state = 'ready'
    order by theme.version desc
    limit 1;
  end if;

  if v_theme.id is null then
    return jsonb_build_object(
      'state', 'unconfigured',
      'reason', case
        when v_historical then 'historical_edition_theme_not_archived'
        else 'edition_theme_not_ready'
      end
    );
  end if;

  return jsonb_build_object(
    'state', 'available',
    'themeId', v_theme.id,
    'themeVersion', v_theme.version,
    'revision', v_theme.revision,
    'compositionHash', v_theme.composition_hash,
    'historical', v_historical,
    'activatedAt', v_theme.activated_at,
    'archivedAt', v_theme.archived_at
  );
end
$selection$;

revoke all on function private.v3_jury_share_edition_theme_selection(uuid)
  from public, anon, authenticated;

create or replace function private.v3_jury_share_theme_availability(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $availability$
  select jsonb_build_array(
    jsonb_build_object('id', 'default', 'state', 'available'),
    jsonb_build_object('id', 'edition')
      || private.v3_jury_share_edition_theme_selection(p_edition_id),
    jsonb_build_object(
      'id', 'liquid_glass',
      'state', 'unsupported',
      'reason', 'Liquid Glass renderer unavailable'
    )
  )
$availability$;

revoke all on function private.v3_jury_share_theme_availability(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_jury_share_theme_state(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $state$
declare
  v_rows jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;

  if not private.studio2_request_is_service_role()
     and not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.manage'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', theme.id,
      'version', theme.version,
      'revision', theme.revision,
      'state', theme.state,
      'composition', theme.composition_json,
      'compositionHash', theme.composition_hash,
      'validationState', theme.validation_state,
      'validationResult', theme.validation_result,
      'createdAt', theme.created_at,
      'updatedAt', theme.updated_at,
      'activatedAt', theme.activated_at,
      'archivedAt', theme.archived_at,
      'invalidatedAt', theme.invalidated_at,
      'invalidReason', theme.invalid_reason
    ) order by theme.version desc
  ), '[]'::jsonb)
  into v_rows
  from private.v3_edition_jury_share_themes theme
  where theme.edition_id = p_edition_id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'selection', private.v3_jury_share_edition_theme_selection(p_edition_id),
    'themes', v_rows,
    'serverTime', now()
  );
end
$state$;

revoke all on function public.studio2_jury_share_theme_state(uuid)
  from public, anon;
grant execute on function public.studio2_jury_share_theme_state(uuid)
  to authenticated, service_role;

create or replace function public.studio2_save_jury_share_theme_draft(
  p_edition_id uuid,
  p_theme_id uuid,
  p_composition jsonb,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_before private.v3_edition_jury_share_themes%rowtype;
  v_next_version integer;
  v_hash text;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.manage'
      using errcode = '42501';
  end if;
  if p_edition_id is null
     or jsonb_typeof(p_composition) <> 'object'
     or pg_column_size(p_composition) > 131072
     or p_expected_revision is null
     or p_expected_revision < 0 then
    raise exception 'Invalid Jury Share Edition theme draft request'
      using errcode = '22023';
  end if;

  v_hash := private.v3_jury_share_theme_composition_hash(p_composition);
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.save_draft',
    'R1',
    jsonb_build_object('editionId', p_edition_id, 'themeId', p_theme_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'compositionHash', v_hash
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform 1 from public.editions edition
  where edition.id = p_edition_id
  for update;
  if not found then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  if p_theme_id is null then
    if p_expected_revision <> 0 then
      raise exception 'New Jury Share Edition theme expects revision 0'
        using errcode = '40001';
    end if;

    select coalesce(max(theme.version), 0) + 1
    into v_next_version
    from private.v3_edition_jury_share_themes theme
    where theme.edition_id = p_edition_id;

    insert into private.v3_edition_jury_share_themes (
      edition_id,
      version,
      revision,
      state,
      composition_json,
      composition_hash,
      created_by
    ) values (
      p_edition_id,
      v_next_version,
      1,
      'draft',
      p_composition,
      v_hash,
      auth.uid()
    )
    returning * into v_theme;
  else
    select theme.* into v_before
    from private.v3_edition_jury_share_themes theme
    where theme.id = p_theme_id
      and theme.edition_id = p_edition_id
    for update;

    if v_before.id is null then
      raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
    end if;
    if v_before.state <> 'draft' then
      raise exception 'Only draft Jury Share Edition themes can be edited'
        using errcode = '23514';
    end if;
    if v_before.revision <> p_expected_revision then
      raise exception 'VERSION_CONFLICT' using errcode = '40001';
    end if;

    update private.v3_edition_jury_share_themes
    set
      composition_json = p_composition,
      revision = revision + 1,
      validation_state = case
        when composition_hash = v_hash then validation_state
        else 'unvalidated'
      end,
      validation_result = case
        when composition_hash = v_hash then validation_result
        else null
      end
    where id = p_theme_id
    returning * into v_theme;
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
    'jury_share_theme_draft_saved',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    p_edition_id,
    case when v_before.id is null then null else jsonb_build_object(
      'revision', v_before.revision,
      'state', v_before.state,
      'compositionHash', v_before.composition_hash,
      'validationState', v_before.validation_state
    ) end,
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'validationState', v_theme.validation_state
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'validationState', v_theme.validation_state
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$save$;

revoke all on function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, uuid
) to authenticated;

-- Validation may depend on fonts/assets and therefore belongs to trusted
-- server rendering infrastructure, not a browser checkbox that can declare its
-- own theme valid. This RPC intentionally accepts service-role context only.
create or replace function public.v3_set_jury_share_theme_validation(
  p_theme_id uuid,
  p_expected_revision bigint,
  p_valid boolean,
  p_validation_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $validation$
declare
  v_theme private.v3_edition_jury_share_themes%rowtype;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required for Jury Share theme validation'
      using errcode = '42501';
  end if;
  if p_theme_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or jsonb_typeof(coalesce(p_validation_result, '{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(p_validation_result, '{}'::jsonb)) > 32768 then
    raise exception 'Invalid Jury Share theme validation request'
      using errcode = '22023';
  end if;

  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id
  for update;

  if v_theme.id is null then
    raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
  end if;
  if v_theme.state <> 'draft' then
    raise exception 'Only draft Jury Share Edition themes can be validated'
      using errcode = '23514';
  end if;
  if v_theme.revision <> p_expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;

  update private.v3_edition_jury_share_themes
  set
    revision = revision + 1,
    validation_state = case when p_valid then 'valid' else 'invalid' end,
    validation_result = coalesce(p_validation_result, '{}'::jsonb)
  where id = p_theme_id
  returning * into v_theme;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, after_data
  ) values (
    null,
    'jury_share_theme_validation_recorded',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    v_theme.edition_id,
    jsonb_build_object(
      'version', v_theme.version,
      'revision', v_theme.revision,
      'compositionHash', v_theme.composition_hash,
      'validationState', v_theme.validation_state
    )
  );

  return jsonb_build_object(
    'ok', true,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'compositionHash', v_theme.composition_hash,
    'validationState', v_theme.validation_state
  );
end
$validation$;

revoke all on function public.v3_set_jury_share_theme_validation(
  uuid, bigint, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.v3_set_jury_share_theme_validation(
  uuid, bigint, boolean, jsonb
) to service_role;

create or replace function public.studio2_activate_jury_share_theme(
  p_theme_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $activate$
declare
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_previous private.v3_edition_jury_share_themes%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id;

  if v_theme.id is null then
    raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('edition.manage', v_theme.edition_id, false) then
    raise exception 'Missing Solaris capability: edition.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.activate',
    'R2',
    jsonb_build_object('editionId', v_theme.edition_id, 'themeId', p_theme_id),
    jsonb_build_object('expectedRevision', p_expected_revision)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform 1 from public.editions edition
  where edition.id = v_theme.edition_id
  for update;

  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id
  for update;

  if v_theme.state <> 'draft' then
    raise exception 'Only draft Jury Share Edition themes can be activated'
      using errcode = '23514';
  end if;
  if v_theme.revision <> p_expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  if v_theme.validation_state <> 'valid' then
    raise exception 'Jury Share Edition theme has not passed server validation'
      using errcode = '23514';
  end if;

  select theme.* into v_previous
  from private.v3_edition_jury_share_themes theme
  where theme.edition_id = v_theme.edition_id
    and theme.state = 'ready'
    and theme.id <> p_theme_id
  for update;

  if v_previous.id is not null then
    update private.v3_edition_jury_share_themes
    set state = 'archived', revision = revision + 1
    where id = v_previous.id;
  end if;

  update private.v3_edition_jury_share_themes
  set state = 'ready', revision = revision + 1
  where id = p_theme_id
  returning * into v_theme;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, before_data, after_data
  ) values (
    auth.uid(),
    'jury_share_theme_activated',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    v_theme.edition_id,
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'supersededThemeId', v_previous.id
    ),
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'activatedAt', v_theme.activated_at
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'activatedAt', v_theme.activated_at,
    'supersededThemeId', v_previous.id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$activate$;

revoke all on function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) to authenticated;

create or replace function public.studio2_archive_jury_share_theme(
  p_theme_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $archive$
declare
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_edition_status text;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id;

  if v_theme.id is null then
    raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('edition.manage', v_theme.edition_id, false) then
    raise exception 'Missing Solaris capability: edition.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.archive',
    'R2',
    jsonb_build_object('editionId', v_theme.edition_id, 'themeId', p_theme_id),
    jsonb_build_object('expectedRevision', p_expected_revision)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select edition.status into v_edition_status
  from public.editions edition
  where edition.id = v_theme.edition_id
  for update;

  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id
  for update;

  if v_theme.state <> 'ready' then
    raise exception 'Only the ready Jury Share Edition theme can become historical'
      using errcode = '23514';
  end if;
  if v_theme.revision <> p_expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  if v_edition_status not in ('completed', 'archived') then
    raise exception 'Edition must be completed before its Jury Share theme is archived'
      using errcode = '23514';
  end if;

  update private.v3_edition_jury_share_themes
  set state = 'archived', revision = revision + 1
  where id = p_theme_id
  returning * into v_theme;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, after_data
  ) values (
    auth.uid(),
    'jury_share_theme_archived',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    v_theme.edition_id,
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'archivedAt', v_theme.archived_at
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'archivedAt', v_theme.archived_at
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$archive$;

revoke all on function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) to authenticated;

-- Extend the rollout-gated public projection with real Edition availability.
-- The underlying core still owns canonical ballot/result/publication checks.
create or replace function public.v3_jury_share_projection(
  p_show_id uuid,
  p_voter_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection_gate$
declare
  v_edition_id uuid;
  v_service boolean := private.studio2_request_is_service_role();
  v_result jsonb;
begin
  if p_show_id is null or p_voter_country_id is null then
    raise exception 'Jury share projection requires show and voter country identity'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not v_service
     and not private.studio2_feature_enabled_for(
       auth.uid(),
       'jury_share_cards_v1',
       v_edition_id
     ) then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_FEATURE_DISABLED',
      'serverTime', now()
    );
  end if;

  v_result := private.v3_jury_share_projection_core(
    p_show_id,
    p_voter_country_id
  );

  if coalesce((v_result ->> 'ok')::boolean, false)
     and jsonb_typeof(v_result -> 'projection') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{projection,themes}',
      private.v3_jury_share_theme_availability(v_edition_id),
      true
    );
  end if;

  return v_result;
end
$projection_gate$;

revoke all on function public.v3_jury_share_projection(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_projection(uuid, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
