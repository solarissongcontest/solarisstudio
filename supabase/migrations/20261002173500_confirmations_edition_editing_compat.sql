-- Canonical Confirmations compatibility: edition-level response-editing gate.
--
-- The dedicated legacy Confirmations project stored this flag on its editions
-- table. Solaris Studio already had a canonical editions table when the
-- Confirmations schema was integrated, so CREATE TABLE IF NOT EXISTS never
-- added the legacy column on a clean replay. Keep the compatibility flag here
-- because the public edit-token and organizer Confirmations RPC contracts
-- intentionally require both edition- and round-level editing gates.

alter table public.editions
  add column if not exists editing_enabled boolean not null default true;

comment on column public.editions.editing_enabled is
  'Confirmations compatibility gate for editing existing delegation responses. Does not control public edition publication.';

update public.editions
set editing_enabled = true
where editing_enabled is null;
