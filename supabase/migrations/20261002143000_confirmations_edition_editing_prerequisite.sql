-- Confirmations admin runtime prerequisite.
--
-- The canonical Solaris editions table predates the legacy Confirmations
-- edition-level editing gate. Admin RPCs introduced immediately after this
-- migration reference public.editions.editing_enabled, so the compatibility
-- column must exist before those function bodies are created during upgrades
-- from current main as well as during a clean replay.

alter table public.editions
  add column if not exists editing_enabled boolean not null default true;

comment on column public.editions.editing_enabled is
  'Confirmations compatibility gate for editing existing delegation responses. Does not control public edition publication.';
