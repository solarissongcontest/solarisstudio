-- ============================================================
-- REMOVE THE OBSOLETE EDITION BROADCAST SYNC
--
-- The current design editor stores the shared visual theme on the
-- edition and writes show-size-aware broadcast/scoreboard settings
-- directly to each show. Round-specific overrides also live on shows.
--
-- An older migration added editions.broadcast_config plus triggers
-- that copied it back over every show. If that migration is applied,
-- those triggers can silently erase round overrides and make newly
-- created shows inherit stale broadcast settings.
--
-- Every statement is defensive so this is safe whether or not the
-- obsolete migration reached a particular environment.
-- ============================================================

drop trigger if exists trg_sync_edition_design_to_shows
on public.editions;

drop trigger if exists trg_inherit_edition_design_on_show
on public.shows;

drop function if exists public.sync_edition_design_to_shows();
drop function if exists public.inherit_edition_design_on_show();

alter table public.editions
  drop column if exists broadcast_config;
