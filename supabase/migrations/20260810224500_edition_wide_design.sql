-- ============================================================
-- EDITION-WIDE DESIGN + BROADCAST SETTINGS
--
-- One edition owns:
--   * theme_id
--   * broadcast_config
--
-- Every show automatically inherits those values.
-- Scoreboard geometry is NOT stored edition-wide. That is resolved
-- at render time from each show's participant count, so a small semi
-- can use 1 column while a large final can use 2 or 3.
-- ============================================================

alter table public.editions
  add column if not exists broadcast_config jsonb;

-- ------------------------------------------------------------
-- BACKFILL EXISTING EDITIONS
--
-- Theme:
--   Prefer an existing edition theme_id.
--   Otherwise use the first show theme we can find.
--
-- Broadcast:
--   Use an existing show broadcast config as a starting point,
--   but deliberately REMOVE "scoreboard". The scoreboard layout
--   must stay show-size-aware instead of being frozen to one show.
-- ------------------------------------------------------------

update public.editions e
set theme_id = coalesce(
  e.theme_id,
  (
    select s.theme_id
    from public.shows s
    where s.edition_id = e.id
      and s.theme_id is not null
    order by
      case when s.kind = 'grand-final' then 0 else 1 end,
      s.sort_order
    limit 1
  )
)
where e.theme_id is null;

update public.editions e
set broadcast_config = coalesce(
  e.broadcast_config,
  (
    select
      case
        when s.broadcast_config is null then '{}'::jsonb
        else s.broadcast_config - 'scoreboard'
      end
    from public.shows s
    where s.edition_id = e.id
      and s.broadcast_config is not null
    order by
      case when s.kind = 'grand-final' then 0 else 1 end,
      s.sort_order
    limit 1
  ),
  '{}'::jsonb
)
where e.broadcast_config is null;

-- ------------------------------------------------------------
-- INITIAL SYNC
--
-- This intentionally removes old per-show saved scoreboard objects.
-- The edition theme now owns visual styling, while each show gets
-- automatic layout based on its own participant count.
-- ------------------------------------------------------------

update public.shows s
set
  theme_id = e.theme_id,
  broadcast_config = coalesce(e.broadcast_config, '{}'::jsonb)
from public.editions e
where e.id = s.edition_id;

-- ------------------------------------------------------------
-- WHEN AN EDITION DESIGN CHANGES, SYNC ALL ITS SHOWS
-- ------------------------------------------------------------

create or replace function public.sync_edition_design_to_shows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shows
  set
    theme_id = new.theme_id,
    broadcast_config = coalesce(new.broadcast_config, '{}'::jsonb)
  where edition_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_sync_edition_design_to_shows
on public.editions;

create trigger trg_sync_edition_design_to_shows
after update of theme_id, broadcast_config
on public.editions
for each row
execute function public.sync_edition_design_to_shows();

-- ------------------------------------------------------------
-- NEW SHOWS AUTOMATICALLY INHERIT THE EDITION DESIGN
-- ------------------------------------------------------------

create or replace function public.inherit_edition_design_on_show()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.editions;
begin
  select *
  into e
  from public.editions
  where id = new.edition_id;

  if e.id is not null then
    new.theme_id := e.theme_id;
    new.broadcast_config := coalesce(e.broadcast_config, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inherit_edition_design_on_show
on public.shows;

create trigger trg_inherit_edition_design_on_show
before insert
on public.shows
for each row
execute function public.inherit_edition_design_on_show();

-- ------------------------------------------------------------
-- PERMISSIONS
--
-- Existing editions RLS remains authoritative. No new public write
-- permission is granted here.
-- ------------------------------------------------------------
