alter table public.country_themes
  add column if not exists button_color text null;

comment on column public.country_themes.button_color is
  'Optional explicit action/button colour for Country and Wiki theme. NULL follows the country accent automatically.';
