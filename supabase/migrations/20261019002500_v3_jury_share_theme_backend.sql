begin;

-- System V3 / Jury Share Cards (JSC-7): versioned Edition share themes.
-- This is deliberately NOT another general theme system. It stores only the
-- bounded composition recipe needed to render the Edition jury-share design.
-- Default and Liquid Glass remain Solaris-owned renderer themes.

insert into public.studio2_capabilities (
  key, domain, label, description, access_level
) values
  (
    'edition.share_theme.view',
    'edition',
    'View edition share graphics',
    'View versioned Edition jury-share theme configuration and validation.',
    'read'
  ),
  (
    'edition.share_theme.manage',
    'edition',
    'Manage edition share graphics',
    'Create, validate, activate and archive versioned Edition jury-share themes.',
    'operate'
  )
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('superadmin', 'edition.share_theme.view'),
  ('superadmin', 'edition.share_theme.manage'),
  ('organizer', 'edition.share_theme.view'),
  ('organizer', 'edition.share_theme.manage')
on conflict do nothing;

create table if not exists public.edition_jury_share_themes (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  version integer not null check (version >= 1),
  state text not null default 'draft'
    check (state in ('draft', 'ready', 'archived', 'invalid')),
  composition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(composition) = 'object')
    check (pg_column_size(composition) <= 65536),
  validation jsonb not null default jsonb_build_object(
    'valid', false,
    'errors', jsonb_build_array(),
    'warnings', jsonb_build_array()
  ) check (jsonb_typeof(validation) = 'object')
    check (pg_column_size(validation) <= 16384),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, version),
  constraint edition_jury_share_themes_state_time_check check (
    (state = 'ready' and activated_at is not null and archived_at is null)
    or (state = 'archived' and activated_at is not null and archived_at is not null)
    or (state in ('draft', 'invalid') and activated_at is null and archived_at is null)
  )
);

create unique index if not exists edition_jury_share_themes_one_ready_idx
  on public.edition_jury_share_themes (edition_id)
  where state = 'ready';
create index if not exists edition_jury_share_themes_edition_version_idx
  on public.edition_jury_share_themes (edition_id, version desc);

alter table public.edition_jury_share_themes enable row level security;
revoke all on table public.edition_jury_share_themes from public, anon, authenticated;
grant select, insert, update on table public.edition_jury_share_themes to service_role;

comment on table public.edition_jury_share_themes is
  'Versioned, bounded Edition composition recipes for Jury Share Cards. Browser writes are RPC-only; archived rows are immutable.';

create or replace function private.v3_validate_jury_share_edition_theme(
  p_edition_id uuid,
  p_composition jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $validate$
declare
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_key text;
  v_safe jsonb;
  v_artwork jsonb;
  v_edition public.editions%rowtype;
begin
  select edition.* into v_edition
  from public.editions edition
  where edition.id = p_edition_id;
  if not found then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'EDITION_NOT_FOUND')),
      'warnings', v_warnings
    );
  end if;

  if p_composition is null or jsonb_typeof(p_composition) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'COMPOSITION_NOT_OBJECT')),
      'warnings', v_warnings
    );
  end if;

  if pg_column_size(p_composition) > 65536 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'COMPOSITION_TOO_LARGE'));
  end if;

  for v_key in select jsonb_object_keys(p_composition)
  loop
    if v_key not in (
      'artwork', 'scoreboard', 'header', 'background', 'footer',
      'decorativeAssets', 'safeArea'
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_TOP_LEVEL_KEY',
        'key', v_key
      ));
    end if;
  end loop;

  if lower(p_composition::text) ~ '(https?://|javascript:|<script|customcss|customhtml|customjavascript)' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'UNSAFE_OR_ARBITRARY_CONTENT'
    ));
  end if;

  foreach v_key in array array['scoreboard','header','background','footer','safeArea']
  loop
    if jsonb_typeof(p_composition -> v_key) is distinct from 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'REQUIRED_OBJECT_MISSING',
        'key', v_key
      ));
    end if;
  end loop;

  if p_composition ? 'decorativeAssets' then
    if jsonb_typeof(p_composition -> 'decorativeAssets') <> 'array' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'DECORATIVE_ASSETS_NOT_ARRAY'
      ));
    elsif jsonb_array_length(p_composition -> 'decorativeAssets') > 32 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'TOO_MANY_DECORATIVE_ASSETS'
      ));
    end if;
  end if;

  if p_composition ? 'artwork' then
    v_artwork := p_composition -> 'artwork';
    if jsonb_typeof(v_artwork) not in ('object', 'null') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_NOT_OBJECT'));
    elsif jsonb_typeof(v_artwork) = 'object' then
      if nullif(btrim(coalesce(v_artwork ->> 'assetId', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_ASSET_REQUIRED'));
      elsif v_edition.artwork_storage_path is null
         or v_artwork ->> 'assetId' is distinct from v_edition.artwork_storage_path then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'ARTWORK_ASSET_NOT_EDITION_OWNED'
        ));
      end if;
    end if;
  end if;

  v_safe := p_composition -> 'safeArea';
  if jsonb_typeof(v_safe) = 'object' then
    foreach v_key in array array['top','right','bottom','left']
    loop
      if jsonb_typeof(v_safe -> v_key) <> 'number' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'SAFE_AREA_VALUE_INVALID',
          'key', v_key
        ));
      end if;
    end loop;

    if jsonb_typeof(v_safe -> 'top') = 'number'
       and jsonb_typeof(v_safe -> 'bottom') = 'number'
       and (
         (v_safe ->> 'top')::numeric < 0
         or (v_safe ->> 'bottom')::numeric < 0
         or (v_safe ->> 'top')::numeric + (v_safe ->> 'bottom')::numeric >= 1920
       ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SAFE_AREA_VERTICAL_INVALID'));
    end if;

    if jsonb_typeof(v_safe -> 'left') = 'number'
       and jsonb_typeof(v_safe -> 'right') = 'number'
       and (
         (v_safe ->> 'left')::numeric < 0
         or (v_safe ->> 'right')::numeric < 0
         or (v_safe ->> 'left')::numeric + (v_safe ->> 'right')::numeric >= 1080
       ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SAFE_AREA_HORIZONTAL_INVALID'));
    end if;
  end if;

  if v_edition.artwork_storage_path is null and coalesce(jsonb_typeof(v_artwork), 'null') = 'null' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('code', 'EDITION_ARTWORK_NOT_CONFIGURED'));
  end if;

  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings
  );
end
$validate$;

revoke all on function private.v3_validate_jury_share_edition_theme(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.v3_validate_jury_share_edition_theme(uuid, jsonb)
  to service_role;

create or replace function private.v3_guard_archived_jury_share_theme()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if tg_op = 'DELETE' and old.state = 'archived' then
    raise exception 'Archived Jury Share theme versions are immutable'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.state = 'archived' then
    raise exception 'Archived Jury Share theme versions are immutable'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_jury_share_theme()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_jury_share_theme
  on public.edition_jury_share_themes;
create trigger v3_guard_archived_jury_share_theme
before update or delete on public.edition_jury_share_themes
for each row execute function private.v3_guard_archived_jury_share_theme();

create or replace function public.studio2_jury_share_theme_snapshot(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_service boolean := private.studio2_request_is_service_role();
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if not v_service
     and not public.studio2_access_allowed('edition.share_theme.view', p_edition_id, false)
     and not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', theme.id,
    'editionId', theme.edition_id,
    'version', theme.version,
    'state', theme.state,
    'composition', theme.composition,
    'validation', theme.validation,
    'activatedAt', theme.activated_at,
    'archivedAt', theme.archived_at,
    'updatedAt', theme.updated_at
  ) order by theme.version desc), '[]'::jsonb)
  into v_rows
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'themes', v_rows,
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function public.studio2_jury_share_theme_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_jury_share_theme_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_save_jury_share_theme_draft(
  p_edition_id uuid,
  p_composition jsonb,
  p_expected_version integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $save$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_current public.edition_jury_share_themes%rowtype;
  v_saved public.edition_jury_share_themes%rowtype;
  v_validation jsonb;
  v_runtime_state text;
  v_result jsonb;
begin
  if p_edition_id is null or p_composition is null
     or jsonb_typeof(p_composition) <> 'object'
     or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'edition.share_theme.save_draft',
    'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'expectedVersion', p_expected_version,
      'composition', p_composition
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select runtime.state into v_runtime_state
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id;
  if v_runtime_state = 'archived' then
    raise exception using errcode = '25006', message = 'STATE_CHANGED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jury-share-theme:' || p_edition_id::text, 0));

  select theme.* into v_current
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
  order by theme.version desc
  limit 1
  for update;

  if coalesce(v_current.version, 0) is distinct from p_expected_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_validation := private.v3_validate_jury_share_edition_theme(p_edition_id, p_composition);

  if v_current.id is null then
    insert into public.edition_jury_share_themes (
      edition_id, version, state, composition, validation, created_by, updated_by
    ) values (
      p_edition_id, 1, 'draft', p_composition, v_validation, auth.uid(), auth.uid()
    ) returning * into v_saved;
  elsif v_current.state in ('draft', 'invalid') then
    update public.edition_jury_share_themes
    set composition = p_composition,
        validation = v_validation,
        state = 'draft',
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_current.id
    returning * into v_saved;
  else
    insert into public.edition_jury_share_themes (
      edition_id, version, state, composition, validation, created_by, updated_by
    ) values (
      p_edition_id, v_current.version + 1, 'draft', p_composition, v_validation,
      auth.uid(), auth.uid()
    ) returning * into v_saved;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'themeId', v_saved.id,
    'version', v_saved.version,
    'state', v_saved.state,
    'validation', v_saved.validation,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$save$;

revoke all on function public.studio2_save_jury_share_theme_draft(
  uuid, jsonb, integer, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_save_jury_share_theme_draft(
  uuid, jsonb, integer, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_set_jury_share_theme_state(
  p_edition_id uuid,
  p_version integer,
  p_target_state text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $transition$
declare
  v_target text := lower(btrim(coalesce(p_target_state, '')));
  v_claim jsonb;
  v_operation_id uuid;
  v_theme public.edition_jury_share_themes%rowtype;
  v_runtime_state text;
  v_validation jsonb;
  v_result jsonb;
begin
  if p_edition_id is null or p_version is null or p_version < 1
     or v_target not in ('ready', 'archived') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'edition.share_theme.' || v_target,
    'R2',
    jsonb_build_object('editionId', p_edition_id, 'themeVersion', p_version),
    jsonb_build_object('targetState', v_target, 'expectedVersion', p_version)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('jury-share-theme:' || p_edition_id::text, 0));

  select runtime.state into v_runtime_state
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
    and theme.version = p_version
  for update;
  if not found then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  if p_version is distinct from (
    select max(theme.version)
    from public.edition_jury_share_themes theme
    where theme.edition_id = p_edition_id
  ) then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  if v_target = 'ready' then
    if v_runtime_state = 'archived' or v_theme.state not in ('draft', 'invalid') then
      raise exception using errcode = '25006', message = 'STATE_CHANGED';
    end if;
    v_validation := private.v3_validate_jury_share_edition_theme(p_edition_id, v_theme.composition);
    if not coalesce((v_validation ->> 'valid')::boolean, false) then
      update public.edition_jury_share_themes
      set state = 'invalid',
          validation = v_validation,
          updated_by = auth.uid(),
          updated_at = now()
      where id = v_theme.id;
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update public.edition_jury_share_themes
    set state = 'archived',
        archived_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
    where edition_id = p_edition_id
      and state = 'ready'
      and id <> v_theme.id;

    update public.edition_jury_share_themes
    set state = 'ready',
        validation = v_validation,
        activated_at = now(),
        archived_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_theme.id
    returning * into v_theme;
  else
    if v_runtime_state is distinct from 'archived' or v_theme.state <> 'ready' then
      raise exception using errcode = '25006', message = 'STATE_CHANGED';
    end if;
    update public.edition_jury_share_themes
    set state = 'archived',
        archived_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_theme.id
    returning * into v_theme;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'themeId', v_theme.id,
    'version', v_theme.version,
    'state', v_theme.state,
    'validation', v_theme.validation,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$transition$;

revoke all on function public.studio2_set_jury_share_theme_state(
  uuid, integer, text, uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_set_jury_share_theme_state(
  uuid, integer, text, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.v3_jury_share_edition_theme(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $public_theme$
declare
  v_edition_id uuid;
  v_theme public.edition_jury_share_themes%rowtype;
begin
  if p_show_id is null then
    raise exception 'Show id is required' using errcode = '22023';
  end if;

  select show_row.edition_id into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not private.studio2_request_is_service_role()
     and not (
       public.show_publication_enabled(p_show_id, 'results')
       and public.show_publication_enabled(p_show_id, 'jury_results')
     ) then
    return jsonb_build_object(
      'available', false,
      'state', 'unconfigured',
      'serverTime', now()
    );
  end if;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.edition_id = v_edition_id
    and theme.state in ('ready', 'archived')
    and coalesce((theme.validation ->> 'valid')::boolean, false)
  order by theme.version desc
  limit 1;

  if v_theme.id is null then
    return jsonb_build_object(
      'available', false,
      'state', 'unconfigured',
      'serverTime', now()
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'themeId', 'edition',
    'editionId', v_edition_id,
    'version', v_theme.version,
    'state', v_theme.state,
    'composition', v_theme.composition,
    'serverTime', now()
  );
end
$public_theme$;

revoke all on function public.v3_jury_share_edition_theme(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_edition_theme(uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
