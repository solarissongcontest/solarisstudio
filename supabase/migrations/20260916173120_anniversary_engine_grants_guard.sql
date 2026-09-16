begin;

-- This migration is already applied in production. CREATE OR REPLACE preserved
-- the existing grants; this explicit guard records that public RPC contract and
-- keeps repository migration history aligned with the live database.
revoke all on function public.studio2_anniversary_engine(date, integer) from public;
grant execute on function public.studio2_anniversary_engine(date, integer) to anon, authenticated, service_role;

commit;
