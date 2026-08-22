create or replace function public.sync_edition_palette_to_linked_themes(_edition_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _colors jsonb;
  _primary text;
  _secondary text;
  _accent text;
  _surface text;
  _text text;
  _muted text;
  _theme_id uuid;
  _cfg jsonb;
  _scoreboard jsonb;
  _scoreboard_bg jsonb;
  _count integer := 0;
begin
  select coalesce(theme_colors, '{}'::jsonb)
    into _colors
  from public.editions
  where id = _edition_id;

  if _colors is null then
    return 0;
  end if;

  _primary := coalesce(_colors ->> 'backgroundPrimary', '#0b1024');
  _secondary := coalesce(_colors ->> 'backgroundSecondary', _primary);
  _accent := coalesce(_colors ->> 'accent', _primary);
  _surface := coalesce(_colors ->> 'surface', _primary);
  _text := coalesce(_colors ->> 'textPrimary', '#f4f7ff');
  _muted := coalesce(_colors ->> 'textMuted', _text);

  for _theme_id in
    select distinct theme_id
    from (
      select e.theme_id
      from public.editions e
      where e.id = _edition_id
      union all
      select s.theme_id
      from public.shows s
      where s.edition_id = _edition_id
    ) ids
    where theme_id is not null
  loop
    select coalesce(config, '{}'::jsonb)
      into _cfg
    from public.themes
    where id = _theme_id;

    if _cfg is null then
      continue;
    end if;

    _cfg := jsonb_set(_cfg, '{background}',
      coalesce(_cfg -> 'background', '{}'::jsonb) || jsonb_build_object(
        'color', _primary,
        'gradientFrom', _primary,
        'gradientTo', _secondary
      ), true);

    _cfg := jsonb_set(_cfg, '{colors}',
      coalesce(_cfg -> 'colors', '{}'::jsonb) || jsonb_build_object(
        'primary', _primary,
        'secondary', _secondary,
        'accent', _accent,
        'text', _text,
        'jury', _accent,
        'televote', _secondary
      ), true);

    _cfg := jsonb_set(_cfg, '{chrome}',
      coalesce(_cfg -> 'chrome', '{}'::jsonb) || jsonb_build_object(
        'headerBackground', _primary,
        'headerText', _text,
        'panelBackground', _surface,
        'panelText', _text,
        'progressTrack', _secondary,
        'progressFill', _accent,
        'spokespersonBackground', _surface,
        'spokespersonText', _text,
        'spokespersonAccent', _accent
      ), true);

    _cfg := jsonb_set(_cfg, '{states}',
      coalesce(_cfg -> 'states', '{}'::jsonb) || jsonb_build_object(
        'leaderBackground', _surface,
        'leaderBorder', _accent,
        'leaderText', _text,
        'highlight', _accent,
        'votingBackground', _secondary,
        'votingText', _text,
        'selected', _accent,
        'hover', _surface,
        'qualified', _accent
      ), true);

    if jsonb_typeof(_cfg -> 'scoreboardConfig') = 'object' then
      _scoreboard := _cfg -> 'scoreboardConfig';
      _scoreboard_bg := coalesce(_scoreboard -> 'background', '{}'::jsonb)
        || jsonb_build_object(
          'color', _primary,
          'gradientFrom', _primary,
          'gradientTo', _secondary
        );
      _scoreboard := jsonb_set(_scoreboard, '{background}', _scoreboard_bg, true);
      _cfg := jsonb_set(_cfg, '{scoreboardConfig}', _scoreboard, true);
    end if;

    update public.themes
    set config = _cfg
    where id = _theme_id;

    _count := _count + 1;
  end loop;

  return _count;
end;
$$;

create or replace function public.sync_edition_palette_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.theme_colors is distinct from new.theme_colors then
    perform public.sync_edition_palette_to_linked_themes(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_edition_palette_after_change on public.editions;
create trigger trg_sync_edition_palette_after_change
after update of theme_colors on public.editions
for each row
when (old.theme_colors is distinct from new.theme_colors)
execute function public.sync_edition_palette_after_change();

select public.sync_edition_palette_to_linked_themes(id) from public.editions;