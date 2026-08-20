begin;

alter table public.country_themes
  add column if not exists decoration_style text not null default 'auto';

alter table public.country_themes
  drop constraint if exists country_themes_decoration_style_check;

alter table public.country_themes
  add constraint country_themes_decoration_style_check
  check (decoration_style in ('auto','none','flag','orbits','rays','grid','waves'));

notify pgrst, 'reload schema';

commit;
