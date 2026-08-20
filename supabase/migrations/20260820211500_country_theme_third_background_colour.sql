begin;

alter table public.country_themes
  add column if not exists background_tertiary text;

alter table public.country_themes
  drop constraint if exists country_themes_background_tertiary_hex;

alter table public.country_themes
  add constraint country_themes_background_tertiary_hex
  check (background_tertiary is null or background_tertiary ~ '^#[0-9A-Fa-f]{6}$');

commit;
