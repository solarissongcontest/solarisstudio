begin;

select public.v3_register_migration_contract(
  'v3.results.jury-share-theme-validator-fix-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Close missing-field and jsonb_object_keys edge cases in the structured Jury Share Edition composition validator before Organizer cutover.'
);

create or replace function private.v3_validate_jury_share_theme_composition(
  p_composition jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate$
declare
  v_unknown_keys text[];
  v_safe_area jsonb;
  v_artwork jsonb;
begin
  if p_composition is null or jsonb_typeof(p_composition) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'code', 'COMPOSITION_NOT_OBJECT'
    );
  end if;

  select array_agg(keys.key order by keys.key)
  into v_unknown_keys
  from jsonb_object_keys(p_composition) as keys(key)
  where keys.key not in (
    'artwork',
    'scoreboard',
    'header',
    'background',
    'footer',
    'decorativeAssets',
    'safeArea'
  );

  if coalesce(array_length(v_unknown_keys, 1), 0) > 0 then
    return jsonb_build_object(
      'valid', false,
      'code', 'UNKNOWN_COMPOSITION_FIELDS',
      'fields', to_jsonb(v_unknown_keys)
    );
  end if;

  if not (p_composition ? 'artwork')
     or not (p_composition ? 'scoreboard')
     or not (p_composition ? 'header')
     or not (p_composition ? 'background')
     or not (p_composition ? 'footer')
     or not (p_composition ? 'decorativeAssets')
     or not (p_composition ? 'safeArea') then
    return jsonb_build_object(
      'valid', false,
      'code', 'MISSING_COMPOSITION_SECTION'
    );
  end if;

  if jsonb_typeof(p_composition -> 'scoreboard') <> 'object'
     or jsonb_typeof(p_composition -> 'header') <> 'object'
     or jsonb_typeof(p_composition -> 'background') <> 'object'
     or jsonb_typeof(p_composition -> 'footer') <> 'object'
     or jsonb_typeof(p_composition -> 'decorativeAssets') <> 'array'
     or jsonb_typeof(p_composition -> 'safeArea') <> 'object'
     or (
       p_composition -> 'artwork' <> 'null'::jsonb
       and jsonb_typeof(p_composition -> 'artwork') <> 'object'
     ) then
    return jsonb_build_object(
      'valid', false,
      'code', 'INVALID_COMPOSITION_SECTION_TYPE'
    );
  end if;

  v_safe_area := p_composition -> 'safeArea';
  if not (v_safe_area ? 'top')
     or not (v_safe_area ? 'right')
     or not (v_safe_area ? 'bottom')
     or not (v_safe_area ? 'left')
     or jsonb_typeof(v_safe_area -> 'top') <> 'number'
     or jsonb_typeof(v_safe_area -> 'right') <> 'number'
     or jsonb_typeof(v_safe_area -> 'bottom') <> 'number'
     or jsonb_typeof(v_safe_area -> 'left') <> 'number'
     or (v_safe_area ->> 'top')::numeric < 0
     or (v_safe_area ->> 'right')::numeric < 0
     or (v_safe_area ->> 'bottom')::numeric < 0
     or (v_safe_area ->> 'left')::numeric < 0
     or (v_safe_area ->> 'top')::numeric > 1920
     or (v_safe_area ->> 'bottom')::numeric > 1920
     or (v_safe_area ->> 'left')::numeric > 1080
     or (v_safe_area ->> 'right')::numeric > 1080 then
    return jsonb_build_object(
      'valid', false,
      'code', 'INVALID_SAFE_AREA'
    );
  end if;

  v_artwork := p_composition -> 'artwork';
  if v_artwork <> 'null'::jsonb then
    if not (v_artwork ? 'assetId')
       or not (v_artwork ? 'placement')
       or not (v_artwork ? 'focalX')
       or not (v_artwork ? 'focalY')
       or not (v_artwork ? 'scale')
       or not (v_artwork ? 'opacity')
       or not (v_artwork ? 'blurPx')
       or not (v_artwork ? 'fadeDirection')
       or not (v_artwork ? 'scrimStrength')
       or nullif(v_artwork ->> 'assetId', '') is null
       or coalesce(v_artwork ->> 'placement', '') not in (
         'top', 'top_fade', 'background', 'bottom', 'bottom_fade', 'full'
       )
       or coalesce(v_artwork ->> 'scale', '') not in ('cover', 'contain')
       or coalesce(v_artwork ->> 'fadeDirection', '') not in (
         'none', 'up', 'down', 'radial'
       )
       or jsonb_typeof(v_artwork -> 'focalX') <> 'number'
       or jsonb_typeof(v_artwork -> 'focalY') <> 'number'
       or jsonb_typeof(v_artwork -> 'opacity') <> 'number'
       or jsonb_typeof(v_artwork -> 'blurPx') <> 'number'
       or jsonb_typeof(v_artwork -> 'scrimStrength') <> 'number'
       or (v_artwork ->> 'focalX')::numeric not between 0 and 1
       or (v_artwork ->> 'focalY')::numeric not between 0 and 1
       or (v_artwork ->> 'opacity')::numeric not between 0 and 1
       or (v_artwork ->> 'blurPx')::numeric not between 0 and 100
       or (v_artwork ->> 'scrimStrength')::numeric not between 0 and 1
       or (
         v_artwork ? 'fadeStart'
         and (
           jsonb_typeof(v_artwork -> 'fadeStart') <> 'number'
           or (v_artwork ->> 'fadeStart')::numeric not between 0 and 1
         )
       )
       or (
         v_artwork ? 'fadeEnd'
         and (
           jsonb_typeof(v_artwork -> 'fadeEnd') <> 'number'
           or (v_artwork ->> 'fadeEnd')::numeric not between 0 and 1
         )
       ) then
      return jsonb_build_object(
        'valid', false,
        'code', 'INVALID_ARTWORK_TREATMENT'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', 'OK'
  );
end
$validate$;

revoke all on function private.v3_validate_jury_share_theme_composition(jsonb)
  from public, anon, authenticated;

commit;
