begin;

alter table public.country_themes
  add column if not exists hero_visual_mode text not null default 'auto',
  add column if not exists hero_decoration text not null default 'auto';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'country_themes_hero_visual_mode_check'
      and conrelid = 'public.country_themes'::regclass
  ) then
    alter table public.country_themes
      add constraint country_themes_hero_visual_mode_check
      check (hero_visual_mode in ('auto', 'flag', 'soft-flag', 'none'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'country_themes_hero_decoration_check'
      and conrelid = 'public.country_themes'::regclass
  ) then
    alter table public.country_themes
      add constraint country_themes_hero_decoration_check
      check (hero_decoration in ('auto', 'none', 'glow', 'ribbon', 'lines', 'seal', 'starburst', 'contours', 'glass'));
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
