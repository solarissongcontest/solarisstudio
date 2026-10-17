begin;

-- System V3 / S14 Stage 7 prerequisite.
--
-- Older Solaris Televoting rounds have no persisted close/deadline column.
-- The governed deadline migration that follows installs triggers and RPCs on
-- rounds.closes_at, so clean replay and production-head upgrade must establish
-- the nullable compatibility column first. Existing rows intentionally remain
-- NULL: Solaris has no canonical historical/default Televote duration from
-- which a safe deadline can be inferred.
alter table televoting.rounds
  add column if not exists closes_at timestamptz;

comment on column televoting.rounds.closes_at is
  'Authoritative server-side Televote acceptance deadline. NULL preserves explicitly unbounded legacy rounds until governed configuration.';

commit;
