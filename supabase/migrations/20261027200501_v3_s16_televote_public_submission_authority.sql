begin;

select public.v3_register_migration_contract(
  'v3.televote.public-submission-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 hardens the one-shot public Televote ballot writer and removes the obsolete bypass RPC'
);

-- submit_vote_checked is the retained public ballot authority. It already owns
-- the one-shot preflight, open-round validation, duplicate checks, ballot
-- validation and atomic submission+entry insert. Harden its SECURITY DEFINER
-- namespace without changing that established public voting contract.
alter function televoting.submit_vote_checked(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) set search_path = pg_catalog, televoting, pg_temp;

revoke all on function televoting.submit_vote_checked(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) from public, service_role;
grant execute on function televoting.submit_vote_checked(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) to anon, authenticated;

comment on function televoting.submit_vote_checked(
  uuid,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  boolean
) is
  'S16 canonical public Televote ballot writer. One-shot integrity preflight plus open-round validation; retry ambiguity is resolved by v3_reconcile_televote.';

-- The pre-preflight RPC has no production caller and has already had anon /
-- authenticated EXECUTE revoked since 2026-08-19. Keeping executable dead code
-- is still a second mutation surface, so remove it rather than calling it
-- "legacy" forever.
drop function if exists televoting.submit_vote(
  uuid,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  boolean
);

notify pgrst, 'reload schema';
commit;
