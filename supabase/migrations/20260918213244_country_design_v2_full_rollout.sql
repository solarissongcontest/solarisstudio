begin;

-- Complete the Country/Wiki Design V2 rollout without discarding V1 rollback data.
-- This mirrors legacyThemeToCountryDesignV2() for every currently published V1
-- country theme, with one preservation improvement: the legacy flag_enabled
-- preference becomes V2 hero.showFlag.

update public.country_themes t
set
  design_v2 = jsonb_build_object(
    'version', 2,
    'surface', case t.hero_layout
      when 'glass-card' then 'glass'
      when 'water-drop' then 'glass'
      when 'editorial' then 'editorial'
      when 'newspaper' then 'editorial'
      when 'monument' then 'editorial'
      when 'heritage' then 'opaque'
      when 'poster' then 'opaque'
      when 'ribbon' then 'transparent'
      when 'duotone' then 'opaque'
      when 'minimal' then 'transparent'
      when 'spotlight' then 'gradient'
      when 'broadcast' then 'opaque'
      when 'panorama' then 'transparent'
      when 'passport' then 'opaque'
      when 'horizon' then 'opaque'
      when 'sci-fi' then 'glass'
      when 'flag-focus' then 'opaque'
      when 'classic' then 'opaque'
      when 'split' then 'opaque'
      else 'opaque'
    end,
    'typography', jsonb_build_object(
      'display', jsonb_build_object(
        'id', 'crastao',
        'label', 'Classica Crastao',
        'category', 'Solaris recommended',
        'family', '"Classica Crastao", Georgia, serif',
        'source', 'solaris'
      ),
      'heading', jsonb_build_object(
        'id', 'gotham',
        'label', 'Gotham',
        'category', 'Solaris recommended',
        'family', '"Gotham", ui-sans-serif, system-ui, sans-serif',
        'source', 'solaris'
      ),
      'body', jsonb_build_object(
        'id', 'gotham',
        'label', 'Gotham',
        'category', 'Solaris recommended',
        'family', '"Gotham", ui-sans-serif, system-ui, sans-serif',
        'source', 'solaris'
      )
    ),
    'hero', jsonb_build_object(
      'layout', case t.hero_layout
        when 'glass-card' then 'centered'
        when 'water-drop' then 'split'
        when 'editorial' then 'left'
        when 'newspaper' then 'left'
        when 'monument' then 'split'
        when 'heritage' then 'left'
        when 'poster' then 'poster'
        when 'ribbon' then 'poster'
        when 'duotone' then 'split'
        when 'minimal' then 'compact'
        when 'spotlight' then 'cinematic'
        when 'broadcast' then 'split'
        when 'panorama' then 'split'
        when 'passport' then 'split'
        when 'horizon' then 'split'
        when 'sci-fi' then 'split'
        when 'flag-focus' then 'left'
        when 'classic' then 'split'
        when 'split' then 'split'
        else 'split'
      end,
      'alignment', case t.hero_layout when 'glass-card' then 'center' else 'left' end,
      'showFlag', coalesce(t.flag_enabled, true),
      'showNativeName', true,
      'showMotto', true
    ),
    'content', jsonb_build_object(
      'defaultLayout', case t.hero_layout
        when 'glass-card' then 'showcase'
        when 'water-drop' then 'showcase'
        when 'editorial' then 'magazine'
        when 'newspaper' then 'encyclopedia'
        when 'monument' then 'magazine'
        when 'heritage' then 'encyclopedia'
        when 'poster' then 'showcase'
        when 'ribbon' then 'magazine'
        when 'duotone' then 'dashboard'
        when 'minimal' then 'wiki'
        when 'spotlight' then 'showcase'
        when 'broadcast' then 'dashboard'
        when 'panorama' then 'showcase'
        when 'passport' then 'encyclopedia'
        when 'horizon' then 'dashboard'
        when 'sci-fi' then 'dashboard'
        when 'flag-focus' then 'wiki'
        when 'classic' then 'wiki'
        when 'split' then 'wiki'
        else 'wiki'
      end
    ),
    'accent', case t.hero_layout
      when 'glass-card' then 'soft'
      when 'water-drop' then 'futuristic'
      when 'editorial' then 'minimal'
      when 'newspaper' then 'minimal'
      when 'monument' then 'luxury'
      when 'heritage' then 'luxury'
      when 'poster' then 'bold'
      when 'ribbon' then 'bold'
      when 'duotone' then 'brutalist'
      when 'minimal' then 'minimal'
      when 'spotlight' then 'bold'
      when 'broadcast' then 'bold'
      when 'panorama' then 'organic'
      when 'passport' then 'retro'
      when 'horizon' then 'futuristic'
      when 'sci-fi' then 'futuristic'
      when 'flag-focus' then 'minimal'
      when 'classic' then 'minimal'
      when 'split' then 'minimal'
      else 'minimal'
    end,
    'motion', 'subtle',
    'palette', jsonb_build_object(
      'backgroundPrimary', t.background_primary,
      'backgroundSecondary', t.background_secondary,
      'backgroundTertiary', t.background_tertiary,
      'accent', t.accent,
      'textPrimary', t.text_primary,
      'textMuted', t.text_muted,
      'surface', t.surface
    ),
    'background', jsonb_build_object(
      'mode', t.background_mode,
      'gradientStyle', t.gradient_style,
      'gradientAngle', t.gradient_angle,
      'imageUrl', t.background_image_url,
      'imageStoragePath', t.background_image_storage_path,
      'positionX', t.background_position_x,
      'positionY', t.background_position_y,
      'overlay', t.background_overlay,
      'blur', t.background_blur
    ),
    'tuning', jsonb_build_object(
      'radius', 18,
      'spacing', 1,
      'contentWidth', 1180,
      'shadowDepth', 0.42,
      'transparency', 0.78
    )
  ),
  design_version = 2,
  updated_at = now()
where coalesce(t.design_version, 1) = 1;

do $verify$
declare
  v_remaining bigint;
  v_invalid bigint;
begin
  select count(*) into v_remaining
  from public.country_themes
  where coalesce(design_version, 1) <> 2 or design_v2 is null;

  if v_remaining <> 0 then
    raise exception 'Country Design V2 rollout incomplete: % theme rows remain on V1', v_remaining;
  end if;

  select count(*) into v_invalid
  from public.country_themes
  where design_v2 ->> 'version' <> '2'
     or design_v2 -> 'hero' ->> 'layout' not in ('centered','left','split','cinematic','poster','compact')
     or design_v2 ->> 'surface' not in ('opaque','transparent','glass','gradient','elevated','editorial')
     or design_v2 -> 'content' ->> 'defaultLayout' not in ('wiki','encyclopedia','magazine','dashboard','showcase','timeline');

  if v_invalid <> 0 then
    raise exception 'Country Design V2 rollout produced invalid documents: %', v_invalid;
  end if;
end
$verify$;

commit;
