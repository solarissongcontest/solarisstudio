create or replace function public.preserve_edition_public_design_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _key text;
  _keys text[] := array[
    'publicStyle',
    'publicRadius',
    'publicSurfaceStrength',
    'publicHeroGlow',
    'publicAccentGradient',
    'publicSurfaceGradient'
  ];
begin
  if old.theme_colors is null or jsonb_typeof(old.theme_colors) <> 'object' then
    return new;
  end if;
  if new.theme_colors is null or jsonb_typeof(new.theme_colors) <> 'object' then
    return new;
  end if;

  foreach _key in array _keys loop
    if not (new.theme_colors ? _key) and (old.theme_colors ? _key) then
      new.theme_colors := new.theme_colors || jsonb_build_object(_key, old.theme_colors -> _key);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_preserve_edition_public_design_metadata on public.editions;
create trigger trg_preserve_edition_public_design_metadata
before update of theme_colors on public.editions
for each row execute function public.preserve_edition_public_design_metadata();
