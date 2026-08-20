begin;

alter table public.country_themes
  drop constraint if exists country_themes_hero_layout_check;

alter table public.country_themes
  add constraint country_themes_hero_layout_check
  check (hero_layout in (
    'classic',
    'editorial',
    'minimal',
    'flag-focus',
    'poster',
    'split',
    'spotlight',
    'broadcast',
    'panorama',
    'monument',
    'glass-card',
    'newspaper',
    'ribbon',
    'duotone',
    'passport',
    'horizon'
  ));

notify pgrst, 'reload schema';

commit;
