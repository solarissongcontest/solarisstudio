begin;

-- Solaris Studio V3 / Jury Share Cards JSC-7.
-- Versioned Edition share-theme authority plus version-bound renderer validation.
-- This migration is additive and deliberately does not create another Jury vote
-- store or store rendered image bytes in Postgres.

select public.v3_register_migration_contract(
  'v3.results.jury-share-edition-theme-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Add bounded versioned Edition Jury Share composition recipes and exact-version renderer validation evidence without backfilling historical themes.'
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

create or replace function private.v3_jury_share_composition_hash(p_composition jsonb)
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

revoke all on function private.v3_jury_share_composition_hash(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_jury_share_unknown_keys(
  p_object jsonb,
  p_allowed text[]
)
returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog
as $keys$
  select coalesce(array_agg(key order by key), array[]::text[])
  from jsonb_object_keys(coalesce(p_object, '{}'::jsonb)) key
  where not (key = any(p_allowed))
$keys$;

revoke all on function private.v3_jury_share_unknown_keys(jsonb, text[])
  from public, anon, authenticated;

create table public.edition_jury_share_themes (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete restrict,
  version integer not null check (version >= 1),
  state text not null default 'draft'
    check (state in ('draft', 'ready', 'archived', 'invalid')),
  composition jsonb not null
    check (jsonb_typeof(composition) = 'object')
    check (pg_column_size(composition) <= 65536),
  composition_hash text not null
    check (composition_hash ~ '^[0-9a-f]{64}$'),
  validation jsonb not null
    check (jsonb_typeof(validation) = 'object')
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
revoke all on table public.edition_jury_share_themes
  from public, anon, authenticated;
grant select, insert, update on table public.edition_jury_share_themes
  to service_role;

comment on table public.edition_jury_share_themes is
  'Bounded, versioned Edition-only composition recipes for Jury Share Cards. Browser writes are RPC-only; archived versions are immutable.';

create table private.v3_jury_share_theme_render_validations (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.edition_jury_share_themes(id) on delete restrict,
  edition_id uuid not null references public.editions(id) on delete restrict,
  theme_version integer not null check (theme_version >= 1),
  composition_hash text not null check (composition_hash ~ '^[0-9a-f]{64}$'),
  validator_contract_version integer not null check (validator_contract_version >= 1),
  validator_build text not null check (length(validator_build) between 1 and 160),
  checks jsonb not null
    check (jsonb_typeof(checks) = 'object')
    check (pg_column_size(checks) <= 8192),
  valid boolean not null,
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  validated_at timestamptz not null default now(),
  unique (
    theme_id,
    composition_hash,
    validator_contract_version,
    validator_build
  )
);

create index v3_jury_share_theme_render_validations_lookup_idx
  on private.v3_jury_share_theme_render_validations
    (theme_id, composition_hash, valid, validated_at desc);

alter table private.v3_jury_share_theme_render_validations enable row level security;
revoke all on table private.v3_jury_share_theme_render_validations
  from public, anon, authenticated;
grant select, insert on table private.v3_jury_share_theme_render_validations
  to service_role;

comment on table private.v3_jury_share_theme_render_validations is
  'Immutable service-owned evidence that an exact Edition theme composition passed authoritative render/export validation. Contains no ballot or image binary.';

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
  v_edition public.editions%rowtype;
  v_artwork jsonb;
  v_scoreboard jsonb;
  v_header jsonb;
  v_background jsonb;
  v_footer jsonb;
  v_safe jsonb;
  v_asset jsonb;
  v_unknown text[];
  v_key text;
  v_color text;
  v_row_height numeric;
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

  if p_composition is null or jsonb_typeof(p_composition) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'COMPOSITION_NOT_OBJECT')),
      'warnings', v_warnings
    );
  end if;

  if pg_column_size(p_composition) > 65536 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'COMPOSITION_TOO_LARGE'));
  end if;

  if lower(p_composition::text) ~ '(https?://|javascript:|<script|</script|customcss|customhtml|customjavascript|data:text/html)' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'UNSAFE_OR_ARBITRARY_CONTENT'));
  end if;

  v_unknown := private.v3_jury_share_unknown_keys(
    p_composition,
    array['artwork','scoreboard','header','background','footer','decorativeAssets','safeArea']
  );
  if cardinality(v_unknown) > 0 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'UNKNOWN_TOP_LEVEL_KEYS',
      'keys', to_jsonb(v_unknown)
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

  v_scoreboard := p_composition -> 'scoreboard';
  if jsonb_typeof(v_scoreboard) = 'object' then
    v_unknown := private.v3_jury_share_unknown_keys(
      v_scoreboard,
      array[
        'inheritEditionScoreboard','rowRadius','rowHeight',
        'standardRowBackground','standardRowForeground',
        'twelvePointBackground','twelvePointForeground',
        'flagTreatment','scoreTreatment','scoreTypography'
      ]
    );
    if cardinality(v_unknown) > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_SCOREBOARD_KEYS',
        'keys', to_jsonb(v_unknown)
      ));
    end if;

    if jsonb_typeof(v_scoreboard -> 'inheritEditionScoreboard') is distinct from 'boolean' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SCOREBOARD_INHERITANCE_INVALID'));
    end if;

    foreach v_key in array array['rowRadius','rowHeight']
    loop
      if jsonb_typeof(v_scoreboard -> v_key) is distinct from 'number' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'SCOREBOARD_NUMBER_INVALID',
          'key', v_key
        ));
      end if;
    end loop;

    if jsonb_typeof(v_scoreboard -> 'rowRadius') = 'number'
       and ((v_scoreboard ->> 'rowRadius')::numeric < 0 or (v_scoreboard ->> 'rowRadius')::numeric > 72) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ROW_RADIUS_INVALID'));
    end if;

    if jsonb_typeof(v_scoreboard -> 'rowHeight') = 'number' then
      v_row_height := (v_scoreboard ->> 'rowHeight')::numeric;
      if v_row_height < 72 or v_row_height > 128 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ROW_HEIGHT_INVALID'));
      end if;
    end if;

    foreach v_key in array array[
      'standardRowBackground','standardRowForeground',
      'twelvePointBackground','twelvePointForeground'
    ]
    loop
      v_color := v_scoreboard ->> v_key;
      if v_color is null or v_color !~* '^#[0-9a-f]{6}$' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'COLOR_INVALID',
          'key', v_key
        ));
      end if;
    end loop;

    if coalesce(v_scoreboard ->> 'flagTreatment', '') not in ('plain','soft_frame','edition') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'FLAG_TREATMENT_INVALID'));
    end if;
    if coalesce(v_scoreboard ->> 'scoreTreatment', '') not in ('plain','capsule','edition') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SCORE_TREATMENT_INVALID'));
    end if;
    if coalesce(v_scoreboard ->> 'scoreTypography', '') not in ('edition','system_bold') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SCORE_TYPOGRAPHY_INVALID'));
    end if;
  end if;

  v_header := p_composition -> 'header';
  if jsonb_typeof(v_header) = 'object' then
    v_unknown := private.v3_jury_share_unknown_keys(
      v_header,
      array['logoMode','alignment','titleTreatment']
    );
    if cardinality(v_unknown) > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_HEADER_KEYS',
        'keys', to_jsonb(v_unknown)
      ));
    end if;
    if coalesce(v_header ->> 'logoMode', '') not in ('edition','solaris','none') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'HEADER_LOGO_MODE_INVALID'));
    end if;
    if coalesce(v_header ->> 'alignment', '') not in ('left','center','right') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'HEADER_ALIGNMENT_INVALID'));
    end if;
    if coalesce(v_header ->> 'titleTreatment', '') not in ('edition','system') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'HEADER_TITLE_TREATMENT_INVALID'));
    end if;
  end if;

  v_background := p_composition -> 'background';
  if jsonb_typeof(v_background) = 'object' then
    v_unknown := private.v3_jury_share_unknown_keys(
      v_background,
      array['baseColor','treatment']
    );
    if cardinality(v_unknown) > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_BACKGROUND_KEYS',
        'keys', to_jsonb(v_unknown)
      ));
    end if;
    v_color := v_background ->> 'baseColor';
    if v_color is null or v_color !~* '^#[0-9a-f]{6}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'BACKGROUND_COLOR_INVALID'));
    end if;
    if coalesce(v_background ->> 'treatment', '') not in ('flat','artwork','artwork_scrim') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'BACKGROUND_TREATMENT_INVALID'));
    end if;
  end if;

  v_footer := p_composition -> 'footer';
  if jsonb_typeof(v_footer) = 'object' then
    v_unknown := private.v3_jury_share_unknown_keys(
      v_footer,
      array['sourceCountryTreatment','backgroundTreatment','motif']
    );
    if cardinality(v_unknown) > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_FOOTER_KEYS',
        'keys', to_jsonb(v_unknown)
      ));
    end if;
    if coalesce(v_footer ->> 'sourceCountryTreatment', '') not in ('edition','system') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'FOOTER_COUNTRY_TREATMENT_INVALID'));
    end if;
    if coalesce(v_footer ->> 'backgroundTreatment', '') not in ('none','soft_panel') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'FOOTER_BACKGROUND_TREATMENT_INVALID'));
    end if;
    if coalesce(v_footer ->> 'motif', '') not in ('none','edition') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'FOOTER_MOTIF_INVALID'));
    end if;
  end if;

  v_artwork := p_composition -> 'artwork';
  if v_artwork is not null and jsonb_typeof(v_artwork) <> 'null' then
    if jsonb_typeof(v_artwork) <> 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_NOT_OBJECT'));
    else
      v_unknown := private.v3_jury_share_unknown_keys(
        v_artwork,
        array[
          'assetId','placement','focalX','focalY','scale','opacity','blurPx',
          'fadeDirection','fadeStart','fadeEnd','scrimStrength'
        ]
      );
      if cardinality(v_unknown) > 0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'UNKNOWN_ARTWORK_KEYS',
          'keys', to_jsonb(v_unknown)
        ));
      end if;

      if nullif(btrim(coalesce(v_artwork ->> 'assetId', '')), '') is null
         or v_edition.artwork_storage_path is null
         or v_artwork ->> 'assetId' is distinct from v_edition.artwork_storage_path then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_ASSET_NOT_EDITION_OWNED'));
      end if;
      if coalesce(v_artwork ->> 'placement', '') not in ('top','top_fade','background','bottom','bottom_fade','full') then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_PLACEMENT_INVALID'));
      end if;
      if coalesce(v_artwork ->> 'scale', '') not in ('cover','contain') then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_SCALE_INVALID'));
      end if;
      if coalesce(v_artwork ->> 'fadeDirection', '') not in ('none','up','down','radial') then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_FADE_DIRECTION_INVALID'));
      end if;

      foreach v_key in array array['focalX','focalY','opacity','blurPx','fadeStart','fadeEnd','scrimStrength']
      loop
        if jsonb_typeof(v_artwork -> v_key) is distinct from 'number' then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'ARTWORK_NUMBER_INVALID',
            'key', v_key
          ));
        end if;
      end loop;

      foreach v_key in array array['focalX','focalY','opacity','fadeStart','fadeEnd','scrimStrength']
      loop
        if jsonb_typeof(v_artwork -> v_key) = 'number'
           and ((v_artwork ->> v_key)::numeric < 0 or (v_artwork ->> v_key)::numeric > 1) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'ARTWORK_RANGE_INVALID',
            'key', v_key
          ));
        end if;
      end loop;
      if jsonb_typeof(v_artwork -> 'blurPx') = 'number'
         and ((v_artwork ->> 'blurPx')::numeric < 0 or (v_artwork ->> 'blurPx')::numeric > 40) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_BLUR_INVALID'));
      end if;
      if jsonb_typeof(v_artwork -> 'fadeStart') = 'number'
         and jsonb_typeof(v_artwork -> 'fadeEnd') = 'number'
         and (v_artwork ->> 'fadeStart')::numeric > (v_artwork ->> 'fadeEnd')::numeric then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'ARTWORK_FADE_ORDER_INVALID'));
      end if;
    end if;
  end if;

  if jsonb_typeof(v_background) = 'object'
     and coalesce(v_background ->> 'treatment', '') in ('artwork','artwork_scrim')
     and (v_artwork is null or jsonb_typeof(v_artwork) = 'null') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'BACKGROUND_REQUIRES_ARTWORK'));
  end if;

  if p_composition ? 'decorativeAssets' then
    if jsonb_typeof(p_composition -> 'decorativeAssets') <> 'array' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSETS_NOT_ARRAY'));
    elsif jsonb_array_length(p_composition -> 'decorativeAssets') > 32 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'TOO_MANY_DECORATIVE_ASSETS'));
    else
      for v_asset in select value from jsonb_array_elements(p_composition -> 'decorativeAssets')
      loop
        if jsonb_typeof(v_asset) <> 'object' then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSET_INVALID'));
          continue;
        end if;
        v_unknown := private.v3_jury_share_unknown_keys(v_asset, array['assetId','placement','opacity']);
        if cardinality(v_unknown) > 0 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'UNKNOWN_DECORATIVE_ASSET_KEYS',
            'keys', to_jsonb(v_unknown)
          ));
        end if;
        if nullif(btrim(coalesce(v_asset ->> 'assetId', '')), '') is null
           or v_edition.artwork_storage_path is null
           or v_asset ->> 'assetId' is distinct from v_edition.artwork_storage_path then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSET_NOT_EDITION_OWNED'));
        end if;
        if coalesce(v_asset ->> 'placement', '') not in ('top','bottom','background') then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSET_PLACEMENT_INVALID'));
        end if;
        if jsonb_typeof(v_asset -> 'opacity') is distinct from 'number' then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSET_OPACITY_INVALID'));
        elsif (v_asset ->> 'opacity')::numeric < 0
           or (v_asset ->> 'opacity')::numeric > 1 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'DECORATIVE_ASSET_OPACITY_INVALID'));
        end if;
      end loop;
    end if;
  end if;

  v_safe := p_composition -> 'safeArea';
  if jsonb_typeof(v_safe) = 'object' then
    v_unknown := private.v3_jury_share_unknown_keys(v_safe, array['top','right','bottom','left']);
    if cardinality(v_unknown) > 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'UNKNOWN_SAFE_AREA_KEYS',
        'keys', to_jsonb(v_unknown)
      ));
    end if;

    foreach v_key in array array['top','right','bottom','left']
    loop
      if jsonb_typeof(v_safe -> v_key) is distinct from 'number' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'SAFE_AREA_VALUE_INVALID',
          'key', v_key
        ));
      elsif (v_safe ->> v_key)::numeric < 0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'SAFE_AREA_VALUE_NEGATIVE',
          'key', v_key
        ));
      end if;
    end loop;

    if jsonb_typeof(v_safe -> 'top') = 'number'
       and jsonb_typeof(v_safe -> 'bottom') = 'number'
       and (v_safe ->> 'top')::numeric + (v_safe ->> 'bottom')::numeric >= 1920 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SAFE_AREA_VERTICAL_INVALID'));
    end if;

    if jsonb_typeof(v_safe -> 'left') = 'number'
       and jsonb_typeof(v_safe -> 'right') = 'number'
       and (v_safe ->> 'left')::numeric + (v_safe ->> 'right')::numeric >= 1080 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'SAFE_AREA_HORIZONTAL_INVALID'));
    end if;

    if v_row_height is not null
       and jsonb_typeof(v_safe -> 'top') = 'number'
       and jsonb_typeof(v_safe -> 'bottom') = 'number'
       and v_row_height * 10 > 1920
         - (v_safe ->> 'top')::numeric
         - (v_safe ->> 'bottom')::numeric
         - 320 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'TEN_ROWS_GEOMETRY_INVALID'));
    end if;
  end if;

  if v_edition.artwork_storage_path is null then
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

create or replace function private.v3_jury_share_render_checks_well_formed(p_checks jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $well_formed$
  select
    jsonb_typeof(p_checks) = 'object'
    and jsonb_object_length(p_checks) = 9
    and jsonb_typeof(p_checks -> 'assets') = 'boolean'
    and jsonb_typeof(p_checks -> 'typography') = 'boolean'
    and jsonb_typeof(p_checks -> 'glyphCoverage') = 'boolean'
    and jsonb_typeof(p_checks -> 'longNameFit') = 'boolean'
    and jsonb_typeof(p_checks -> 'tenRowsFit') = 'boolean'
    and jsonb_typeof(p_checks -> 'safeZoneLayout') = 'boolean'
    and jsonb_typeof(p_checks -> 'contrast') = 'boolean'
    and jsonb_typeof(p_checks -> 'pngExport') = 'boolean'
    and jsonb_typeof(p_checks -> 'jpegExport') = 'boolean'
$well_formed$;

revoke all on function private.v3_jury_share_render_checks_well_formed(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_jury_share_render_checks_valid(p_checks jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, private
as $valid$
  select case
    when private.v3_jury_share_render_checks_well_formed(p_checks) then
      (p_checks ->> 'assets')::boolean
      and (p_checks ->> 'typography')::boolean
      and (p_checks ->> 'glyphCoverage')::boolean
      and (p_checks ->> 'longNameFit')::boolean
      and (p_checks ->> 'tenRowsFit')::boolean
      and (p_checks ->> 'safeZoneLayout')::boolean
      and (p_checks ->> 'contrast')::boolean
      and (p_checks ->> 'pngExport')::boolean
      and (p_checks ->> 'jpegExport')::boolean
    else false
  end
$valid$;

revoke all on function private.v3_jury_share_render_checks_valid(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_guard_archived_jury_share_theme()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if old.state = 'archived' then
    raise exception 'Archived Jury Share theme versions are immutable'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_jury_share_theme()
  from public, anon, authenticated;

create trigger v3_guard_archived_jury_share_theme
before update or delete on public.edition_jury_share_themes
for each row execute function private.v3_guard_archived_jury_share_theme();

create or replace function public.v3_record_jury_share_theme_render_validation(
  p_theme_id uuid,
  p_composition_hash text,
  p_validator_contract_version integer,
  p_validator_build text,
  p_checks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $record$
declare
  v_theme public.edition_jury_share_themes%rowtype;
  v_valid boolean;
  v_evidence_hash text;
  v_existing private.v3_jury_share_theme_render_validations%rowtype;
  v_rows integer;
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if p_theme_id is null
     or p_composition_hash is null
     or p_composition_hash !~ '^[0-9a-f]{64}$'
     or p_validator_contract_version is distinct from 1
     or nullif(btrim(coalesce(p_validator_build, '')), '') is null
     or length(p_validator_build) > 160
     or not private.v3_jury_share_render_checks_well_formed(p_checks) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.id = p_theme_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'THEME_NOT_FOUND';
  end if;

  if v_theme.state = 'archived' then
    raise exception using errcode = '25006', message = 'STATE_CHANGED';
  end if;

  if v_theme.composition_hash is distinct from p_composition_hash then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_valid := private.v3_jury_share_render_checks_valid(p_checks);
  v_evidence_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'themeId', v_theme.id,
          'editionId', v_theme.edition_id,
          'version', v_theme.version,
          'compositionHash', v_theme.composition_hash,
          'validatorContractVersion', p_validator_contract_version,
          'validatorBuild', p_validator_build,
          'checks', p_checks,
          'valid', v_valid
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into private.v3_jury_share_theme_render_validations (
    theme_id,
    edition_id,
    theme_version,
    composition_hash,
    validator_contract_version,
    validator_build,
    checks,
    valid,
    evidence_hash
  ) values (
    v_theme.id,
    v_theme.edition_id,
    v_theme.version,
    v_theme.composition_hash,
    p_validator_contract_version,
    p_validator_build,
    p_checks,
    v_valid,
    v_evidence_hash
  )
  on conflict (
    theme_id,
    composition_hash,
    validator_contract_version,
    validator_build
  ) do nothing;

  get diagnostics v_rows = row_count;

  select evidence.* into v_existing
  from private.v3_jury_share_theme_render_validations evidence
  where evidence.theme_id = v_theme.id
    and evidence.composition_hash = v_theme.composition_hash
    and evidence.validator_contract_version = p_validator_contract_version
    and evidence.validator_build = p_validator_build;

  if v_existing.id is null then
    raise exception using errcode = 'P0001', message = 'DEPENDENCY_FAILURE';
  end if;

  if v_existing.evidence_hash is distinct from v_evidence_hash
     or v_existing.checks is distinct from p_checks
     or v_existing.valid is distinct from v_valid then
    raise exception using errcode = 'P0001', message = 'VALIDATION_EVIDENCE_CONFLICT';
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', v_rows = 0,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'compositionHash', v_theme.composition_hash,
    'valid', v_existing.valid,
    'checks', v_existing.checks,
    'validatorContractVersion', v_existing.validator_contract_version,
    'validatorBuild', v_existing.validator_build,
    'validatedAt', v_existing.validated_at,
    'evidenceHash', v_existing.evidence_hash
  );
end
$record$;

revoke all on function public.v3_record_jury_share_theme_render_validation(
  uuid, text, integer, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.v3_record_jury_share_theme_render_validation(
  uuid, text, integer, text, jsonb
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
begin
  if p_edition_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not v_service
     and not public.studio2_access_allowed('edition.share_theme.view', p_edition_id, false)
     and not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', theme.id,
        'editionId', theme.edition_id,
        'version', theme.version,
        'state', theme.state,
        'composition', theme.composition,
        'compositionHash', theme.composition_hash,
        'validation', theme.validation,
        'renderValidation',
          case when evidence.id is null then null else jsonb_build_object(
            'valid', evidence.valid,
            'checks', evidence.checks,
            'validatorContractVersion', evidence.validator_contract_version,
            'validatorBuild', evidence.validator_build,
            'validatedAt', evidence.validated_at,
            'evidenceHash', evidence.evidence_hash
          ) end,
        'activatedAt', theme.activated_at,
        'archivedAt', theme.archived_at,
        'updatedAt', theme.updated_at
      )
      order by theme.version desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.edition_jury_share_themes theme
  left join lateral (
    select validation.*
    from private.v3_jury_share_theme_render_validations validation
    where validation.theme_id = theme.id
      and validation.composition_hash = theme.composition_hash
      and validation.validator_contract_version = 1
    order by validation.valid desc, validation.validated_at desc
    limit 1
  ) evidence on true
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

create or replace function public.studio2_jury_share_theme_ready_preflight(
  p_edition_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_service boolean := private.studio2_request_is_service_role();
  v_theme public.edition_jury_share_themes%rowtype;
  v_runtime_state text;
  v_structural jsonb;
  v_render private.v3_jury_share_theme_render_validations%rowtype;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_edition_id is null or p_version is null or p_version < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not v_service
     and not public.studio2_access_allowed('edition.share_theme.view', p_edition_id, false)
     and not public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select runtime.state into v_runtime_state
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
    and theme.version = p_version;

  if not found then
    raise exception using errcode = 'P0002', message = 'THEME_NOT_FOUND';
  end if;

  if p_version is distinct from (
    select max(theme.version)
    from public.edition_jury_share_themes theme
    where theme.edition_id = p_edition_id
  ) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'VERSION_CONFLICT',
      'detail', 'A newer Edition share-theme version exists.'
    ));
  end if;

  if v_runtime_state = 'archived' then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'EDITION_ARCHIVED',
      'detail', 'Archived editions cannot activate a new Ready theme.'
    ));
  end if;

  if v_theme.state not in ('draft', 'invalid') then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'STATE_CHANGED',
      'detail', 'Only Draft or Invalid themes can become Ready.'
    ));
  end if;

  v_structural := private.v3_validate_jury_share_edition_theme(
    p_edition_id,
    v_theme.composition
  );

  if not coalesce((v_structural ->> 'valid')::boolean, false) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'STRUCTURAL_VALIDATION_FAILED',
      'detail', 'The saved composition does not pass canonical structural validation.'
    ));
  end if;

  select validation.* into v_render
  from private.v3_jury_share_theme_render_validations validation
  where validation.theme_id = v_theme.id
    and validation.composition_hash = v_theme.composition_hash
    and validation.validator_contract_version = 1
  order by validation.valid desc, validation.validated_at desc
  limit 1;

  if v_render.id is null then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'RENDER_VALIDATION_REQUIRED',
      'detail', 'Authoritative render validation is missing for this exact saved composition.'
    ));
  elsif not v_render.valid then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'RENDER_VALIDATION_FAILED',
      'detail', 'The exact saved composition failed authoritative render validation.'
    ));
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'themeId', v_theme.id,
    'version', v_theme.version,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'ready', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'structuralValidation', v_structural,
    'renderValidation',
      case when v_render.id is null then null else jsonb_build_object(
        'valid', v_render.valid,
        'checks', v_render.checks,
        'validatorContractVersion', v_render.validator_contract_version,
        'validatorBuild', v_render.validator_build,
        'validatedAt', v_render.validated_at,
        'evidenceHash', v_render.evidence_hash
      ) end,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.studio2_jury_share_theme_ready_preflight(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_jury_share_theme_ready_preflight(uuid, integer)
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
  v_hash text;
  v_runtime_state text;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_composition is null
     or jsonb_typeof(p_composition) <> 'object'
     or p_expected_version is null
     or p_expected_version < 0 then
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
      'compositionHash', private.v3_jury_share_composition_hash(p_composition)
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

  perform pg_advisory_xact_lock(
    hashtextextended('jury-share-theme:' || p_edition_id::text, 0)
  );

  select theme.* into v_current
  from public.edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
  order by theme.version desc
  limit 1
  for update;

  if coalesce(v_current.version, 0) is distinct from p_expected_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_validation := private.v3_validate_jury_share_edition_theme(
    p_edition_id,
    p_composition
  );
  v_hash := private.v3_jury_share_composition_hash(p_composition);

  if v_current.id is null then
    insert into public.edition_jury_share_themes (
      edition_id,
      version,
      state,
      composition,
      composition_hash,
      validation,
      created_by,
      updated_by
    ) values (
      p_edition_id,
      1,
      case when coalesce((v_validation ->> 'valid')::boolean, false) then 'draft' else 'invalid' end,
      p_composition,
      v_hash,
      v_validation,
      auth.uid(),
      auth.uid()
    )
    returning * into v_saved;
  elsif v_current.state in ('draft', 'invalid') then
    update public.edition_jury_share_themes
    set
      state = case when coalesce((v_validation ->> 'valid')::boolean, false) then 'draft' else 'invalid' end,
      composition = p_composition,
      composition_hash = v_hash,
      validation = v_validation,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_current.id
    returning * into v_saved;
  else
    insert into public.edition_jury_share_themes (
      edition_id,
      version,
      state,
      composition,
      composition_hash,
      validation,
      created_by,
      updated_by
    ) values (
      p_edition_id,
      v_current.version + 1,
      case when coalesce((v_validation ->> 'valid')::boolean, false) then 'draft' else 'invalid' end,
      p_composition,
      v_hash,
      v_validation,
      auth.uid(),
      auth.uid()
    )
    returning * into v_saved;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'themeId', v_saved.id,
    'version', v_saved.version,
    'state', v_saved.state,
    'compositionHash', v_saved.composition_hash,
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
  v_structural jsonb;
  v_render private.v3_jury_share_theme_render_validations%rowtype;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_version is null
     or p_version < 1
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
    jsonb_build_object(
      'editionId', p_edition_id,
      'themeVersion', p_version
    ),
    jsonb_build_object(
      'targetState', v_target,
      'expectedVersion', p_version
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('jury-share-theme:' || p_edition_id::text, 0)
  );

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
    if v_runtime_state = 'archived'
       or v_theme.state not in ('draft', 'invalid') then
      raise exception using errcode = '25006', message = 'STATE_CHANGED';
    end if;

    v_structural := private.v3_validate_jury_share_edition_theme(
      p_edition_id,
      v_theme.composition
    );

    if not coalesce((v_structural ->> 'valid')::boolean, false) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if private.v3_jury_share_composition_hash(v_theme.composition)
       is distinct from v_theme.composition_hash then
      raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
    end if;

    select validation.* into v_render
    from private.v3_jury_share_theme_render_validations validation
    where validation.theme_id = v_theme.id
      and validation.composition_hash = v_theme.composition_hash
      and validation.validator_contract_version = 1
      and validation.valid
    order by validation.validated_at desc
    limit 1;

    if v_render.id is null then
      raise exception
        using errcode = '22023',
              message = 'VALIDATION',
              hint = 'Authoritative PNG/JPEG, typography, glyph, fit, safe-zone and contrast validation is required for this exact theme version.';
    end if;

    update public.edition_jury_share_themes
    set
      state = 'archived',
      archived_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
    where edition_id = p_edition_id
      and state = 'ready'
      and id <> v_theme.id;

    update public.edition_jury_share_themes
    set
      state = 'ready',
      validation = v_structural,
      activated_at = now(),
      archived_at = null,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_theme.id
    returning * into v_theme;
  else
    if v_runtime_state is distinct from 'archived'
       or v_theme.state <> 'ready' then
      raise exception using errcode = '25006', message = 'STATE_CHANGED';
    end if;

    update public.edition_jury_share_themes
    set
      state = 'archived',
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
    'compositionHash', v_theme.composition_hash,
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
  v_runtime_state text;
  v_theme public.edition_jury_share_themes%rowtype;
  v_render private.v3_jury_share_theme_render_validations%rowtype;
begin
  if p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.edition_id into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
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

  select runtime.state into v_runtime_state
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = v_edition_id;

  select theme.* into v_theme
  from public.edition_jury_share_themes theme
  where theme.edition_id = v_edition_id
    and (
      (v_runtime_state = 'archived' and theme.state = 'archived')
      or (v_runtime_state is distinct from 'archived' and theme.state = 'ready')
    )
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

  select validation.* into v_render
  from private.v3_jury_share_theme_render_validations validation
  where validation.theme_id = v_theme.id
    and validation.composition_hash = v_theme.composition_hash
    and validation.validator_contract_version = 1
    and validation.valid
  order by validation.validated_at desc
  limit 1;

  if v_render.id is null then
    return jsonb_build_object(
      'available', false,
      'state', 'invalid',
      'reason', 'RENDER_VALIDATION_REQUIRED',
      'serverTime', now()
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'themeId', 'edition',
    'editionId', v_edition_id,
    'version', v_theme.version,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'composition', v_theme.composition,
    'renderValidationVersion', v_render.validator_contract_version,
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
