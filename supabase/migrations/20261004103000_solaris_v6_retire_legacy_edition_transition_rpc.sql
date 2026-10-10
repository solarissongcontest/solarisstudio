begin;

-- Solaris Studio V6 canonical edition authority cutover.
--
-- The client and protected Organizer surfaces use studio2_transition_edition_v2.
-- Retire the pre-approval legacy transition RPC so there is only one browser-
-- callable edition lifecycle mutation authority.

revoke all on function public.studio2_transition_edition(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

drop function if exists public.studio2_transition_edition(uuid, text, text, uuid);

notify pgrst, 'reload schema';

commit;
