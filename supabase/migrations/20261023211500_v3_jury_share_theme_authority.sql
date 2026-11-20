begin;

-- System V3 / Jury Share Cards (JSC-7): current-main Edition theme authority.
--
-- This stores only the bounded versioned composition recipe for the optional
-- Edition share-card design. It is not another Jury/result store and it is not
-- a general arbitrary-CSS theme system. Ready activation is intentionally
-- fail-closed until an authoritative renderer has validated the exact saved
-- version + composition fingerprint, including PNG and JPEG export.
select public.v3_register_migration_contract(
  'v3.results.jury-share-edition-theme-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Add versioned Jury Share Edition themes with capability-checked commands, immutable historical state, exact-version CAS, and renderer-bound Ready validation evidence.'
);

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

create or replace function private.v3_jury_share_theme_fingerprint(p_composition jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $fingerprint$
  select encode(
    extensions.digest(
      convert_to(coalesce(p_composition, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$fingerprint$;

revoke all on function private.v3_jury_share_theme_fingerprint(jsonb)
  from public, anon, authenticated;

create table public.edition_jury_share_themes (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete restrict,
  version integer not null check (version >= 1),
  state text not null default 'draft'
    check (state in ('draft', 'ready', 'archived', 'invalid')),
  composition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(composition) = 'object')
    check (pg_column_size(composition) <= 65536),
  composition_fingerprint text not null
    check (composition_fingerprint ~ '^[0-9a-f]{64}$'),
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

create unique index edition_jury_share_themes_one_ready_idx
  on public.edition_jury_share_themes (edition_id)
  where state = 'ready';
create index edition_jury_share_themes_edition_version_idx
  on public.edition_jury_share_themes (edition_id, version desc);

alter table public.edition_jury_share_themes enable row level security;
revoke all on table public.edition_jury_share_themes from public, anon, authenticated;
grant select, insert, update on table public.edition_jury_share_themes to service_role;

comment on table public.edition_jury_share_themes is
  'Versioned bounded Edition composition recipes for Jury Share Cards. Browser writes are RPC-only; Ready/Archived composition is historical truth.';

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
  v_scoreboard jsonb;
  v_background jsonb;
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

      if coalesce(v_artwork ->> 'placement', '') not in (
        'top', 'top_fade', 'background', 'bottom', 'bottom_fade', 'full'
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_PLACEMENT_INVALID'));
      end if;
      if coalesce(v_artwork ->> 'scale', '') not in ('cover', 'contain') then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_SCALE_INVALID'));
      end if;
    end if;
  end if;

  v_scoreboard := p_composition -> 'scoreboard';
  if jsonb_typeof(v_scoreboard) = 'object' then
    if jsonb_typeof(v_scoreboard -> 'rowHeight') <> 'number'
       or (v_scoreboard ->> 'rowHeight')::numeric not between 72 and 128 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ROW_HEIGHT_INVALID'));
    end if;
    if jsonb_typeof(v_scoreboard -> 'rowRadius') <> 'number'
       or (v_scoreboard ->> 'rowRadius')::numeric not between 0 and 72 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ROW_RADIUS_INVALID'));
    end if;
    foreach v_key in array array[
      'standardRowBackground', 'standardRowForeground',
      'twelvePointBackground', 'twelvePointForeground'
    ]
    loop
      if coalesce(v_scoreboard ->> v_key, '') !~ '^#[0-9A-Fa-f]{6}$' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'COLOR_INVALID',
          'key', v_key
        ));
      end if;
    end loop;
  end if;

  v_background := p_composition -> 'background';
  if jsonb_typeof(v_background) = 'object'
     and coalesce(v_background ->> 'baseColor', '') !~ '^#[0-9A-Fa-f]{6}$' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'COLOR_INVALID',
      'key', 'baseColor'
    ));
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

  if v_edition.artwork_storage_path is null
     and coalesce(jsonb_typeof(v_artwork), 'null') = 'null' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'EDITION_ARTWORK_NOT_CONFIGURED'
    ));
  end if;

  -- Typography/glyph fit, exact ten-row layout, contrast and export success are
  -- deliberately NOT guessed in SQL. They are authoritative renderer checks
  -- recorded against the exact version/fingerprint before Ready is permitted.
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

create or replace function private.v3_guard_jury_share_theme_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Jury Share theme versions are not destructively deleted'
      using errcode = '55000';
  end if;

  new.composition_fingerprint := private.v3_jury_share_theme_fingerprint(new.composition);

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.edition_id is distinct from old.edition_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Jury Share theme identity is immutable'
      using errcode = '55000';
  end if;

  if old.state = 'archived' then
    raise exception 'Archived Jury Share theme versions are immutable'
      using errcode = '55000';
  end if;

  if old.state = 'ready' then
    if new.state <> 'archived'
       or new.version is distinct from old.version
       or new.composition is distinct from old.composition
       or new.composition_fingerprint is distinct from old.composition_fingerprint
       or new.validation is distinct from old.validation
       or new.activated_at is distinct from old.activated_at
       or new.archived_at is null then
      raise exception 'Ready Jury Share themes may only transition to Archived without changing their recipe'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if old.state in ('draft', 'invalid') then
    if new.state = 'archived' then
      raise exception 'Draft Jury Share themes cannot be archived directly'
        using errcode = '55000';
    end if;

    if new.composition is distinct from old.composition then
      if new.state not in ('draft', 'invalid')
         or new.version is distinct from old.version + 1 then
        raise exception 'Changed Jury Share drafts must advance the canonical version by one'
          using errcode = '55000';
      end if;
    elsif new.version is distinct from old.version then
      raise exception 'Unchanged Jury Share drafts cannot advance version'
        using errcode = '55000';
    end if;
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_jury_share_theme_row()
  from public, anon, authenticated;

create trigger v3_guard_jury_share_theme_row
before insert or update or delete on public.edition_jury_share_themes
for each row execute function private.v3_guard_jury_share_theme_row();

create table private.v3_jury_share_theme_render_validations (
  id uuid primary key,
  theme_id uuid not null references public.edition_jury_share_themes(id) on delete restrict,
  edition_id uuid not null references public.editions(id) on delete restrict,
  theme_version integer not null check (theme_version >= 1),
  composition_fingerprint text not null
    check (composition_fingerprint ~ '^[0-9a-f]{64}$'),
  renderer_version text not null
    check (length(btrim(renderer_version)) between 1 and 120),
  assets_ok boolean not null,
  typography_ok boolean not null,
  layout_ok boolean not null,
  contrast_ok boolean not null,
  png_ok boolean not null,
  jpeg_ok boolean not null,
  issue_codes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(issue_codes) = 'array')
    check (pg_column_size(issue_codes) <= 16384),
  passed boolean generated always as (
    assets_ok and typography_ok and layout_ok and contrast_ok and png_ok and jpeg_ok
  ) stored,
  validated_at timestamptz not null default now()
);

create index v3_jury_share_theme_render_validation_lookup_idx
  on private.v3_jury_share_theme_render_validations (
    theme_id, theme_version, composition_fingerprint, validated_at desc, id
  );

alter table private.v3_jury_share_theme_render_validations enable row level security;
revoke all on table private.v3_jury_share_theme_render_validations
  from public, anon, authenticated;
grant select, insert on table private.v3_jury_share_theme_render_validations
  to service_role;

comment on table private.v3_jury_share_theme_render_validations is
  'Immutable server-renderer evidence for an exact Jury Share Edition theme version and composition fingerprint. Browser preview state is never authoritative.';

create or replace function private.v3_reject_jury_share_render_validation_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $reject$
begin
  raise exception 'Jury Share renderer validation evidence is immutable'
    using errcode = '55000';
end
$reject$;

revoke all on function private.v3_reject_jury_share_render_validation_mutation()
  from public, anon, authenticated;

create trigger v3_jury_share_render_validation_immutable
before update or delete on private.v3_jury_share_theme_render_validations
for each row execute function private.v3_reject_jury_share_render_validation_mutation();

create or replace function private.v3_jury_share_theme_render_validation_summary(
  p_theme_id uuid,
  p_theme_version integer,
  p_composition_fingerprint text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $summary$
declare
  v_row private.v3_jury_share_theme_render_validations%rowtype;
begin
  select evidence.* into v_row
  from private.v3_jury_share_theme_render_validations evidence
  where evidence.theme_id = p_theme_id
    and evidence.theme_version = p_theme_version
    and evidence.composition_fingerprint = p_composition_fingerprint
  order by evidence.validated_at desc, evidence.id desc
  limit 1;

  if v_row.id is null then
    return jsonb_build_object(
      'status', 'missing',
      'readyEligible', false
    );
  end if;

  return jsonb_build_object(
    'status', case when v_row.passed then 'valid' else 'invalid' end,
    'readyEligible', v_row.passed,
    'validationId', v_row.id,
    'rendererVersion', v_row.renderer_version,
    'compositionFingerprint', v_row.composition_fingerprint,
    'checks', jsonb_build_object(
      'assets', v_row.assets_ok,
      'typography', v_row.typography_ok,
      'layout', v_row.layout_ok,
      'contrast', v_row.contrast_ok,
      'png', v_row.png_ok,
      'jpeg', v_row.jpeg_ok
    ),
    'issueCodes', v_row.issue_codes,
    'validatedAt', v_row.validated_at
  );
end
$summary$;

revoke all on function private.v3_jury_share_theme_render_validation_summary(uuid, integer, text)
  from public, anon, authenticated;

grant execute on function private.v3_jury_share_theme_render_validation_summary(uuid, integer, text)
  to service_role;

create or replace function public.studio2_record_jury_share_theme_render_validation(
  p_validation_id uuid,
  p_edition_id uuid,
  p_theme_version integer,
  p_expected_composition_fingerprint text,
  p_renderer_version text,
  p_assets_ok boolean,
  p_typography_ok boolean,
  p_layout_ok boolean,
  p_contrast_ok boolean,
  p_png_ok boolean,
  p_jpeg_ok boolean,
  p_issue_codes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $record$
declare
  v_theme public.edition_jury_share_themes%rowtype;
  v_existing private.v3_jury_share_theme_render_validations%rowtype;
  v_saved private.v3_jury_share_theme_render_validations%rowtype;
  v_structural jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_validation_id is null
     or p_edition_id is null
     or p_theme_version is null or p_theme_version < 1
     or coalesce(p_expected_composition_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_renderer_version, ''))) not between 1 and 120
     or jsonb_typeof(coalesce(p_issue_codes, '[]'::jsonb)) <> 'array'
     or pg_column_size(coalesce(p_issue_codes, '[]'::jsonb)) > 16384
     or p_assets_ok is null
     or p_typography_ok is null
     or p_layout_ok is null
     or p_contrast_ok is null
     or p_png_ok is null
     or p_jpeg_ok is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
    and theme.version = p_theme_version;

  if v_theme.id is null then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  if v_theme.composition_fingerprint is distinct from p_expected_composition_fingerprint then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  v_structural := private.v3_validate_jury_share_edition_theme(
    p_edition_id,
    v_theme.composition
  );

  insert into private.v3_jury_share_theme_render_validations (
    id,
    theme_id,
    edition_id,
    theme_version,
    composition_fingerprint,
    renderer_version,
    assets_ok,
    typography_ok,
    layout_ok,
    contrast_ok,
    png_ok,
    jpeg_ok,
    issue_codes
  ) values (
    p_validation_id,
    v_theme.id,
    p_edition_id,
    p_theme_version,
    p_expected_composition_fingerprint,
    btrim(p_renderer_version),
    p_assets_ok,
    p_typography_ok,
    p_layout_ok,
    p_contrast_ok,
    p_png_ok,
    p_jpeg_ok,
    coalesce(p_issue_codes, '[]'::jsonb)
  )
  on conflict (id) do nothing;

  select evidence.* into v_saved
  from private.v3_jury_share_theme_render_validations evidence
  where evidence.id = p_validation_id;

  if v_saved.id is null then
    raise exception 'Renderer validation evidence could not be persisted'
      using errcode = 'P0001';
  end if;

  if v_saved.theme_id is distinct from v_theme.id
     or v_saved.edition_id is distinct from p_edition_id
     or v_saved.theme_version is distinct from p_theme_version
     or v_saved.composition_fingerprint is distinct from p_expected_composition_fingerprint
     or v_saved.renderer_version is distinct from btrim(p_renderer_version)
     or v_saved.assets_ok is distinct from p_assets_ok
     or v_saved.typography_ok is distinct from p_typography_ok
     or v_saved.layout_ok is distinct from p_layout_ok
     or v_saved.contrast_ok is distinct from p_contrast_ok
     or v_saved.png_ok is distinct from p_png_ok
     or v_saved.jpeg_ok is distinct from p_jpeg_ok
     or v_saved.issue_codes is distinct from coalesce(p_issue_codes, '[]'::jsonb) then
    raise exception 'IDEMPOTENCY_KEY_REUSED'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'validationId', v_saved.id,
    'editionId', p_edition_id,
    'themeId', v_theme.id,
    'version', v_theme.version,
    'compositionFingerprint', v_theme.composition_fingerprint,
    'structuralValid', coalesce((v_structural ->> 'valid')::boolean, false),
    'renderValid', v_saved.passed,
    'readyEligible',
      coalesce((v_structural ->> 'valid')::boolean, false) and v_saved.passed,
    'rendererVersion', v_saved.renderer_version,
    'validatedAt', v_saved.validated_at
  );
end
$record$;

revoke all on function public.studio2_record_jury_share_theme_render_validation(
  uuid, uuid, integer, text, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_record_jury_share_theme_render_validation(
  uuid, uuid, integer, text, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb
) to service_role;

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
  v_total integer := 0;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if not v_service
     and not public.studio2_access_allowed('edition.share_theme.view', p_edition_id, false)
     and not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select count(*)::integer
  into v_total
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', theme.id,
    'editionId', theme.edition_id,
    'version', theme.version,
    'state', theme.state,
    'composition', theme.composition,
    'compositionFingerprint', theme.composition_fingerprint,
    'validation', theme.validation,
    'renderValidation', render_state.summary,
    'readyEligible',
      coalesce((theme.validation ->> 'valid')::boolean, false)
      and coalesce((render_state.summary ->> 'readyEligible')::boolean, false),
    'activatedAt', theme.activated_at,
    'archivedAt', theme.archived_at,
    'updatedAt', theme.updated_at
  ) order by theme.version desc), '[]'::jsonb)
  into v_rows
  from (
    select candidate.*
    from public.edition_jury_share_themes candidate
    where candidate.edition_id = p_edition_id
    order by candidate.version desc
    limit 50
  ) theme
  cross join lateral (
    select private.v3_jury_share_theme_render_validation_summary(
      theme.id,
      theme.version,
      theme.composition_fingerprint
    ) as summary
  ) render_state;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'themes', v_rows,
    'truncated', v_total > 50,
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
  v_render_validation jsonb;
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
      edition_id, version, state, composition, composition_fingerprint,
      validation, created_by, updated_by
    ) values (
      p_edition_id,
      1,
      'draft',
      p_composition,
      private.v3_jury_share_theme_fingerprint(p_composition),
      v_validation,
      auth.uid(),
      auth.uid()
    ) returning * into v_saved;
  elsif v_current.state in ('draft', 'invalid')
        and v_current.composition = p_composition then
    v_saved := v_current;
  elsif v_current.state in ('draft', 'invalid') then
    update public.edition_jury_share_themes
    set version = v_current.version + 1,
        composition = p_composition,
        composition_fingerprint = private.v3_jury_share_theme_fingerprint(p_composition),
        validation = v_validation,
        state = 'draft',
        activated_at = null,
        archived_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_current.id
    returning * into v_saved;
  else
    insert into public.edition_jury_share_themes (
      edition_id, version, state, composition, composition_fingerprint,
      validation, created_by, updated_by
    ) values (
      p_edition_id,
      v_current.version + 1,
      'draft',
      p_composition,
      private.v3_jury_share_theme_fingerprint(p_composition),
      v_validation,
      auth.uid(),
      auth.uid()
    ) returning * into v_saved;
  end if;

  v_render_validation := private.v3_jury_share_theme_render_validation_summary(
    v_saved.id,
    v_saved.version,
    v_saved.composition_fingerprint
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'themeId', v_saved.id,
    'version', v_saved.version,
    'state', v_saved.state,
    'compositionFingerprint', v_saved.composition_fingerprint,
    'validation', v_saved.validation,
    'renderValidation', v_render_validation,
    'readyEligible',
      coalesce((v_saved.validation ->> 'valid')::boolean, false)
      and coalesce((v_render_validation ->> 'readyEligible')::boolean, false),
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
  v_render_validation jsonb;
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

  v_validation := private.v3_validate_jury_share_edition_theme(
    p_edition_id,
    v_theme.composition
  );
  v_render_validation := private.v3_jury_share_theme_render_validation_summary(
    v_theme.id,
    v_theme.version,
    v_theme.composition_fingerprint
  );

  if v_target = 'ready' then
    if v_runtime_state = 'archived' or v_theme.state not in ('draft', 'invalid') then
      raise exception using errcode = '25006', message = 'STATE_CHANGED';
    end if;
    if not coalesce((v_validation ->> 'valid')::boolean, false) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if not coalesce((v_render_validation ->> 'readyEligible')::boolean, false) then
      raise exception using errcode = '22023', message = 'RENDER_VALIDATION_REQUIRED';
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
    'compositionFingerprint', v_theme.composition_fingerprint,
    'validation', v_theme.validation,
    'renderValidation', v_render_validation,
    'readyEligible',
      coalesce((v_theme.validation ->> 'valid')::boolean, false)
      and coalesce((v_render_validation ->> 'readyEligible')::boolean, false),
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
  v_render_validation jsonb;
  v_service boolean := private.studio2_request_is_service_role();
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

  if not v_service
     and not private.studio2_feature_enabled_for(
       auth.uid(),
       'jury_share_cards_v1',
       v_edition_id
     ) then
    return jsonb_build_object(
      'available', false,
      'state', 'disabled',
      'serverTime', now()
    );
  end if;

  if not v_service
     and not (
       public.show_publication_enabled(p_show_id, 'results')
       and public.show_publication_enabled(p_show_id, 'jury_results')
     ) then
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
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

  v_render_validation := private.v3_jury_share_theme_render_validation_summary(
    v_theme.id,
    v_theme.version,
    v_theme.composition_fingerprint
  );

  if not coalesce((v_render_validation ->> 'readyEligible')::boolean, false) then
    return jsonb_build_object(
      'available', false,
      'state', 'invalid',
      'serverTime', now()
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'themeId', 'edition',
    'editionId', v_edition_id,
    'version', v_theme.version,
    'state', v_theme.state,
    'compositionFingerprint', v_theme.composition_fingerprint,
    'composition', v_theme.composition,
    'renderValidation', v_render_validation,
    'serverTime', now()
  );
end
$public_theme$;

revoke all on function public.v3_jury_share_edition_theme(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_edition_theme(uuid)
  to anon, authenticated, service_role;

comment on function public.v3_jury_share_edition_theme(uuid) is
  'Publication- and rollout-gated Edition Jury Share theme projection. Ready/Archived recipes remain unavailable unless authoritative renderer validation matches the exact version and composition fingerprint.';

notify pgrst, 'reload schema';

commit;
